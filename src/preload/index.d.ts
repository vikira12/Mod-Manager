export interface ModRow {
  id?: number
  modrinth_id: string
  name: string
  slug: string
  description: string
  icon_url: string | null
  downloads: number
  categories: string[]
  loaders: string[]
  version_number: string
  modrinth_ver_id: string
  file_url: string | null
  file_name: string | null
  dep_type?: 'required' | 'optional'
  source?: 'local' | 'api' | 'mixed'
}

export interface SearchResult {
  results: ModRow[]
  source: 'local' | 'api' | 'mixed'
  error?: string
}

export interface DependencyResult {
  dependencies: ModRow[]
  error?: string
}

export interface InstallResult {
  success: boolean
  files: string[]
  failed: { name: string; reason: string }[]
}

export interface SyncResult {
  success: boolean
  synced?: number
  errors?: number
  error?: string
}

export interface SyncStatus {
  totalMods: number
  logs: {
    id: number
    status: string
    mods_synced: number
    started_at: string
    finished_at: string | null
  }[]
}

export interface SyncProgress {
  total: number
  synced: number
  name: string
}

export interface InstallProgress {
  name: string
  fileName?: string
  status: 'done' | 'error'
  reason?: string
}

export type DepType = 'required' | 'optional' | 'incompatible' | 'embedded'

export interface DepNode {
  modrinth_id:     string
  name:            string
  description:     string
  icon_url:        string | null
  downloads:       number
  version_number:  string
  modrinth_ver_id: string
  file_url:        string | null
  file_name:       string | null
  dep_type:        DepType
  depth:           number
  children:        DepNode[]
}

export interface ResolveResult {
  ok:           boolean
  root:         DepNode | null
  installOrder: DepNode[]
  required:     DepNode[]
  optional:     DepNode[]
  conflicts:    { mod: DepNode; conflictWith: string }[]
  error?:       string
}

export interface ValidationResult {
  ok:        boolean
  conflicts: { a: string; b: string }[]
  error?:    string
}

export interface ElectronAPI {
  searchMod:          (query: string, opts?: { loader?: string; gameVersion?: string }) => Promise<SearchResult>
  getDependencies:    (modrinthId: string, opts?: { gameVersion?: string; loader?: string }) => Promise<DependencyResult>

  // 의존성 해결 엔진
  resolveDeps:        (modrinthId: string, opts?: { gameVersion?: string; loader?: string; selected?: string[] }) => Promise<ResolveResult>
  validateSelection:  (modrinthIds: string[], opts?: { gameVersion?: string; loader?: string }) => Promise<ValidationResult>

  downloadMods:       (mods: ModRow[], installPath?: string) => Promise<InstallResult>
  
  // 폴더 연결 (Junction/Symlink)
  createJunction:     (sourceDir: string, targetDir: string) => Promise<{ ok: boolean; error?: string }>
  removeJunction:     (targetDir: string) => Promise<{ ok: boolean; error?: string }>

  syncModrinth:       (opts?: { limit?: number }) => Promise<SyncResult>
  syncStatus:         () => Promise<SyncStatus>
  openFolder:         (path: string) => Promise<void>
  
  onSyncProgress:     (cb: (data: SyncProgress) => void)    => () => void
  onInstallProgress:  (cb: (data: InstallProgress) => void) => () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
  }
}