import fs from 'fs'
import path from 'path'
import { db } from './db'
import { readZipEntries, readEntryBuffer, readEntryText } from './zip'
import { downloadFile } from './download'
import { getProfileStoragePath, getMinecraftRoot } from './profilePaths'
import { getGameId, cacheProject } from './catalog'
import { defaultProvider } from './providers'

// Modrinth 모드팩 표준 포맷(.mrpack) 가져오기
// 구조: ZIP 안에 modrinth.index.json(매니페스트) + overrides/(설정 파일 등)

interface MrpackFile {
  path: string
  hashes?: { sha1?: string; sha512?: string }
  env?: { client?: string; server?: string }
  downloads: string[]
  fileSize?: number
}

export interface MrpackProgressData {
  total: number
  done: number
  name: string
}

export interface MrpackImportOutcome {
  ok: boolean
  canceled?: boolean
  profileId?: number
  profileName?: string
  gameVersion?: string | null
  loader?: string | null
  totalFiles?: number
  downloaded?: number
  registered?: number
  overrides?: number
  overridesSkipped?: number
  failed?: { name: string; reason: string }[]
  error?: string
}

// mrpack dependencies 키 → 프로필 로더 이름
const LOADER_DEP_MAP: Record<string, string> = {
  'fabric-loader': 'Fabric',
  'quilt-loader': 'Quilt',
  'forge': 'Forge',
  'neoforge': 'NeoForge',
}

// 압축 파일 경로가 대상 폴더를 벗어나지 못하게 정규화 (경로 탈출 방지)
function sanitizeRelPath(rel: string): string | null {
  const normalized = path.normalize(rel).replace(/^[/\\]+/, '')
  if (!normalized || path.isAbsolute(normalized)) return null
  if (normalized.split(/[/\\]/).some((seg) => seg === '..')) return null
  return normalized
}

function isModsPath(rel: string): boolean {
  return rel.startsWith('mods/') || rel.startsWith('mods\\')
}

