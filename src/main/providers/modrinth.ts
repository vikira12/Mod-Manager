import axios from 'axios'
import type {
  ModProvider,
  ProviderDependency,
  ProviderProject,
  ProviderSearchHit,
  ProviderSearchOptions,
  ProviderVersion,
} from './types'

const api = axios.create({
  baseURL: 'https://api.modrinth.com/v2',
  headers: { 'User-Agent': 'ModForge/0.1.0 (github.com/modforge)' },
  timeout: 15000,
})

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

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

function mapProject(project: any): ProviderProject {
  return {
    id: project.id,
    slug: project.slug ?? null,
    name: project.title,
    description: project.description ?? null,
    icon_url: project.icon_url ?? null,
    categories: project.categories ?? [],
    loaders: project.loaders ?? [],
    downloads: project.downloads ?? 0,
    follows: project.followers ?? 0,
    license: project.license?.id ?? null,
    updated_at: project.updated ? new Date(project.updated).toISOString() : null,
  }
}

function mapVersion(ver: any): ProviderVersion {
  const primary = ver.files?.find((f: any) => f.primary) ?? ver.files?.[0]
  return {
    id: ver.id,
    version_number: ver.version_number,
    version_type: ver.version_type ?? 'release',
    game_versions: ver.game_versions ?? [],
    loaders: ver.loaders ?? [],
    file_url: primary?.url ?? null,
    file_name: primary?.filename ?? null,
    file_size: primary?.size ?? null,
    file_hash_sha1: primary?.hashes?.sha1 ?? null,
    is_featured: Boolean(ver.featured),
    published_at: ver.date_published ? new Date(ver.date_published).toISOString() : null,
    dependencies: (ver.dependencies ?? []).map((dep: any): ProviderDependency => ({
      project_id: dep.project_id ?? null,
      version_id: dep.version_id ?? null,
      dep_type: dep.dependency_type ?? 'required',
    })),
  }
}

function mapHit(hit: any): ProviderSearchHit {
  return {
    project_id: hit.project_id,
    slug: hit.slug ?? null,
    name: hit.title,
    description: hit.description ?? null,
    icon_url: hit.icon_url ?? null,
    downloads: hit.downloads ?? 0,
    categories: hit.categories ?? [],
    loaders: hit.loaders ?? [],
    latest_version: hit.latest_version ?? null,
  }
}

class ModrinthProvider implements ModProvider {
  readonly id = 'modrinth'
  readonly name = 'Modrinth'

  async search(opts: ProviderSearchOptions): Promise<{ hits: ProviderSearchHit[]; total: number }> {
    const facets = [['project_type:mod']]
    if (opts.loader) facets.push([`categories:${opts.loader.toLowerCase()}`])
    if (opts.gameVersion) facets.push([`versions:${opts.gameVersion}`])

    const { data } = await withRetry(() =>
      api.get('/search', {
        params: {
          query: opts.query ?? '',
          facets: JSON.stringify(facets),
          limit: opts.limit ?? 10,
          offset: opts.offset ?? 0,
          index: opts.index ?? 'relevance',
        },
      })
    )

    return { hits: (data.hits ?? []).map(mapHit), total: data.total_hits ?? 0 }
  }

  async getProject(projectId: string): Promise<ProviderProject> {
    const { data } = await withRetry(() => api.get(`/project/${projectId}`))
    return mapProject(data)
  }

  async getVersions(projectId: string): Promise<ProviderVersion[]> {
    const { data } = await withRetry(() => api.get(`/project/${projectId}/version`))
    return (data as any[]).map(mapVersion)
  }

  // 파일 해시 → 버전 벌크 조회 (mrpack 가져오기용, 파일 수와 무관하게 1회 호출)
  async getVersionsByHashes(
    hashes: string[],
    algorithm: 'sha1' | 'sha512'
  ): Promise<Record<string, { projectId: string; version: ProviderVersion }>> {
    if (!hashes.length) return {}
    const { data } = await withRetry(() => api.post('/version_files', { hashes, algorithm }))
    const out: Record<string, { projectId: string; version: ProviderVersion }> = {}
    for (const [hash, ver] of Object.entries<any>(data ?? {})) {
      if (ver?.project_id) out[hash] = { projectId: ver.project_id, version: mapVersion(ver) }
    }
    return out
  }

  async getProjects(projectIds: string[]): Promise<ProviderProject[]> {
    if (!projectIds.length) return []
    const { data } = await withRetry(() =>
      api.get('/projects', { params: { ids: JSON.stringify(projectIds) } })
    )
    return (data as any[]).map(mapProject)
  }
}

export const modrinthProvider = new ModrinthProvider()
