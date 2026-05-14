import axios from 'axios'
import { db } from './db'

// API 클라이언트
const api = axios.create({
  baseURL: 'https://api.modrinth.com/v2',
  headers: { 'User-Agent': 'ModForge/0.1.0 (github.com/modforge)' },
  timeout: 15000,
})

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (err: any) {
      const status = err.response?.status
      if ((status === 429 || status >= 500) && i < retries - 1) {
        const wait = status === 429
          ? parseInt(err.response.headers['x-ratelimit-reset'] ?? '60') * 1000
          : 1000 * (i + 1)
        console.warn(`[Modrinth] 재시도 ${i + 1}/${retries} (${wait}ms 대기)`)
        await sleep(wait)
      } else throw err
    }
  }
  throw new Error('최대 재시도 초과')
}

export interface ModRow {
  id: number
  modrinth_id: string
  name: string
  slug: string
  description: string
  icon_url: string | null
  downloads: number
  categories: string | string[] // DB에선 string(JSON), 프론트에선 배열로 쓸 수 있게
  loaders: string | string[]
  version_number: string
  modrinth_ver_id: string
  file_url: string | null
  file_name: string | null
  dep_type?: 'required' | 'optional'
  source?: 'local' | 'api'
}

export interface SyncOptions {
  limit?: number
  onProgress?: (data: { total: number; synced: number; name: string }) => void
}

// 모드 저장
function saveMod(gameId: number, project: any): number {
  const stmt = db.prepare(`
    INSERT INTO mods
      (game_id, modrinth_id, slug, name, description, icon_url,
       categories, loaders, downloads, follows, license, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (modrinth_id) DO UPDATE SET
      name=EXCLUDED.name, description=EXCLUDED.description,
      icon_url=EXCLUDED.icon_url, categories=EXCLUDED.categories,
      loaders=EXCLUDED.loaders, downloads=EXCLUDED.downloads,
      updated_at=EXCLUDED.updated_at, synced_at=CURRENT_TIMESTAMP
    RETURNING id
  `)

  // 배열은 JSON 문자열로 변환해서 저장
  const res = stmt.get(
    gameId, project.id, project.slug, project.title,
    project.description, project.icon_url ?? null,
    JSON.stringify(project.categories ?? []), 
    JSON.stringify(project.loaders ?? []),
    project.downloads ?? 0, project.followers ?? 0,
    project.license?.id ?? null,
    project.updated ? new Date(project.updated).toISOString() : null
  ) as { id: number }
  
  return res.id
}

function saveVersions(modId: number, versions: any[]): void {
  const vStmt = db.prepare(`
    INSERT INTO mod_versions
      (mod_id, modrinth_ver_id, version_number, version_type,
       game_versions, loaders, file_url, file_name,
       file_size, file_hash_sha1, is_featured, published_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (modrinth_ver_id) DO UPDATE SET
      version_number=EXCLUDED.version_number,
      game_versions=EXCLUDED.game_versions,
      loaders=EXCLUDED.loaders,
      file_url=EXCLUDED.file_url,
      file_name=EXCLUDED.file_name,
      file_size=EXCLUDED.file_size,
      file_hash_sha1=EXCLUDED.file_hash_sha1,
      is_featured=EXCLUDED.is_featured,
      published_at=EXCLUDED.published_at,
      synced_at=CURRENT_TIMESTAMP
    RETURNING id
  `)

  const depStmt = db.prepare(`
    INSERT INTO mod_dependencies (mod_version_id, depends_on_mod_id, modrinth_dep_id, dep_type)
    VALUES (?, ?, ?, ?)
    ON CONFLICT (mod_version_id, modrinth_dep_id, dep_type) DO NOTHING
  `)

  for (const ver of versions) {
    const primary = ver.files?.find((f: any) => f.primary) ?? ver.files?.[0]

    const vRes = vStmt.get(
      modId, ver.id, ver.version_number, ver.version_type ?? 'release',
      JSON.stringify(ver.game_versions ?? []), 
      JSON.stringify(ver.loaders ?? []),
      primary?.url ?? null, primary?.filename ?? null,
      primary?.size ?? null, primary?.hashes?.sha1 ?? null,
      ver.featured ? 1 : 0, // SQLite는 boolean 대신 1/0
      ver.date_published ? new Date(ver.date_published).toISOString() : null
    ) as { id: number }

    for (const dep of (ver.dependencies ?? [])) {
      let depModId: number | null = null
      if (dep.project_id) {
        const dr = db.prepare('SELECT id FROM mods WHERE modrinth_id = ?').get(dep.project_id) as { id: number } | undefined
        depModId = dr?.id ?? null
      }
      depStmt.run(vRes.id, depModId, dep.project_id ?? dep.version_id ?? 'unknown', dep.dependency_type ?? 'required')
    }
  }
}