export async function importMrpackFromFile(
  filePath: string,
  onProgress?: (p: MrpackProgressData) => void
): Promise<MrpackImportOutcome> {
  const data = fs.readFileSync(filePath)
  const entries = readZipEntries(data)

  const indexText = readEntryText(data, entries, 'modrinth.index.json')
  if (!indexText) {
    return { ok: false, error: 'modrinth.index.json을 찾을 수 없습니다. 올바른 .mrpack 파일이 아닙니다.' }
  }

  const manifest = JSON.parse(indexText)
  if (manifest.formatVersion !== 1) {
    return { ok: false, error: `지원하지 않는 mrpack 포맷 버전입니다: ${manifest.formatVersion}` }
  }
  if (manifest.game && manifest.game !== 'minecraft') {
    return { ok: false, error: `지원하지 않는 게임의 모드팩입니다: ${manifest.game}` }
  }

  const deps = manifest.dependencies ?? {}
  const gameVersion: string | null = deps.minecraft ?? null
  let loader: string | null = null
  for (const [depKey, label] of Object.entries(LOADER_DEP_MAP)) {
    if (deps[depKey]) { loader = label; break }
  }

  // 1. 프로필 생성 + 전용 보관소 지정
  const profileName = `${manifest.name ?? 'Modrinth Pack'}${manifest.versionId ? ` ${manifest.versionId}` : ''}`
  const info = db.prepare(`
    INSERT INTO profiles (game_id, name, game_version, loader, install_path)
    VALUES (?, ?, ?, ?, NULL)
  `).run(getGameId(), profileName, gameVersion, loader)
  const profileId = Number(info.lastInsertRowid)

  const storageDir = getProfileStoragePath(profileId)
  fs.mkdirSync(storageDir, { recursive: true })
  db.prepare('UPDATE profiles SET install_path = ? WHERE id = ?').run(storageDir, profileId)

  const gameRoot = getMinecraftRoot()

  // 2. 매니페스트 파일 다운로드 (모드는 프로필 보관소로, 그 외 경로는 게임 폴더로)
  const files: MrpackFile[] = Array.isArray(manifest.files) ? manifest.files : []
  const clientFiles = files.filter((f) => f.env?.client !== 'unsupported')
  const failed: { name: string; reason: string }[] = []
  let downloaded = 0
  let processed = 0

  for (const file of clientFiles) {
    processed++
    const rel = sanitizeRelPath(file.path)
    if (!rel) {
      failed.push({ name: file.path, reason: '안전하지 않은 파일 경로' })
      continue
    }
    try {
      const url = file.downloads?.[0]
      if (!url) throw new Error('다운로드 URL이 없습니다')

      const dest = isModsPath(rel)
        ? path.join(storageDir, path.basename(rel))
        : path.join(gameRoot, rel)

      fs.mkdirSync(path.dirname(dest), { recursive: true })
      if (!fs.existsSync(dest)) await downloadFile(url, dest)
      downloaded++
    } catch (err: any) {
      failed.push({ name: path.basename(rel), reason: err.message })
    }
    onProgress?.({ total: clientFiles.length, done: processed, name: path.basename(rel ?? file.path) })
  }

  // 3. 파일 해시로 모드 메타데이터를 벌크 등록 (실패해도 게임 실행에는 지장 없음)
  let registered = 0
  try {
    const hashes = clientFiles
      .filter((f) => isModsPath(f.path))
      .map((f) => f.hashes?.sha1)
      .filter(Boolean) as string[]

    if (hashes.length && defaultProvider.getVersionsByHashes && defaultProvider.getProjects) {
      const byHash = await defaultProvider.getVersionsByHashes(hashes, 'sha1')
      const projectIds = [...new Set(Object.values(byHash).map((v) => v.projectId))]
      const projects = await defaultProvider.getProjects(projectIds)
      const projectMap = new Map(projects.map((p) => [p.id, p]))

      const findVer = db.prepare('SELECT id FROM mod_versions WHERE modrinth_ver_id = ?')
      const insertPm = db.prepare(`
        INSERT INTO profile_mods (profile_id, mod_id, mod_version_id)
        VALUES (?, ?, ?)
        ON CONFLICT(profile_id, mod_id) DO UPDATE SET
          mod_version_id = excluded.mod_version_id,
          installed_at = CURRENT_TIMESTAMP
      `)

      for (const { projectId, version } of Object.values(byHash)) {
        const project = projectMap.get(projectId)
        if (!project) continue
        const modId = cacheProject(project, [version])
        const verRow = findVer.get(version.id) as { id: number } | undefined
        if (verRow) {
          insertPm.run(profileId, modId, verRow.id)
          registered++
        }
      }
    }
  } catch (err: any) {
    console.warn('[mrpack] 모드 메타데이터 등록 실패 (파일은 설치됨):', err.message)
  }

  // 4. overrides 추출 (기존 파일은 덮어쓰지 않고 보호)
  let overrides = 0
  let overridesSkipped = 0
  for (const name of entries.keys()) {
    for (const prefix of ['overrides/', 'client-overrides/']) {
      if (!name.startsWith(prefix) || name.endsWith('/')) continue

      const rel = sanitizeRelPath(name.slice(prefix.length))
      if (!rel) continue

      const buf = readEntryBuffer(data, entries, name)
      if (!buf) continue

      const dest = isModsPath(rel)
        ? path.join(storageDir, path.basename(rel))
        : path.join(gameRoot, rel)

      if (fs.existsSync(dest)) {
        overridesSkipped++
        continue
      }
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.writeFileSync(dest, buf)
      overrides++
    }
  }

  return {
    ok: failed.length === 0,
    profileId,
    profileName,
    gameVersion,
    loader,
    totalFiles: clientFiles.length,
    downloaded,
    registered,
    overrides,
    overridesSkipped,
    failed,
  }
}
