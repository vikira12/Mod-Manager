import { db } from './db'
import { defaultProvider, getProvider } from './providers'
import type { ModProvider, ProviderProject, ProviderVersion } from './providers'

// 로컬 카탈로그(캐시) 계층: 프로바이더에서 받아온 데이터를 SQLite에 저장하고 조회한다.
// 네트워크 접근은 전부 providers/ 밑의 구현체가 담당한다.
//
// 참고: mods.modrinth_id / mod_versions.modrinth_ver_id 컬럼은 "프로바이더의 프로젝트/버전 ID"라는
// 일반 의미로 사용한다. 멀티 프로바이더 도입 시 provider 컬럼 추가 마이그레이션이 필요하다.

export const DEFAULT_GAME_SLUG = 'minecraft'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function getGameId(slug: string = DEFAULT_GAME_SLUG): number {
  const row = db.prepare('SELECT id FROM games WHERE slug = ?').get(slug) as { id: number } | undefined
  if (!row) throw new Error(`등록되지 않은 게임입니다: ${slug}`)
  return row.id
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
  provider?: string
  onProgress?: (data: { total: number; synced: number; name: string }) => void
}

// 모드 저장
function saveMod(gameId: number, project: ProviderProject): number {
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
    gameId, project.id, project.slug, project.name,
    project.description, project.icon_url,
    JSON.stringify(project.categories),
    JSON.stringify(project.loaders),
    project.downloads, project.follows,
    project.license,
    project.updated_at,
  ) as { id: number }

  return res.id
}

