import { ipcMain, shell, BrowserWindow, dialog, app } from 'electron'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { db, getSetting, setSetting } from './db'
import {
  searchLocal, searchRemote, getDependencies,
  syncCatalog, getSyncStatus, getModDetail, checkProfileUpdates,
  getGameId,
} from './catalog'
import { resolveDependencies, validateSelection } from './resolver'
import { getDefaultModsPath, scanModJars } from './jarScanner'
import {
  dbRowsToConflictSubjects,
  getCustomRuleConflicts,
  jarModsToConflictSubjects,
} from './conflicts'
import { launchMinecraftProfile, resolveOrInstallVersion } from './launcher'
import { ensureGameFiles } from './gameFiles'
import { launchGameDirect, stopGame } from './gameLaunch'
import { downloadFile } from './download'
import { getProfileModsPath, getProfileStoragePath } from './profilePaths'
import { importMrpackFromFile } from './mrpack'
import { startDeviceAuth, cancelDeviceAuth, getAuthStatus, logout as authLogout, setClientId, getClientId, setOfflineConfig } from './auth'

function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

function upsertImportedMod(mod: any, profile: any): { modId: number; versionId: number } {
  const gameId = getGameId()
  const projectId = String(mod.project_id)
  const versionId = mod.version_id
    ? String(mod.version_id)
    : `imported:${projectId}:${mod.version_number ?? mod.file_name ?? 'unknown'}`

  const modRow = db.prepare(`
    INSERT INTO mods
      (game_id, modrinth_id, slug, name, description, icon_url, categories, loaders, downloads)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(modrinth_id) DO UPDATE SET
      slug = COALESCE(excluded.slug, mods.slug),
      name = excluded.name,
      description = COALESCE(excluded.description, mods.description),
      icon_url = COALESCE(excluded.icon_url, mods.icon_url),
      categories = excluded.categories,
      loaders = excluded.loaders,
      synced_at = CURRENT_TIMESTAMP
    RETURNING id
  `).get(
    gameId,
    projectId,
    mod.slug ?? projectId,
    mod.name ?? mod.slug ?? projectId,
    mod.description ?? null,
    mod.icon_url ?? null,
    JSON.stringify(mod.categories ?? []),
    JSON.stringify(mod.loaders ?? (profile?.loader ? [String(profile.loader).toLowerCase()] : [])),
    mod.downloads ?? 0,
  ) as { id: number }

  const versionRow = db.prepare(`
    INSERT INTO mod_versions
      (mod_id, modrinth_ver_id, version_number, game_versions, loaders,
       file_url, file_name, file_size, file_hash_sha1)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(modrinth_ver_id) DO UPDATE SET
      mod_id = excluded.mod_id,
      version_number = excluded.version_number,
      game_versions = excluded.game_versions,
      loaders = excluded.loaders,
      file_url = excluded.file_url,
      file_name = excluded.file_name,
      file_size = excluded.file_size,
      file_hash_sha1 = excluded.file_hash_sha1,
      synced_at = CURRENT_TIMESTAMP
    RETURNING id
  `).get(
    modRow.id,
    versionId,
    mod.version_number ?? 'unknown',
    JSON.stringify(mod.game_versions ?? (profile?.game_version ? [profile.game_version] : [])),
    JSON.stringify(mod.loaders ?? (profile?.loader ? [String(profile.loader).toLowerCase()] : [])),
    mod.file_url ?? null,
    mod.file_name ?? null,
    mod.file_size ?? null,
    mod.sha1 ?? null,
  ) as { id: number }

  return { modId: modRow.id, versionId: versionRow.id }
}

// existsSync는 깨진 심볼릭 링크를 false로 판정하므로 lstat으로 직접 확인
function statNoFollow(targetPath: string): fs.Stats | null {
  try {
    return fs.lstatSync(targetPath)
  } catch {
    return null
  }
}

function removeJunctionIfExists(targetDir: string): boolean {
  const stat = statNoFollow(targetDir)
  if (stat?.isSymbolicLink()) {
    fs.unlinkSync(targetDir)
    return true
  }
  return false
}