// 단일 모드 즉시 캐시
export async function fetchAndCache(modrinthId: string): Promise<number> {
  const gameRes = db.prepare(`SELECT id FROM games WHERE slug='minecraft'`).get() as { id: number }
  const gameId = gameRes.id

  const { data: project } = await withRetry(() => api.get(`/project/${modrinthId}`))
  const { data: versions } = await withRetry(() => api.get(`/project/${modrinthId}/version`))

  const saveTransaction = db.transaction(() => {
    const modId = saveMod(gameId, project)
    saveVersions(modId, versions)
    return modId
  })

  return saveTransaction()
}

// 동기화
export async function syncModrinth(opts: SyncOptions = {}) {
  const { limit = 200, onProgress } = opts

  const logRes = db.prepare(`INSERT INTO sync_log (status) VALUES ('running') RETURNING id`).get() as { id: number }
  const logId = logRes.id

  const gameRes = db.prepare(`SELECT id FROM games WHERE slug='minecraft'`).get() as { id: number }
  const gameId = gameRes.id

  let offset = 0, totalSynced = 0
  const errors: string[] = []

  try {
    while (offset < limit) {
      const take = Math.min(100, limit - offset)
      const { data } = await withRetry(() =>
        api.get('/search', {
          params: {
            facets: JSON.stringify([['project_type:mod']]),
            limit: take, offset, index: 'downloads',
          },
        })
      )
      if (!data.hits?.length) break

      for (const hit of data.hits) {
        try {
          const { data: project } = await withRetry(() => api.get(`/project/${hit.project_id}`))
          await sleep(200)
          const { data: versions } = await withRetry(() => api.get(`/project/${hit.project_id}/version`))
          await sleep(200)
          
          db.transaction(() => {
            const modId = saveMod(gameId, project)
            saveVersions(modId, versions)
          })()

          totalSynced++
          onProgress?.({ total: data.total_hits, synced: totalSynced, name: project.title })
        } catch (err: any) {
          errors.push(`${hit.project_id}: ${err.message}`)
        }
      }

      offset += data.hits.length
      if (offset >= data.total_hits) break
    }

    db.prepare(`UPDATE sync_log SET status='done', mods_synced=?, errors=?, finished_at=CURRENT_TIMESTAMP WHERE id=?`)
      .run(totalSynced, errors.slice(0, 20).join('\n') || null, logId)
      
    return { success: true, synced: totalSynced, errors: errors.length }
  } catch (err: any) {
    db.prepare(`UPDATE sync_log SET status='error', errors=?, finished_at=CURRENT_TIMESTAMP WHERE id=?`)
      .run(err.message, logId)
    return { success: false, error: err.message }
  }
}

