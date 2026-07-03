// 모드 소스(Modrinth, 향후 CurseForge 등)가 구현해야 하는 공용 인터페이스.
// 게임/소스별 차이는 전부 프로바이더 구현체 안에 격리하고,
// 캐시·검색·의존성 계층(catalog.ts)은 이 타입만 사용한다.

export type DependencyType = 'required' | 'optional' | 'incompatible' | 'embedded'

export interface ProviderDependency {
  project_id: string | null
  // 특정 버전을 고정(pin)하는 의존성인 경우
  version_id: string | null
  dep_type: DependencyType
}

export interface ProviderVersion {
  id: string
  version_number: string
  version_type: 'release' | 'beta' | 'alpha' | string
  game_versions: string[]
  loaders: string[]
  file_url: string | null
  file_name: string | null
  file_size: number | null
  file_hash_sha1: string | null
  is_featured: boolean
  // ISO 문자열
  published_at: string | null
  dependencies: ProviderDependency[]
}

export interface ProviderProject {
  id: string
  slug: string | null
  name: string
  description: string | null
  icon_url: string | null
  categories: string[]
  loaders: string[]
  downloads: number
  follows: number
  license: string | null
  updated_at: string | null
}

export interface ProviderSearchHit {
  project_id: string
  slug: string | null
  name: string
  description: string | null
  icon_url: string | null
  downloads: number
  categories: string[]
  loaders: string[]
  latest_version: string | null
}

export interface ProviderSearchOptions {
  query?: string
  loader?: string
  gameVersion?: string
  limit?: number
  offset?: number
  index?: 'relevance' | 'downloads'
}

export interface ModProvider {
  readonly id: string
  readonly name: string
  search(opts: ProviderSearchOptions): Promise<{ hits: ProviderSearchHit[]; total: number }>
  getProject(projectId: string): Promise<ProviderProject>
  getVersions(projectId: string): Promise<ProviderVersion[]>
  // 벌크 조회 (선택 구현): 모드팩 가져오기처럼 파일이 많을 때 API 호출을 줄인다
  getVersionsByHashes?(
    hashes: string[],
    algorithm: 'sha1' | 'sha512'
  ): Promise<Record<string, { projectId: string; version: ProviderVersion }>>
  getProjects?(projectIds: string[]): Promise<ProviderProject[]>
}
