import { db } from './db'
import { fetchAndCache } from './catalog' 

export type DepType = 'required' | 'optional' | 'incompatible' | 'embedded'

export interface DepNode {
  id: number
  ver_id: number
  modrinth_id: string
  name: string
  description: string
  icon_url: string | null
  downloads: number
  version_number: string
  modrinth_ver_id: string
  file_url: string | null
  file_name: string | null
  dep_type: DepType
  depth: number
  // 부모 의존성이 이 정확한 버전을 고정(pin)해서 선택된 경우 true
  pinned: boolean
  children: DepNode[]
}

// 서로 다른 부모가 같은 의존성에 서로 다른 버전을 고정(pin)한 경우
export interface PinConflict {
  modrinth_id: string
  name: string
  chosen_version_id: string | null
  chosen_version_number: string | null
  requests: {
    version_id: string
    version_number: string | null
    requested_by: string[]
  }[]
}

export interface ResolveResult {
  ok: boolean
  root: DepNode | null
  installOrder: DepNode[]
  required: DepNode[]
  optional: DepNode[]
  conflicts: { mod: DepNode; conflictWith: string }[]
  pinConflicts: PinConflict[]
  error?: string
}

// 메인 resolver
export async function resolveDependencies(
  modrinthId: string,
  opts: { gameVersion?: string; loader?: string; selected?: Iterable<string> } = {}
): Promise<ResolveResult> {
  const { gameVersion, loader, selected = new Set<string>() } = opts

  const visited = new Set<string>()
  const inStack = new Set<string>()
  const allNodes = new Map<string, DepNode>()
  const conflicts: { mod: DepNode; conflictWith: string }[] = []
  const installed = new Set<string>(selected)
  // 의존성 ID → (요구된 버전 ID → 요구한 부모 모드 이름들)
  const pinRequests = new Map<string, Map<string, Set<string>>>()

  async function dfs(
    id: string,
    depType: DepType,
    depth: number,
    pinnedVersionId?: string | null
  ): Promise<DepNode | null> {
    if (inStack.has(id)) return null

    if (visited.has(id)) {
      const cached = allNodes.get(id)
      return cached ? { ...cached, dep_type: depType } : null
    }

    inStack.add(id)

    let modRow = fetchModRow(id, gameVersion, loader, pinnedVersionId)

    if (!modRow) {
      console.log(`[DFS Fallback] 로컬 DB에 ${id}가 없어 API에서 다운로드합니다...`)
      try {
        await fetchAndCache(id) // API 호출로 DB 업데이트
        modRow = fetchModRow(id, gameVersion, loader, pinnedVersionId) // DB 재조회
      } catch (err: any) {
        console.warn(`[DFS Fallback] ${id} 데이터를 가져오지 못했습니다:`, err.message)
      }
    }

    if (!modRow) {
      inStack.delete(id)
      return null
    }

    const node: DepNode = {
      ...modRow,
      dep_type: depType,
      depth,
      pinned: Boolean(pinnedVersionId && modRow.modrinth_ver_id === pinnedVersionId),
      children: [],
    }

    const deps = fetchDeps(modRow.ver_id)

    for (const dep of deps) {
      if (dep.dep_type === 'incompatible') {
        if (installed.has(dep.modrinth_dep_id)) {
          conflicts.push({ mod: node, conflictWith: dep.modrinth_dep_id })
        }
        continue
      }

      if (dep.dep_type === 'embedded') continue

      if (dep.dep_type === 'required' || depth === 0) {
        // 버전 pin 요구를 기록해서 부모들 간 충돌을 나중에 감지
        if (dep.modrinth_dep_version_id) {
          let byVersion = pinRequests.get(dep.modrinth_dep_id)
          if (!byVersion) {
            byVersion = new Map()
            pinRequests.set(dep.modrinth_dep_id, byVersion)
          }
          let parents = byVersion.get(dep.modrinth_dep_version_id)
          if (!parents) {
            parents = new Set()
            byVersion.set(dep.modrinth_dep_version_id, parents)
          }
          parents.add(node.name)
        }

        const child = await dfs(
          dep.modrinth_dep_id,
          dep.dep_type as DepType,
          depth + 1,
          dep.modrinth_dep_version_id
        )
        if (child) {
          node.children.push(child)
          installed.add(dep.modrinth_dep_id)
        }
      }
    }

    visited.add(id)
    inStack.delete(id)
    allNodes.set(id, node)

    return node
  }

  // 실행
  try {
    const root = await dfs(modrinthId, 'required', 0)

    if (!root) {
      return { ok: false, root: null, installOrder: [], required: [], optional: [], conflicts, pinConflicts: [], error: '모드를 찾을 수 없습니다' }
    }

    const installOrder = topoSort(root)
    const required: DepNode[] = []
    const optional: DepNode[] = []

    for (const node of installOrder) {
      if (node.dep_type === 'optional') optional.push(node)
      else required.push(node)
    }

    return {
      ok: conflicts.length === 0,
      root,
      installOrder,
      required,
      optional,
      conflicts,
      pinConflicts: collectPinConflicts(pinRequests, allNodes),
    }
  } catch (err: any) {
    return { ok: false, root: null, installOrder: [], required: [], optional: [], conflicts, pinConflicts: [], error: err.message }
  }
}