// 로컬 DB 검색
export async function searchLocal(
  query: string,
  opts: { loader?: string; gameVersion?: string; limit?: number } = {}
): Promise<ModRow[]> {
  const { loader, gameVersion, limit = 20 } = opts

  let sql = `
    SELECT
      m.id, m.modrinth_id, m.name, m.slug, m.description,
      m.icon_url, m.downloads, m.categories, m.loaders,
      mv.modrinth_ver_id, mv.version_number,
      mv.file_url, mv.file_name
    FROM mods m
    LEFT JOIN mod_versions mv ON mv.mod_id = m.id 
      -- 서브쿼리 최적화를 위해 JOIN으로 풀고, 최신 버전 하나만 가져오도록 그룹핑
  `
  
  const conditions: string[] = []
  const params: any[] = []

  // 이름이나 설명에 검색어 포함
  conditions.push(`(m.name LIKE ? OR m.description LIKE ?)`)
  params.push(`%${query}%`, `%${query}%`)

  if (gameVersion) {
    conditions.push(`mv.game_versions LIKE ?`)
    params.push(`%"${gameVersion}"%`)
  }
  if (loader) {
    conditions.push(`mv.loaders LIKE ?`)
    params.push(`%"${loader.toLowerCase()}"%`)
  }

  sql += ` WHERE ` + conditions.join(' AND ')
  sql += ` GROUP BY m.id ORDER BY m.downloads DESC LIMIT ?`
  params.push(limit)

  const rows = db.prepare(sql).all(...params) as ModRow[]
  
  // JSON 파싱해서 배열로 원복
  return rows.map(r => ({
    ...r,
    categories: JSON.parse((r.categories as string) || '[]'),
    loaders: JSON.parse((r.loaders as string) || '[]')
  }))
}

// 의존성 트리
export async function getDependencies(
  modrinthId: string,
  opts: { gameVersion?: string; loader?: string } = {}
): Promise<ModRow[]> {
  const { gameVersion } = opts

  let verSql = `
    SELECT mv.id AS ver_id
    FROM mods m
    JOIN mod_versions mv ON mv.mod_id = m.id
  `
  const verParams: any[] = [modrinthId]

  if (gameVersion) {
    verSql += ` AND mv.game_versions LIKE ?`
    verParams.push(`%"${gameVersion}"%`)
  }
  verSql += ` ORDER BY mv.published_at DESC LIMIT 1`

  const modRes = db.prepare(verSql).get(...verParams) as { ver_id: number } | undefined
  if (!modRes) return []

  const versionId = modRes.ver_id

  let depSql = `
    SELECT
      d.dep_type, d.modrinth_dep_id,
      m.modrinth_id, m.name, m.description, m.icon_url, m.downloads,
      mv2.version_number, mv2.modrinth_ver_id, mv2.file_url, mv2.file_name
    FROM mod_dependencies d
    LEFT JOIN mods m ON m.id = d.depends_on_mod_id
    LEFT JOIN mod_versions mv2 ON mv2.mod_id = m.id
  `
  const depParams: any[] = []

  let depConditions = ` WHERE d.mod_version_id = ? AND d.dep_type IN ('required','optional')`
  depParams.push(versionId)

  if (gameVersion) {
    depConditions += ` AND mv2.game_versions LIKE ?`
    depParams.push(`%"${gameVersion}"%`)
  }

  depSql += depConditions + ` GROUP BY d.id ORDER BY d.dep_type ASC`

  return db.prepare(depSql).all(...depParams) as ModRow[]
}

export async function getModDetail(
  modrinthId: string,
  opts: { gameVersion?: string; loader?: string } = {}
) {
  await fetchAndCache(modrinthId).catch(() => {})

  const mod = db.prepare(`
    SELECT
      m.id, m.modrinth_id, m.slug, m.name, m.description, m.icon_url,
      m.categories, m.loaders, m.downloads, m.follows, m.license, m.updated_at,
      mv.id AS ver_id, mv.modrinth_ver_id, mv.version_number, mv.version_type,
      mv.game_versions, mv.loaders AS version_loaders, mv.file_url, mv.file_name,
      mv.file_size, mv.file_hash_sha1, mv.published_at
    FROM mods m
    LEFT JOIN mod_versions mv ON mv.mod_id = m.id
    WHERE m.modrinth_id = ?
      AND (? IS NULL OR mv.game_versions LIKE ?)
      AND (? IS NULL OR LOWER(mv.loaders) LIKE ?)
    ORDER BY mv.published_at DESC
    LIMIT 1
  `).get(
    modrinthId,
    opts.gameVersion ?? null,
    opts.gameVersion ? `%"${opts.gameVersion}"%` : null,
    opts.loader ?? null,
    opts.loader ? `%"${opts.loader.toLowerCase()}"%` : null,
  ) as any

  if (!mod) return null

  const dependencies = await getDependencies(modrinthId, opts)

  return {
    ...mod,
    categories: parseJsonArray(mod.categories),
    loaders: parseJsonArray(mod.loaders),
    game_versions: parseJsonArray(mod.game_versions),
    version_loaders: parseJsonArray(mod.version_loaders),
    dependencies,
  }
}

