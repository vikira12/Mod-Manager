import { ipcMain, shell, BrowserWindow } from 'electron'
import fs from 'fs'
import path from 'path'
import axios from 'axios'
import { db } from './db'
import {
  searchLocal, searchRemote, getDependencies,
  syncModrinth, getSyncStatus,
} from './modrinth'
import { resolveDependencies, validateSelection } from './resolver'

export function registerHandlers(win: BrowserWindow): void {

  // 의존성 해결 (DFS)
  ipcMain.handle('resolve-deps', async (_e, modrinthId: string, opts = {}) => {
    try {
      const result = await resolveDependencies(modrinthId, opts)
      return result
    } catch (err: any) {
      return { ok: false, error: err.message, root: null, installOrder: [], required: [], optional: [], conflicts: [] }
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

  // 의존성 조회
  ipcMain.handle('get-dependencies', async (_e, modrinthId: string, opts = {}) => {
    try {
      const deps = await getDependencies(modrinthId, opts)
      return { dependencies: deps }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  // 모드 설치
  ipcMain.handle('download-mods', async (_e, mods: any[], installPath?: string) => {
    const targetDir = installPath ?? path.join(
      process.env.APPDATA ?? process.env.HOME ?? '',
      '.minecraft', 'mods'
    )
    fs.mkdirSync(targetDir, { recursive: true })

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
          const writer = fs.createWriteStream(dest)
          const resp = await axios({ url: mod.file_url, method: 'GET', responseType: 'stream' })
          await new Promise<void>((res, rej) => {
            resp.data.pipe(writer)
            writer.on('finish', res)
            writer.on('error', rej)
          })
        }

        win.webContents.send('install-progress', { name: mod.name, fileName, status: 'done' })
        success.push(fileName)
      } catch (err: any) {
        failed.push({ name: mod.name, reason: err.message })
        win.webContents.send('install-progress', { name: mod.name, status: 'error', reason: err.message })
      }
    }

    return { success: failed.length === 0, files: success, failed }
  })

  // 폴더 연결
  ipcMain.handle('create-junction', async (_e, sourceDir: string, targetDir: string) => {
    try {
      // 1. 소스 폴더(중앙 모드 보관소)가 없으면 생성
      if (!fs.existsSync(sourceDir)) {
        fs.mkdirSync(sourceDir, { recursive: true })
      }

      // 2. 타겟 폴더
      if (fs.existsSync(targetDir)) {
        const stat = fs.lstatSync(targetDir)
        if (stat.isSymbolicLink()) {
          // 이미 링크가 걸려있다면 안전하게 해제
          fs.unlinkSync(targetDir)
        } else {
          // 실제 폴더가 존재한다면 백업 처리
          const backupPath = `${targetDir}_backup_${Date.now()}`
          fs.renameSync(targetDir, backupPath)
          console.log(`[IPC] 기존 폴더 백업 완료: ${backupPath}`)
        }
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
      if (fs.existsSync(targetDir)) {
        const stat = fs.lstatSync(targetDir)
        if (stat.isSymbolicLink()) {
          fs.unlinkSync(targetDir)
          console.log(`[IPC] Junction 해제 완료: ${targetDir}`)
        }
      }
      return { ok: true }
    } catch (err: any) {
      console.error(`[IPC] Junction 해제 실패:`, err)
      return { ok: false, error: err.message }
    }
  })

  // DB 동기화
  ipcMain.handle('sync-modrinth', async (_e, opts: { limit?: number } = {}) => {
    return syncModrinth({
      ...opts,
      onProgress: (data) => win.webContents.send('sync-progress', data),
    })
  })

  ipcMain.handle('sync-status', async () => getSyncStatus())

  // 유틸
  ipcMain.handle('open-folder', async (_e, folderPath: string) => shell.openPath(folderPath))

  // 모든 프로필 가져오기
  ipcMain.handle('get-profiles', async () => {
    return db.prepare('SELECT * FROM profiles ORDER BY created_at DESC').all();
  });

  // 프로필 생성
  ipcMain.handle('create-profile', async (_e, data: { name: string, gameVersion: string, loader: string }) => {
    const info = db.prepare(
      'INSERT INTO profiles (name, game_version, loader) VALUES (?, ?, ?)'
    ).run(data.name, data.gameVersion, data.loader);
    return { ok: true, id: info.lastInsertRowid };
  });

  // 프로필 삭제
  ipcMain.handle('delete-profile', async (_e, id: string) => {
    db.prepare('DELETE FROM profiles WHERE id = ?').run(id);
    return { ok: true };
  });

  // 특정 프로필에 설치된 모드 목록 가져오기
  ipcMain.handle('get-installed-mods', async (_e, profileId: string) => {
    return db.prepare(`
      SELECT m.*, mv.version_number, pm.installed_at 
      FROM profile_mods pm
      JOIN mods m ON pm.mod_id = m.id
      LEFT JOIN mod_versions mv ON pm.mod_version_id = mv.id
      WHERE pm.profile_id = ?
    `).all(profileId);
  });

  // 모드 삭제 (프로필에서 제거)
  ipcMain.handle('uninstall-mod', async (_e, profileId: string, modId: string) => {
    db.prepare('DELETE FROM profile_mods WHERE profile_id = ? AND mod_id = ?')
      .run(profileId, modId);
    return { ok: true };
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