// 같은 의존성에 두 개 이상의 서로 다른 버전이 요구된 경우만 추린다
function collectPinConflicts(
  pinRequests: Map<string, Map<string, Set<string>>>,
  allNodes: Map<string, DepNode>
): PinConflict[] {
  const result: PinConflict[] = []

  for (const [depId, byVersion] of pinRequests) {
    if (byVersion.size <= 1) continue

    const node = allNodes.get(depId)
    result.push({
      modrinth_id: depId,
      name: node?.name ?? depId,
      chosen_version_id: node?.modrinth_ver_id ?? null,
      chosen_version_number: node?.version_number ?? null,
      requests: [...byVersion.entries()].map(([versionId, parents]) => ({
        version_id: versionId,
        version_number: lookupVersionNumber(versionId),
        requested_by: [...parents],
      })),
    })
  }

  return result
}

function lookupVersionNumber(modrinthVerId: string): string | null {
  const row = db.prepare('SELECT version_number FROM mod_versions WHERE modrinth_ver_id = ?')
    .get(modrinthVerId) as { version_number?: string } | undefined
  return row?.version_number ?? null
}

// 위상 정렬
function topoSort(root: DepNode): DepNode[] {
  const sorted: DepNode[] = []
  const seen = new Set<string>()

  function visit(node: DepNode) {
    if (seen.has(node.modrinth_id)) return
    for (const child of node.children) visit(child)
    seen.add(node.modrinth_id)
    sorted.push(node)
  }

  visit(root)
  return sorted
}

// DB 조회 헬퍼
interface ModRowRaw {
  id: number
  modrinth_id: string
  name: string
  description: string
  icon_url: string | null
  downloads: number
  version_number: string
  modrinth_ver_id: string
  file_url: string | null
  file_name: string | null
  ver_id: number
}

const MOD_ROW_SELECT = `
  SELECT
    m.id,
    m.modrinth_id, m.name, m.description, m.icon_url, m.downloads,
    mv.version_number, mv.modrinth_ver_id, mv.file_url, mv.file_name,
    mv.id AS ver_id
  FROM mods m
  JOIN mod_versions mv ON mv.mod_id = m.id
  WHERE m.modrinth_id = ?
`

// JSON 배열 문자열이라 따옴표까지 포함해 매칭해야 "1.2"가 "1.20.1"에 걸리지 않음
function buildVersionFilters(gameVersion?: string, loader?: string): { sql: string; params: any[] } {
  let sql = ''
  const params: any[] = []
  if (gameVersion) {
    sql += ` AND mv.game_versions LIKE ? `
    params.push(`%"${gameVersion}"%`)
  }
  if (loader) {
    sql += ` AND LOWER(mv.loaders) LIKE ? `
    params.push(`%"${loader.toLowerCase()}"%`)
  }
  return { sql, params }
}

function fetchModRow(
  modrinthId: string,
  gameVersion?: string,
  loader?: string,
  pinnedVersionId?: string | null
): ModRowRaw | null {
  const filters = buildVersionFilters(gameVersion, loader)

  // 1) 의존성이 특정 버전을 고정했다면 그 버전을 우선 사용 (프로필과 호환될 때만)
  if (pinnedVersionId) {
    const pinned = db.prepare(
      MOD_ROW_SELECT + ` AND mv.modrinth_ver_id = ? ` + filters.sql + ` LIMIT 1`
    ).get(modrinthId, pinnedVersionId, ...filters.params) as ModRowRaw | undefined
    if (pinned) return pinned
  }

  // 2) 채널 선호(release > beta > alpha), 같은 채널이면 최신순
  const row = db.prepare(
    MOD_ROW_SELECT + filters.sql + `
    ORDER BY
      CASE mv.version_type WHEN 'release' THEN 0 WHEN 'beta' THEN 1 ELSE 2 END,
      mv.published_at DESC
    LIMIT 1`
  ).get(modrinthId, ...filters.params) as ModRowRaw | undefined

  return row ?? null
}

interface DepRowRaw {
  modrinth_dep_id: string
  modrinth_dep_version_id: string | null
  dep_type: DepType
}

function fetchDeps(versionDbId: number): DepRowRaw[] {
  return db.prepare(`
    SELECT modrinth_dep_id, modrinth_dep_version_id, dep_type
    FROM mod_dependencies
    WHERE mod_version_id = ?
      AND dep_type IN ('required','optional','incompatible','embedded')
      AND modrinth_dep_id IS NOT NULL
      AND modrinth_dep_id != 'unknown'
    ORDER BY dep_type ASC
  `).all(versionDbId) as DepRowRaw[]
}

// 선택된 모드 집합으로 재검증
export async function validateSelection(
  modrinthIds: string[],
  opts: { gameVersion?: string; loader?: string } = {}
): Promise<{ ok: boolean; conflicts: { a: string; b: string }[] }> {
  const conflicts: { a: string; b: string }[] = []
  const selected = new Set(modrinthIds)

  for (const id of modrinthIds) {
    const modRow = fetchModRow(id, opts.gameVersion, opts.loader)
    if (!modRow) continue

    const deps = fetchDeps(modRow.ver_id)
    for (const dep of deps) {
      if (dep.dep_type === 'incompatible' && selected.has(dep.modrinth_dep_id)) {
        conflicts.push({ a: id, b: dep.modrinth_dep_id })
      }
    }
  }

  return { ok: conflicts.length === 0, conflicts }
}
