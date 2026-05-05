import { db } from './db'
import { fetchAndCache } from './modrinth'

export type DepType = 'required' | 'optional' | 'incompatible' | 'embedded'

export interface DepNode {
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
  children: DepNode[]
}

export interface ResolveResult {
  ok: boolean
  root: DepNode | null
  installOrder: DepNode[]
  required: DepNode[]
  optional: DepNode[]
  conflicts: { mod: DepNode; conflictWith: string }[]
  error?: string
}

export async function resolveDependencies(
  modrinthId: string,
  opts: { gameVersion?: string; loader?: string; selected?: Set<string> } = {}
): Promise<ResolveResult> {
  const { gameVersion, loader, selected = new Set<string>() } = opts

  const visited = new Set<string>()
  const inStack = new Set<string>()
  const allNodes = new Map<string, DepNode>()
  const conflicts: { mod: DepNode; conflictWith: string }[] = []
  const installed = new Set<string>(selected)

  async function dfs(id: string, depType: DepType, depth: number): Promise<DepNode | null> {
    if (inStack.has(id)) return null

    if (visited.has(id)) {
      const cached = allNodes.get(id)
      return cached ? { ...cached, dep_type: depType } : null
    }

    inStack.add(id)

    let modRow = fetchModRow(id, gameVersion, loader)

    if (!modRow) {
      console.log(`[DFS Fallback] 로컬 DB에 ${id}가 없습니다. Modrinth API에서 다운로드합니다...`)
      try {
        await fetchAndCache(id) // API에서 데이터를 긁어와 로컬 DB에 저장
        modRow = fetchModRow(id, gameVersion, loader) // 저장된 데이터를 DB에서 다시 조회
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
        const child = await dfs(dep.modrinth_dep_id, dep.dep_type as DepType, depth + 1)
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

  try {
    const root = await dfs(modrinthId, 'required', 0)

    if (!root) {
      return { ok: false, root: null, installOrder: [], required: [], optional: [], conflicts, error: '모드 정보를 찾을 수 없거나 호환되는 버전이 없습니다.' }
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
    }
  } catch (err: any) {
    return { ok: false, root: null, installOrder: [], required: [], optional: [], conflicts, error: err.message }
  }
}

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

interface ModRowRaw {
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

function fetchModRow(modrinthId: string, gameVersion?: string, loader?: string): ModRowRaw | null {
  let sql = `
    SELECT
      m.modrinth_id, m.name, m.description, m.icon_url, m.downloads,
      mv.version_number, mv.modrinth_ver_id, mv.file_url, mv.file_name,
      mv.id AS ver_id
    FROM mods m
    JOIN mod_versions mv ON mv.mod_id = m.id
    WHERE m.modrinth_id = ?
      AND mv.version_type = 'release'
  `
  const params: any[] = [modrinthId]

  if (gameVersion) {
    sql += ` AND mv.game_versions LIKE ? `
    params.push(`%${gameVersion}%`)
  }
  if (loader) {
    sql += ` AND mv.loaders LIKE ? `
    params.push(`%${loader}%`)
  }

  sql += ` ORDER BY mv.published_at DESC LIMIT 1`

  return db.prepare(sql).get(...params) as ModRowRaw | undefined ?? null
}

interface DepRowRaw {
  modrinth_dep_id: string
  dep_type: DepType
}

function fetchDeps(versionDbId: number): DepRowRaw[] {
  return db.prepare(`
    SELECT modrinth_dep_id, dep_type
    FROM mod_dependencies
    WHERE mod_version_id = ?
      AND dep_type IN ('required','optional','incompatible','embedded')
      AND modrinth_dep_id IS NOT NULL
      AND modrinth_dep_id != 'unknown'
    ORDER BY dep_type ASC
  `).all(versionDbId) as DepRowRaw[]
}

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