// 프로필 보관소를 게임 mods 폴더에 junction으로 연결 (활성화/실행 양쪽에서 사용)
function activateProfileInternal(profileId: string): {
  ok: boolean
  storagePath?: string
  targetPath?: string
  backupPath?: string | null
  adoptedFiles?: number
  error?: string
} {
  try {
    const profile = db.prepare('SELECT id, name, install_path FROM profiles WHERE id = ?').get(profileId) as
      { id: number; name: string; install_path?: string | null } | undefined
    if (!profile) return { ok: false, error: '프로필을 찾을 수 없습니다.' }

    const targetDir = path.resolve(getDefaultModsPath())

    // install_path가 게임 mods 폴더 자체를 가리키면 순환 링크가 되므로 전용 보관소로 대체
    let storageDir = profile.install_path ? path.resolve(profile.install_path) : ''
    if (!storageDir || storageDir === targetDir) {
      storageDir = getProfileStoragePath(profile.id)
    }
    fs.mkdirSync(storageDir, { recursive: true })

    let backupPath: string | null = null
    let adoptedFiles = 0

    const targetStat = statNoFollow(targetDir)
    if (targetStat?.isSymbolicLink()) {
      fs.unlinkSync(targetDir)
    } else if (targetStat) {
      // 실제 폴더가 있으면: 보관소가 비어있을 때 기존 모드를 프로필로 흡수하고, 원본은 백업으로 보존
      if (fs.readdirSync(storageDir).length === 0) {
        for (const entry of fs.readdirSync(targetDir)) {
          fs.cpSync(path.join(targetDir, entry), path.join(storageDir, entry), { recursive: true })
          adoptedFiles++
        }
      }
      backupPath = `${targetDir}_backup_${Date.now()}`
      fs.renameSync(targetDir, backupPath)
    } else {
      fs.mkdirSync(path.dirname(targetDir), { recursive: true })
    }

    fs.symlinkSync(storageDir, targetDir, 'junction')
    console.log(`[IPC] 프로필 ${profile.name} 활성화: ${targetDir} -> ${storageDir}`)

    db.transaction(() => {
      db.prepare('UPDATE profiles SET is_active = 0').run()
      db.prepare('UPDATE profiles SET is_active = 1, install_path = ? WHERE id = ?').run(storageDir, profileId)
    })()

    return { ok: true, storagePath: storageDir, targetPath: targetDir, backupPath, adoptedFiles }
  } catch (err: any) {
    console.error('[IPC] 프로필 활성화 실패:', err)
    return { ok: false, error: err.message }
  }
}

function createModsBackup(modsDir: string, label = 'manual'): string | null {
  const resolvedModsDir = path.resolve(modsDir)
  if (!fs.existsSync(resolvedModsDir)) return null

  const backupRoot = path.join(app.getPath('userData'), 'backups')
  fs.mkdirSync(backupRoot, { recursive: true })

  const safeLabel = label.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'backup'
  const backupPath = path.join(backupRoot, `${safeLabel}-${new Date().toISOString().replace(/[:.]/g, '-')}`)
  fs.cpSync(resolvedModsDir, backupPath, { recursive: true })
  return backupPath
}