export async function checkProfileUpdates(
  profileId: string,
  opts: { gameVersion?: string; loader?: string } = {}
) {
  const installed = db.prepare(`
    SELECT
      m.id, m.modrinth_id, m.slug, m.name, m.icon_url,
      mv.id AS installed_ver_db_id,
      mv.modrinth_ver_id AS installed_version_id,
      mv.version_number AS installed_version_number
    FROM profile_mods pm
    JOIN mods m ON pm.mod_id = m.id
    LEFT JOIN mod_versions mv ON pm.mod_version_id = mv.id
    WHERE pm.profile_id = ?
    ORDER BY m.name ASC
  `).all(profileId) as any[]

  const results: any[] = []

  for (const mod of installed) {
    await fetchAndCache(mod.modrinth_id).catch(() => {})

    const latest = db.prepare(`
      SELECT
        id AS latest_ver_db_id,
        modrinth_ver_id AS latest_version_id,
        version_number AS latest_version_number,
        file_url, file_name, file_size, file_hash_sha1,
        published_at
      FROM mod_versions
      WHERE mod_id = ?
        AND (? IS NULL OR game_versions LIKE ?)
        AND (? IS NULL OR LOWER(loaders) LIKE ?)
      ORDER BY published_at DESC
      LIMIT 1
    `).get(
      mod.id,
      opts.gameVersion ?? null,
      opts.gameVersion ? `%"${opts.gameVersion}"%` : null,
      opts.loader ?? null,
      opts.loader ? `%"${opts.loader.toLowerCase()}"%` : null,
    ) as any

    results.push({
      modrinth_id: mod.modrinth_id,
      slug: mod.slug,
      name: mod.name,
      icon_url: mod.icon_url,
      installed_version_id: mod.installed_version_id,
      installed_version_number: mod.installed_version_number,
      latest_version_id: latest?.latest_version_id ?? null,
      latest_version_number: latest?.latest_version_number ?? null,
      latest_file_url: latest?.file_url ?? null,
      latest_file_name: latest?.file_name ?? null,
      latest_ver_db_id: latest?.latest_ver_db_id ?? null,
      update_available: Boolean(latest?.latest_version_id && latest.latest_version_id !== mod.installed_version_id),
      status: latest ? (latest.latest_version_id !== mod.installed_version_id ? 'update_available' : 'up_to_date') : 'unknown',
    })
  }

  return { ok: true, updates: results }
}

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

// 동기화 상태
export function getSyncStatus() {
  const logs = db.prepare(`SELECT * FROM sync_log ORDER BY started_at DESC LIMIT 5`).all()
  const countRes = db.prepare(`SELECT COUNT(*) as count FROM mods`).get() as { count: number }
  return { logs, totalMods: countRes.count }
}

// Modrinth API 직접 검색 (fallback)
export async function searchRemote(
  query: string,
  opts: { loader?: string; gameVersion?: string; limit?: number } = {}
): Promise<ModRow[]> {
  const { loader, gameVersion, limit = 10 } = opts

  const facets = [['project_type:mod']]
  if (loader)      facets.push([`categories:${loader.toLowerCase()}`])
  if (gameVersion) facets.push([`versions:${gameVersion}`])

  const { data } = await api.get('/search', {
    params: { query, facets: JSON.stringify(facets), limit, index: 'relevance' },
  })

  // 백그라운드 캐시 (fire & forget)
  for (const hit of data.hits.slice(0, 3)) {
    fetchAndCache(hit.project_id).catch(() => {})
  }

  return data.hits.map((h: any) => ({
    modrinth_id:     h.project_id,
    name:            h.title,
    slug:            h.slug,
    description:     h.description,
    icon_url:        h.icon_url,
    downloads:       h.downloads,
    categories:      h.categories,
    loaders:         h.loaders,
    version_number:  h.latest_version ?? '',
    modrinth_ver_id: '',
    file_url:        null,
    file_name:       null,
    source:          'api' as const,
  }))
}