function saveVersions(modId: number, versions: ProviderVersion[]): void {
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
    INSERT INTO mod_dependencies (mod_version_id, depends_on_mod_id, modrinth_dep_id, modrinth_dep_version_id, dep_type)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (mod_version_id, modrinth_dep_id, dep_type) DO UPDATE SET
      depends_on_mod_id = excluded.depends_on_mod_id,
      modrinth_dep_version_id = excluded.modrinth_dep_version_id
  `)

  for (const ver of versions) {
    const vRes = vStmt.get(
      modId, ver.id, ver.version_number, ver.version_type,
      JSON.stringify(ver.game_versions),
      JSON.stringify(ver.loaders),
      ver.file_url, ver.file_name,
      ver.file_size, ver.file_hash_sha1,
      ver.is_featured ? 1 : 0, // SQLite는 boolean 대신 1/0
      ver.published_at,
    ) as { id: number }

    for (const dep of ver.dependencies) {
      let depModId: number | null = null
      if (dep.project_id) {
        const dr = db.prepare('SELECT id FROM mods WHERE modrinth_id = ?').get(dep.project_id) as { id: number } | undefined
        depModId = dr?.id ?? null
      }
      depStmt.run(
        vRes.id,
        depModId,
        dep.project_id ?? dep.version_id ?? 'unknown',
        dep.version_id ?? null,
        dep.dep_type,
      )
    }
  }
}

// 프로바이더 데이터를 로컬 카탈로그에 저장 (mrpack 가져오기 등 외부에서도 사용)
export function cacheProject(project: ProviderProject, versions: ProviderVersion[]): number {
  const gameId = getGameId()
  const saveTransaction = db.transaction(() => {
    const modId = saveMod(gameId, project)
    saveVersions(modId, versions)
    return modId
  })
  return saveTransaction()
}

// 단일 모드 즉시 캐시
export async function fetchAndCache(projectId: string, provider: ModProvider = defaultProvider): Promise<number> {
  const project = await provider.getProject(projectId)
  const versions = await provider.getVersions(projectId)
  return cacheProject(project, versions)
}

// 인기 모드 동기화
export async function syncCatalog(opts: SyncOptions = {}) {
  const { limit = 200, onProgress } = opts
  const provider = getProvider(opts.provider)

  const logRes = db.prepare(`INSERT INTO sync_log (status) VALUES ('running') RETURNING id`).get() as { id: number }
  const logId = logRes.id

  let offset = 0, totalSynced = 0
  const errors: string[] = []

  try {
    while (offset < limit) {
      const take = Math.min(100, limit - offset)
      const { hits, total } = await provider.search({ index: 'downloads', limit: take, offset })
      if (!hits.length) break

      for (const hit of hits) {
        try {
          const project = await provider.getProject(hit.project_id)
          await sleep(200)
          const versions = await provider.getVersions(hit.project_id)
          await sleep(200)

          cacheProject(project, versions)

          totalSynced++
          // total은 전체 모드 수가 아니라 이번 동기화 범위 기준 (진행률 계산용)
          onProgress?.({ total: Math.min(limit, total), synced: totalSynced, name: project.name })
        } catch (err: any) {
          errors.push(`${hit.project_id}: ${err.message}`)
        }
      }

      offset += hits.length
      if (offset >= total) break
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
      mv.file_url, mv.file_name,
      MAX(mv.published_at) AS latest_published_at
    FROM mods m
    LEFT JOIN mod_versions mv ON mv.mod_id = m.id
      -- GROUP BY + MAX(published_at): SQLite는 MAX가 있으면 나머지 mv 컬럼을 최신 행 기준으로 채움
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
    WHERE m.modrinth_id = ?
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
      mv2.version_number, mv2.modrinth_ver_id, mv2.file_url, mv2.file_name,
      MAX(mv2.published_at) AS latest_published_at
    FROM mod_dependencies d
    LEFT JOIN mods m ON m.id = d.depends_on_mod_id
    LEFT JOIN mod_versions mv2 ON mv2.mod_id = m.id
  `
  const depParams: any[] = []

  // 버전 필터는 WHERE가 아닌 JOIN 조건에 둬야 로컬에 캐시 안 된 의존성(m이 NULL)이 사라지지 않음
  if (gameVersion) {
    depSql += ` AND mv2.game_versions LIKE ?`
    depParams.push(`%"${gameVersion}"%`)
  }

  depSql += ` WHERE d.mod_version_id = ? AND d.dep_type IN ('required','optional')`
  depParams.push(versionId)

  depSql += ` GROUP BY d.id ORDER BY d.dep_type ASC`

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
    ORDER BY
      CASE mv.version_type WHEN 'release' THEN 0 WHEN 'beta' THEN 1 ELSE 2 END,
      mv.published_at DESC
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
  opts: { gameVersion?: string; loader?: string; modrinthIds?: string[] } = {}
) {
  const installed = db.prepare(`
    SELECT
      m.id, m.modrinth_id, m.slug, m.name, m.icon_url,
      mv.id AS installed_ver_db_id,
      mv.modrinth_ver_id AS installed_version_id,
      mv.version_number AS installed_version_number,
      mv.version_type AS installed_version_type,
      mv.published_at AS installed_published_at
    FROM profile_mods pm
    JOIN mods m ON pm.mod_id = m.id
    LEFT JOIN mod_versions mv ON pm.mod_version_id = mv.id
    WHERE pm.profile_id = ?
    ORDER BY m.name ASC
  `).all(profileId) as any[]

  // 특정 모드만 확인하고 싶을 때(업데이트 적용 등) 불필요한 API 재조회를 피한다
  const targets = Array.isArray(opts.modrinthIds) && opts.modrinthIds.length
    ? installed.filter((mod) => opts.modrinthIds!.includes(mod.modrinth_id))
    : installed

  const results: any[] = []

  for (const mod of targets) {
    await fetchAndCache(mod.modrinth_id).catch(() => {})

    // 설치본이 release면 안정 채널을 우선 추적하고, beta/alpha면 해당 채널의 최신도 후보에 포함
    const preferStable = mod.installed_version_type !== 'beta' && mod.installed_version_type !== 'alpha'
    const orderClause = preferStable
      ? `CASE version_type WHEN 'release' THEN 0 WHEN 'beta' THEN 1 ELSE 2 END, published_at DESC`
      : `published_at DESC`

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
      ORDER BY ${orderClause}
      LIMIT 1
    `).get(
      mod.id,
      opts.gameVersion ?? null,
      opts.gameVersion ? `%"${opts.gameVersion}"%` : null,
      opts.loader ?? null,
      opts.loader ? `%"${opts.loader.toLowerCase()}"%` : null,
    ) as any

    // 발행일 비교로 다운그레이드 제안 방지 (설치본 발행일을 모르면 업데이트 허용)
    const isNewer = latest?.published_at && mod.installed_published_at
      ? latest.published_at > mod.installed_published_at
      : true
    const updateAvailable = Boolean(
      latest?.latest_version_id && latest.latest_version_id !== mod.installed_version_id && isNewer
    )

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
      update_available: updateAvailable,
      status: latest ? (updateAvailable ? 'update_available' : 'up_to_date') : 'unknown',
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

// 프로바이더 직접 검색 (fallback)
export async function searchRemote(
  query: string,
  opts: { loader?: string; gameVersion?: string; limit?: number; provider?: string } = {}
): Promise<ModRow[]> {
  const { loader, gameVersion, limit = 10 } = opts
  const provider = getProvider(opts.provider)

  const { hits } = await provider.search({ query, loader, gameVersion, limit, index: 'relevance' })

  // 백그라운드 캐시 (fire & forget)
  for (const hit of hits.slice(0, 3)) {
    fetchAndCache(hit.project_id, provider).catch(() => {})
  }

  return hits.map((h) => ({
    modrinth_id:     h.project_id,
    name:            h.name,
    slug:            h.slug ?? h.project_id,
    description:     h.description ?? '',
    icon_url:        h.icon_url,
    downloads:       h.downloads,
    categories:      h.categories,
    loaders:         h.loaders,
    version_number:  h.latest_version ?? '',
    modrinth_ver_id: '',
    file_url:        null,
    file_name:       null,
    source:          'api' as const,
  })) as ModRow[]
}