export function registerHandlers(win: BrowserWindow): void {

  // 의존성 해결 (DFS)
  ipcMain.handle('resolve-deps', async (_e, modrinthId: string, opts = {}) => {
    try {
      const result = await resolveDependencies(modrinthId, opts)
      return result
    } catch (err: any) {
      return { ok: false, error: err.message, root: null, installOrder: [], required: [], optional: [], conflicts: [], pinConflicts: [] }
    }
  })

  // 선택 검증
  ipcMain.handle('validate-selection', async (_e, modrinthIds: string[], opts = {}) => {
    try {
      return await validateSelection(modrinthIds, opts)
    } catch (err: any) {
      return { ok: false, conflicts: [], error: err.message }
    }
  })

  ipcMain.handle('scan-mod-jars', async (_e, modsPath?: string) => {
    try {
      return { ok: true, mods: scanModJars(modsPath || getDefaultModsPath()) }
    } catch (err: any) {
      return { ok: false, mods: [], error: err.message }
    }
  })

  ipcMain.handle('validate-install-plan', async (_e, data: {
    profileId: string
    selectedMods: any[]
    installPath?: string
    gameVersion?: string
    loader?: string
  }) => {
    try {
      const installedRows = db.prepare(`
        SELECT m.modrinth_id, m.slug, m.name, mv.version_number
        FROM profile_mods pm
        JOIN mods m ON pm.mod_id = m.id
        LEFT JOIN mod_versions mv ON pm.mod_version_id = mv.id
        WHERE pm.profile_id = ?
      `).all(data.profileId)

      const scannedJars = scanModJars(data.installPath || getDefaultModsPath())
      const subjects = [
        ...dbRowsToConflictSubjects(installedRows),
        ...jarModsToConflictSubjects(scannedJars),
        ...dbRowsToConflictSubjects(data.selectedMods ?? [], 'selection'),
      ]

      const customConflicts = getCustomRuleConflicts(subjects, {
        gameVersion: data.gameVersion,
        loader: data.loader,
      })

      const selectedIds = [
        ...installedRows.map((row: any) => row.modrinth_id).filter(Boolean),
        ...(data.selectedMods ?? []).map((row: any) => row.modrinth_id).filter(Boolean),
      ]
      const modrinthValidation = await validateSelection(selectedIds, {
        gameVersion: data.gameVersion,
        loader: data.loader,
      })

      const modrinthConflicts = modrinthValidation.conflicts.map((conflict) => ({
        type: 'modrinth' as const,
        severity: 'blocker' as const,
        a: subjects.find((subject) => subject.modrinth_id === conflict.a) ?? { modrinth_id: conflict.a },
        b: subjects.find((subject) => subject.modrinth_id === conflict.b) ?? { modrinth_id: conflict.b },
        reason: 'Modrinth 의존성 정보에서 incompatible 관계로 표시된 조합입니다.',
        source: 'modrinth',
      }))

      const conflicts = [...modrinthConflicts, ...customConflicts]

      return {
        ok: conflicts.every((conflict) => conflict.severity !== 'blocker'),
        conflicts,
        scannedJars,
      }
    } catch (err: any) {
      return { ok: false, conflicts: [], scannedJars: [], error: err.message }
    }
  })

  // 모드 검색
  ipcMain.handle('search-mod', async (_e, query: string, opts = {}) => {
    try {
      const local = await searchLocal(query, opts)
      if (local.length >= 3) return { results: local, source: 'local' }

      console.log(`[IPC] DB 결과 부족(${local.length}) → API fallback`)
      const remote = await searchRemote(query, opts)
      return { results: [...local, ...remote], source: local.length ? 'mixed' : 'api' }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('get-recommendations', async (_e, data: {
    profileId: string
    loader?: string
    gameVersion?: string
    limit?: number
  }) => {
    try {
      const limit = data.limit ?? 12
      const installed = db.prepare(`
        SELECT m.modrinth_id, m.name, m.categories, m.loaders
        FROM profile_mods pm
        JOIN mods m ON pm.mod_id = m.id
        WHERE pm.profile_id = ?
      `).all(data.profileId) as any[]

      const installedIds = new Set(installed.map((mod) => mod.modrinth_id))
      const categoryScores = new Map<string, number>()

      for (const mod of installed) {
        for (const category of parseJsonArray(mod.categories)) {
          categoryScores.set(category, (categoryScores.get(category) ?? 0) + 1)
        }
      }

      const candidates = db.prepare(`
        SELECT
          m.id, m.modrinth_id, m.name, m.slug, m.description,
          m.icon_url, m.downloads, m.categories, m.loaders,
          mv.id AS ver_id, mv.modrinth_ver_id, mv.version_number,
          mv.file_url, mv.file_name,
          MAX(mv.published_at) AS latest_published_at
        FROM mods m
        JOIN mod_versions mv ON mv.mod_id = m.id
        WHERE (? IS NULL OR LOWER(mv.loaders) LIKE ?)
          AND (? IS NULL OR mv.game_versions LIKE ?)
        GROUP BY m.id
        ORDER BY m.downloads DESC
        LIMIT 250
      `).all(
        data.loader ?? null,
        data.loader ? `%"${data.loader.toLowerCase()}"%` : null,
        data.gameVersion ?? null,
        data.gameVersion ? `%"${data.gameVersion}"%` : null,
      ) as any[]

      const recommendations = candidates
        .filter((mod) => !installedIds.has(mod.modrinth_id))
        .map((mod) => {
          const categories = parseJsonArray(mod.categories)
          const matchedCategories = categories.filter((category) => categoryScores.has(category))
          const affinityScore = matchedCategories.reduce((sum, category) => sum + (categoryScores.get(category) ?? 0), 0)
          const popularityScore = Math.log10((mod.downloads ?? 0) + 10)
          const score = affinityScore * 8 + popularityScore

          return {
            ...mod,
            categories,
            loaders: parseJsonArray(mod.loaders),
            recommendation_score: score,
            recommendation_reason: matchedCategories.length
              ? `설치된 모드와 ${matchedCategories.slice(0, 3).join(', ')} 성향이 겹칩니다.`
              : installed.length
                ? '현재 프로필 버전과 로더에서 많이 쓰이는 인기 모드입니다.'
                : '프로필 버전과 로더에 맞는 인기 모드입니다.',
          }
        })
        .sort((a, b) => b.recommendation_score - a.recommendation_score || b.downloads - a.downloads)
        .slice(0, limit)

      return { ok: true, recommendations }
    } catch (err: any) {
      return { ok: false, recommendations: [], error: err.message }
    }
  })

  // 의존성 조회
  ipcMain.handle('get-dependencies', async (_e, modrinthId: string, opts = {}) => {
    try {
      const deps = await getDependencies(modrinthId, opts)
      return { dependencies: deps }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('get-mod-detail', async (_e, modrinthId: string, opts = {}) => {
    try {
      const detail = await getModDetail(modrinthId, opts)
      return { ok: Boolean(detail), detail, error: detail ? undefined : '모드 상세 정보를 찾을 수 없습니다.' }
    } catch (err: any) {
      return { ok: false, detail: null, error: err.message }
    }
  })

  ipcMain.handle('check-profile-updates', async (_e, profileId: string, opts = {}) => {
    try {
      return await checkProfileUpdates(profileId, opts)
    } catch (err: any) {
      return { ok: false, updates: [], error: err.message }
    }
  })

  // 업데이트 적용: 최신 jar 다운로드 → profile_mods 버전 갱신 → 구버전 jar 정리
  ipcMain.handle('apply-profile-updates', async (_e, profileId: string, opts: {
    gameVersion?: string
    loader?: string
    modrinthIds?: string[]
  } = {}) => {
    try {
      const check = await checkProfileUpdates(profileId, opts)
      if (!check.ok) {
        return { ok: false, applied: [], failed: [], backupPath: null, error: '업데이트 정보를 가져오지 못했습니다.' }
      }

      const targets = check.updates.filter(
        (u: any) => u.update_available && u.latest_file_url && u.latest_ver_db_id
      )
      if (targets.length === 0) {
        return { ok: true, applied: [], failed: [], backupPath: null }
      }

      const modsDir = getProfileModsPath(profileId)
      fs.mkdirSync(modsDir, { recursive: true })
      const backupPath = createModsBackup(modsDir, `before-update-${profileId}`)

      const applied: any[] = []
      const failed: { name: string; reason: string }[] = []

      for (const u of targets) {
        try {
          const modRow = db.prepare('SELECT id FROM mods WHERE modrinth_id = ?').get(u.modrinth_id) as { id: number } | undefined
          if (!modRow) throw new Error('로컬 DB에서 모드를 찾을 수 없습니다.')

          // 교체 후 정리할 수 있게, 현재 설치된 파일명을 미리 확보
          const current = db.prepare(`
            SELECT mv.file_name
            FROM profile_mods pm
            LEFT JOIN mod_versions mv ON pm.mod_version_id = mv.id
            WHERE pm.profile_id = ? AND pm.mod_id = ?
          `).get(profileId, modRow.id) as { file_name?: string | null } | undefined

          const newFileName = u.latest_file_name ?? `${u.slug ?? u.modrinth_id}.jar`
          const dest = path.join(modsDir, newFileName)
          if (!fs.existsSync(dest)) {
            await downloadFile(u.latest_file_url, dest)
          }

          db.prepare(`
            UPDATE profile_mods SET mod_version_id = ?, installed_at = CURRENT_TIMESTAMP
            WHERE profile_id = ? AND mod_id = ?
          `).run(u.latest_ver_db_id, profileId, modRow.id)

          // 구버전 jar 정리 (새 파일명과 다를 때만, mods 폴더 밖은 건드리지 않음)
          let removedOld: string | null = null
          if (current?.file_name && current.file_name !== newFileName) {
            const oldPath = path.resolve(modsDir, current.file_name)
            if (oldPath.startsWith(modsDir + path.sep) && fs.existsSync(oldPath)) {
              fs.unlinkSync(oldPath)
              removedOld = current.file_name
            }
          }

          win.webContents.send('install-progress', { name: u.name, fileName: newFileName, status: 'done' })
          applied.push({
            modrinth_id: u.modrinth_id,
            name: u.name,
            fileName: newFileName,
            version_number: u.latest_version_number,
            removedOld,
          })
        } catch (err: any) {
          failed.push({ name: u.name, reason: err.message })
          win.webContents.send('install-progress', { name: u.name, status: 'error', reason: err.message })
        }
      }

      return { ok: failed.length === 0, applied, failed, backupPath }
    } catch (err: any) {
      return { ok: false, applied: [], failed: [], backupPath: null, error: err.message }
    }
  })

  // 모드 설치
  ipcMain.handle('download-mods', async (_e, mods: any[], installPath?: string) => {
    const targetDir = installPath ?? path.join(
      process.env.APPDATA ?? process.env.HOME ?? '',
      '.minecraft', 'mods'
    )
    fs.mkdirSync(targetDir, { recursive: true })
    const backupPath = createModsBackup(targetDir, 'before-install')

    const success: string[] = []
    const failed: { name: string; reason: string }[] = []

    for (const mod of mods) {
      if (!mod.file_url) {
        failed.push({ name: mod.name ?? mod.modrinth_id, reason: 'file_url 없음' })
        continue
      }
      try {
        const fileName = mod.file_name ?? `${mod.slug ?? mod.modrinth_id}.jar`
        const dest = path.join(targetDir, fileName)

        if (!fs.existsSync(dest)) {
          await downloadFile(mod.file_url, dest)
        }

        win.webContents.send('install-progress', { name: mod.name, fileName, status: 'done' })
        success.push(fileName)
      } catch (err: any) {
        failed.push({ name: mod.name, reason: err.message })
        win.webContents.send('install-progress', { name: mod.name, status: 'error', reason: err.message })
      }
    }

    return { success: failed.length === 0, files: success, failed, backupPath }
  })

  // 폴더 연결
  ipcMain.handle('create-junction', async (_e, sourceDir: string, targetDir: string) => {
    try {
      // 1. 소스 폴더(중앙 모드 보관소)가 없으면 생성
      if (!fs.existsSync(sourceDir)) {
        fs.mkdirSync(sourceDir, { recursive: true })
      }

      // 2. 타겟 폴더 (existsSync는 깨진 링크에 false를 주므로 lstat 기반으로 판별)
      const targetStat = statNoFollow(targetDir)
      if (targetStat?.isSymbolicLink()) {
        // 이미 링크가 걸려있다면 안전하게 해제
        fs.unlinkSync(targetDir)
      } else if (targetStat) {
        // 실제 폴더가 존재한다면 백업 처리
        const backupPath = `${targetDir}_backup_${Date.now()}`
        fs.renameSync(targetDir, backupPath)
        console.log(`[IPC] 기존 폴더 백업 완료: ${backupPath}`)
      } else {
        // 부모 폴더가 없는 경우 대비
        fs.mkdirSync(path.dirname(targetDir), { recursive: true })
      }

      // 3. Junction 생성
      fs.symlinkSync(sourceDir, targetDir, 'junction')
      console.log(`[IPC] Junction 생성 완료: ${targetDir} -> ${sourceDir}`)
      
      return { ok: true }
    } catch (err: any) {
      console.error(`[IPC] Junction 생성 실패:`, err)
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('remove-junction', async (_e, targetDir: string) => {
    try {
      if (removeJunctionIfExists(targetDir)) {
        console.log(`[IPC] Junction 해제 완료: ${targetDir}`)
      }
      return { ok: true }
    } catch (err: any) {
      console.error(`[IPC] Junction 해제 실패:`, err)
      return { ok: false, error: err.message }
    }
  })

  // DB 동기화
  ipcMain.handle('sync-modrinth', async (_e, opts: { limit?: number } = {}) => {
    return syncCatalog({
      ...opts,
      onProgress: (data) => win.webContents.send('sync-progress', data),
    })
  })

  ipcMain.handle('sync-status', async () => getSyncStatus())

  // 유틸
  ipcMain.handle('open-folder', async (_e, folderPath: string) => shell.openPath(folderPath))

  ipcMain.handle('select-install-path', async () => {
    const result = await dialog.showOpenDialog(win, {
      title: 'mods 폴더 선택',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true }
    return { ok: true, canceled: false, path: result.filePaths[0] }
  })

  // 모든 프로필 가져오기
  ipcMain.handle('get-profiles', async () => {
    return db.prepare('SELECT * FROM profiles ORDER BY created_at DESC').all();
  });

  // 프로필 생성
  ipcMain.handle('create-profile', async (_e, data: { name: string, gameVersion: string, loader: string }) => {
    const info = db.prepare(
      'INSERT INTO profiles (game_id, name, game_version, loader) VALUES (?, ?, ?, ?)'
    ).run(getGameId(), data.name, data.gameVersion, data.loader);
    return { ok: true, id: info.lastInsertRowid };
  });

  // 프로필 삭제
  ipcMain.handle('delete-profile', async (_e, id: string) => {
    // 연결된 프로필을 지우면 게임 폴더에 걸린 junction도 함께 해제
    const profile = db.prepare('SELECT is_active FROM profiles WHERE id = ?').get(id) as { is_active?: number } | undefined
    if (profile?.is_active) {
      removeJunctionIfExists(path.resolve(getDefaultModsPath()))
    }
    db.prepare('DELETE FROM profiles WHERE id = ?').run(id);
    return { ok: true };
  });

  // 프로필 활성화: 프로필 보관소를 게임 mods 폴더에 junction으로 연결
  ipcMain.handle('activate-profile', async (_e, profileId: string) => activateProfileInternal(profileId))

  // ---------- Microsoft 계정 인증 ----------

  ipcMain.handle('auth-status', async () => getAuthStatus())

  ipcMain.handle('auth-start', async () => {
    return startDeviceAuth(
      (info) => win.webContents.send('auth-device-code', info),
      (message) => win.webContents.send('auth-stage', { message }),
    )
  })

  ipcMain.handle('auth-cancel', async () => {
    cancelDeviceAuth()
    return { ok: true }
  })

  ipcMain.handle('auth-logout', async () => {
    authLogout()
    return { ok: true }
  })

  ipcMain.handle('auth-get-client-id', async () => ({ clientId: getClientId() }))

  ipcMain.handle('auth-set-client-id', async (_e, clientId: string | null) => {
    setClientId(clientId)
    return { ok: true }
  })

  ipcMain.handle('auth-set-offline', async (_e, enabled: boolean, username?: string) => {
    const res = setOfflineConfig(enabled, username)
    return { ...res, status: getAuthStatus() }
  })

  // ---------- 실행 설정 ----------

  ipcMain.handle('get-launch-settings', async () => ({
    memoryMb: parseInt(getSetting('java_memory_mb') ?? '', 10) || 4096,
    totalMemoryMb: Math.floor(os.totalmem() / (1024 * 1024)),
  }))

  ipcMain.handle('set-launch-settings', async (_e, data: { memoryMb?: number }) => {
    if (typeof data.memoryMb === 'number' && Number.isFinite(data.memoryMb)) {
      const clamped = Math.min(32768, Math.max(1024, Math.floor(data.memoryMb)))
      setSetting('java_memory_mb', String(clamped))
    }
    return { ok: true }
  })

  const safeSend = (channel: string, payload: unknown) => {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }

  // 게임 로그는 줄 단위로 오면 IPC가 넘치므로 250ms 버퍼로 묶어 보냄
  let gameLogBuffer: string[] = []
  let gameLogTimer: NodeJS.Timeout | null = null
  const pushGameLog = (line: string) => {
    gameLogBuffer.push(line)
    if (!gameLogTimer) {
      gameLogTimer = setTimeout(() => {
        safeSend('game-log', { lines: gameLogBuffer.splice(0) })
        gameLogTimer = null
      }, 250)
    }
  }

  // 자체 실행: 세션 확인 → 로더/게임 파일 확보 → JVM 직접 spawn (공식 런처 불필요)
  ipcMain.handle('launch-game-direct', async (_e, profileId: string) => {
    try {
      const profile = db.prepare('SELECT id, name, game_version, loader FROM profiles WHERE id = ?').get(profileId) as
        { id: number; name: string; game_version?: string | null; loader?: string | null } | undefined
      if (!profile) return { ok: false, error: '프로필을 찾을 수 없습니다.' }

      // 실행 전 이 프로필의 mods가 게임 폴더에 연결되어 있도록 보장
      const activation = activateProfileInternal(String(profile.id))
      if (!activation.ok) {
        return { ok: false, error: `프로필 연결에 실패했습니다: ${activation.error}` }
      }

      const result = await launchGameDirect(profile, {
        onStage: (message) => safeSend('loader-install-progress', { message }),
        onFilesProgress: (p) => safeSend('game-files-progress', p),
        onLog: pushGameLog,
        onExit: (info) => safeSend('game-exit', { profileId: profile.id, ...info }),
      })
      return { ...result, activated: true }
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('stop-game', async (_e, profileId: string) => {
    return { ok: stopGame(Number(profileId)) }
  })

  // 프로필 실행: mods 연결 보장 → 공식 런처 프로필 등록 → 런처 실행
  ipcMain.handle('launch-profile', async (_e, profileId: string) => {
    try {
      const profile = db.prepare('SELECT id, name, game_version, loader FROM profiles WHERE id = ?').get(profileId) as
        { id: number; name: string; game_version?: string | null; loader?: string | null } | undefined
      if (!profile) return { ok: false, error: '프로필을 찾을 수 없습니다.' }

      // 실행 전 이 프로필의 mods가 게임 폴더에 연결되어 있도록 보장
      const activation = activateProfileInternal(String(profile.id))
      if (!activation.ok) {
        return { ok: false, error: `프로필 연결에 실패했습니다: ${activation.error}` }
      }

      const result = await launchMinecraftProfile(profile, (message) =>
        win.webContents.send('loader-install-progress', { message })
      )
      return { ...result, activated: true }
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  })

  // 게임 파일 준비: 로더 확보 → 클라이언트 jar/라이브러리/에셋 다운로드 (자체 실행 2단계)
  ipcMain.handle('prepare-game-files', async (_e, profileId: string) => {
    try {
      const profile = db.prepare('SELECT id, name, game_version, loader FROM profiles WHERE id = ?').get(profileId) as
        { id: number; name: string; game_version?: string | null; loader?: string | null } | undefined
      if (!profile) return { ok: false, error: '프로필을 찾을 수 없습니다.' }

      const ensured = await resolveOrInstallVersion(profile.game_version, profile.loader, (message) =>
        win.webContents.send('loader-install-progress', { message })
      )
      if (!ensured.ok) return ensured

      const result = await ensureGameFiles(ensured.versionId!, (p) =>
        win.webContents.send('game-files-progress', p)
      )
      return { ok: true, loaderInstalled: ensured.loaderInstalled, ...result }
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  })

  // 프로필 비활성화: 게임 mods 폴더의 junction 해제
  ipcMain.handle('deactivate-profile', async () => {
    try {
      const targetDir = path.resolve(getDefaultModsPath())
      removeJunctionIfExists(targetDir)
      db.prepare('UPDATE profiles SET is_active = 0').run()
      return { ok: true, targetPath: targetDir }
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('update-profile-path', async (_e, profileId: string, installPath: string | null) => {
    db.prepare('UPDATE profiles SET install_path = ? WHERE id = ?').run(installPath, profileId)
    return { ok: true }
  })

  ipcMain.handle('backup-profile-mods', async (_e, profileId: string) => {
    try {
      const modsDir = getProfileModsPath(profileId)
      const backupPath = createModsBackup(modsDir, `profile-${profileId}`)
      if (!backupPath) return { ok: false, error: '백업할 mods 폴더가 없습니다.' }
      return { ok: true, backupPath }
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('restore-profile-backup', async (_e, profileId: string, backupPath: string) => {
    try {
      const resolvedBackup = path.resolve(backupPath)
      const backupRoot = path.resolve(app.getPath('userData'), 'backups')
      if (!resolvedBackup.startsWith(backupRoot + path.sep)) {
        return { ok: false, error: 'ModForge 백업 폴더 안의 백업만 복구할 수 있습니다.' }
      }
      if (!fs.existsSync(resolvedBackup)) return { ok: false, error: '백업 폴더를 찾을 수 없습니다.' }

      const modsDir = getProfileModsPath(profileId)
      fs.mkdirSync(path.dirname(modsDir), { recursive: true })
      const currentBackup = fs.existsSync(modsDir) ? createModsBackup(modsDir, `before-restore-${profileId}`) : null
      if (fs.existsSync(modsDir)) {
        const movedAside = `${modsDir}_before_restore_${Date.now()}`
        fs.renameSync(modsDir, movedAside)
      }
      fs.cpSync(resolvedBackup, modsDir, { recursive: true })
      return { ok: true, restoredPath: modsDir, currentBackup }
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  })

  // 특정 프로필에 설치된 모드 목록 가져오기
  ipcMain.handle('get-installed-mods', async (_e, profileId: string) => {
    const rows = db.prepare(`
      SELECT m.*, mv.version_number, mv.file_name, p.install_path, pm.installed_at 
      FROM profile_mods pm
      JOIN mods m ON pm.mod_id = m.id
      LEFT JOIN mod_versions mv ON pm.mod_version_id = mv.id
      LEFT JOIN profiles p ON p.id = pm.profile_id
      WHERE pm.profile_id = ?
    `).all(profileId) as any[];

    return rows.map(row => ({
      ...row,
      categories: parseJsonArray(row.categories),
      loaders: parseJsonArray(row.loaders),
    }));
  });

  ipcMain.handle('export-profile-pack', async (_e, profileId: string) => {
    try {
      const profile = db.prepare(`
        SELECT id, name, game_version, loader, install_path, created_at
        FROM profiles
        WHERE id = ?
      `).get(profileId) as any

      if (!profile) return { ok: false, canceled: false, error: '프로필을 찾을 수 없습니다.' }

      const mods = db.prepare(`
        SELECT
          m.modrinth_id, m.slug, m.name, m.description, m.icon_url,
          m.categories, m.loaders, m.downloads,
          mv.modrinth_ver_id, mv.version_number, mv.game_versions,
          mv.loaders AS version_loaders, mv.file_url, mv.file_name,
          mv.file_size, mv.file_hash_sha1,
          pm.installed_at
        FROM profile_mods pm
        JOIN mods m ON pm.mod_id = m.id
        LEFT JOIN mod_versions mv ON pm.mod_version_id = mv.id
        WHERE pm.profile_id = ?
        ORDER BY m.name ASC
      `).all(profileId) as any[]

      const scannedJars = scanModJars(profile.install_path || getDefaultModsPath())
      const safeName = String(profile.name ?? 'profile').replace(/[<>:"/\\|?*]+/g, '-').trim() || 'profile'
      const defaultPath = path.join(app.getPath('downloads'), `${safeName}.modforge-pack.json`)
      const saveResult = await dialog.showSaveDialog(win, {
        title: '모드팩 내보내기',
        defaultPath,
        filters: [
          { name: 'ModForge Pack', extensions: ['modforge-pack.json'] },
          { name: 'JSON', extensions: ['json'] },
        ],
      })

      if (saveResult.canceled || !saveResult.filePath) {
        return { ok: false, canceled: true }
      }

      const manifest = {
        format: 'modforge-pack',
        format_version: 1,
        exported_at: new Date().toISOString(),
        profile: {
          name: profile.name,
          game: 'minecraft',
          game_version: profile.game_version,
          loader: profile.loader,
        },
        mods: mods.map((mod) => ({
          provider: 'modrinth',
          project_id: mod.modrinth_id,
          version_id: mod.modrinth_ver_id,
          slug: mod.slug,
          name: mod.name,
          version_number: mod.version_number,
          file_name: mod.file_name,
          file_url: mod.file_url,
          file_size: mod.file_size,
          sha1: mod.file_hash_sha1,
          categories: parseJsonArray(mod.categories),
          loaders: parseJsonArray(mod.version_loaders || mod.loaders),
          game_versions: parseJsonArray(mod.game_versions),
          installed_at: mod.installed_at,
        })),
        local_jars: scannedJars
          .filter((jar) => !mods.some((mod) => mod.file_name === jar.file_name))
          .map((jar) => ({
            file_name: jar.file_name,
            jar_mod_id: jar.jar_mod_id,
            name: jar.name,
            version_number: jar.version_number,
            loader: jar.loader,
          })),
      }

      fs.writeFileSync(saveResult.filePath, JSON.stringify(manifest, null, 2), 'utf8')

      return {
        ok: true,
        canceled: false,
        filePath: saveResult.filePath,
        modCount: manifest.mods.length,
        localJarCount: manifest.local_jars.length,
      }
    } catch (err: any) {
      return { ok: false, canceled: false, error: err.message }
    }
  });

  ipcMain.handle('import-profile-pack', async () => {
    try {
      const openResult = await dialog.showOpenDialog(win, {
        title: '모드팩 가져오기',
        filters: [
          { name: 'ModForge Pack', extensions: ['modforge-pack.json', 'json'] },
          { name: 'JSON', extensions: ['json'] },
        ],
        properties: ['openFile'],
      })

      if (openResult.canceled || !openResult.filePaths[0]) {
        return { ok: false, canceled: true }
      }

      const filePath = openResult.filePaths[0]
      const manifest = JSON.parse(fs.readFileSync(filePath, 'utf8'))
      if (manifest.format !== 'modforge-pack' || !Array.isArray(manifest.mods)) {
        return { ok: false, canceled: false, error: 'ModForge 모드팩 파일이 아닙니다.' }
      }

      const profileName = `${manifest.profile?.name ?? 'Imported Pack'} (가져옴)`
      const createProfile = db.prepare(`
        INSERT INTO profiles (game_id, name, game_version, loader, install_path)
        VALUES (?, ?, ?, ?, ?)
      `)
      const profileInfo = createProfile.run(
        getGameId(),
        profileName,
        manifest.profile?.game_version ?? null,
        manifest.profile?.loader ?? null,
        null,
      )
      const profileId = Number(profileInfo.lastInsertRowid)
      const targetDir = getDefaultModsPath()
      fs.mkdirSync(targetDir, { recursive: true })
      const backupPath = createModsBackup(targetDir, 'before-import')

      const imported: string[] = []
      const downloaded: string[] = []
      const failed: { name: string; reason: string }[] = []

      for (const mod of manifest.mods) {
        if (!mod.project_id) {
          failed.push({ name: mod.name ?? '알 수 없는 모드', reason: 'project_id가 없습니다.' })
          continue
        }

        try {
          const ids = upsertImportedMod(mod, manifest.profile)
          db.prepare(`
            INSERT INTO profile_mods (profile_id, mod_id, mod_version_id)
            VALUES (?, ?, ?)
            ON CONFLICT(profile_id, mod_id) DO UPDATE SET
              mod_version_id = excluded.mod_version_id,
              installed_at = CURRENT_TIMESTAMP
          `).run(profileId, ids.modId, ids.versionId)
          imported.push(mod.name ?? mod.project_id)

          if (mod.file_url) {
            const fileName = mod.file_name ?? `${mod.slug ?? mod.project_id}.jar`
            const dest = path.join(targetDir, fileName)
            if (!fs.existsSync(dest)) {
              await downloadFile(mod.file_url, dest)
              downloaded.push(fileName)
            }
          }
        } catch (err: any) {
          failed.push({ name: mod.name ?? mod.project_id, reason: err.message })
        }
      }

      return {
        ok: failed.length === 0,
        canceled: false,
        profileId,
        profileName,
        imported: imported.length,
        downloaded: downloaded.length,
        localJarCount: Array.isArray(manifest.local_jars) ? manifest.local_jars.length : 0,
        backupPath,
        failed,
      }
    } catch (err: any) {
      return { ok: false, canceled: false, error: err.message }
    }
  });

  // Modrinth 표준 모드팩(.mrpack) 가져오기
  ipcMain.handle('import-mrpack', async () => {
    try {
      const openResult = await dialog.showOpenDialog(win, {
        title: 'Modrinth 모드팩(.mrpack) 가져오기',
        filters: [
          { name: 'Modrinth Modpack', extensions: ['mrpack'] },
          { name: '모든 파일', extensions: ['*'] },
        ],
        properties: ['openFile'],
      })
      if (openResult.canceled || !openResult.filePaths[0]) {
        return { ok: false, canceled: true }
      }

      return await importMrpackFromFile(openResult.filePaths[0], (p) =>
        win.webContents.send('mrpack-progress', p)
      )
    } catch (err: any) {
      return { ok: false, canceled: false, error: err.message }
    }
  })

  // 모드 삭제 (프로필에서 제거, 선택 시 파일까지 삭제)
  ipcMain.handle('uninstall-mod', async (_e, profileId: string, modId: string, opts: { deleteFile?: boolean } = {}) => {
    const row = db.prepare(`
      SELECT mv.file_name, p.install_path
      FROM profile_mods pm
      LEFT JOIN mod_versions mv ON pm.mod_version_id = mv.id
      LEFT JOIN profiles p ON p.id = pm.profile_id
      WHERE pm.profile_id = ? AND pm.mod_id = ?
    `).get(profileId, modId) as { file_name?: string | null; install_path?: string | null } | undefined

    let deletedFile: string | null = null
    let fileWarning: string | undefined

    if (opts.deleteFile) {
      if (!row?.file_name) {
        fileWarning = '삭제할 jar 파일명을 찾을 수 없습니다.'
      } else {
        const modsDir = path.resolve(row.install_path || getDefaultModsPath())
        const filePath = path.resolve(modsDir, row.file_name)

        if (!filePath.startsWith(modsDir + path.sep)) {
          fileWarning = '안전하지 않은 파일 경로라 삭제하지 않았습니다.'
        } else if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath)
          deletedFile = filePath
        } else {
          fileWarning = '파일이 이미 없거나 다른 위치에 있습니다.'
        }
      }
    }

    db.prepare('DELETE FROM profile_mods WHERE profile_id = ? AND mod_id = ?')
      .run(profileId, modId);

    return { ok: true, deletedFile, warning: fileWarning };
  });

  ipcMain.handle('save-profile-mods', async (_e, profileId: string, mods: Array<number | { id: number; ver_id?: number }>) => {
    const findVersion = db.prepare(`
      SELECT id
      FROM mod_versions
      WHERE mod_id = ?
      ORDER BY published_at DESC
      LIMIT 1
    `);
    const insert = db.prepare(`
      INSERT INTO profile_mods (profile_id, mod_id, mod_version_id)
      VALUES (?, ?, ?)
      ON CONFLICT(profile_id, mod_id) DO UPDATE SET
        mod_version_id = excluded.mod_version_id,
        installed_at = CURRENT_TIMESTAMP
    `);

    db.transaction((items) => {
      for (const item of items) {
        const modId = typeof item === 'number' ? item : item.id;
        const explicitVersionId = typeof item === 'number' ? undefined : item.ver_id;
        const version = explicitVersionId
          ? { id: explicitVersionId }
          : findVersion.get(modId) as { id: number } | undefined;

        if (version) insert.run(profileId, modId, version.id);
      }
    })(mods);
    return { ok: true };
  });
}
