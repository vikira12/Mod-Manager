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

export interface ElectronAPI {
  searchMod:          (query: string, opts?: { loader?: string; gameVersion?: string }) => Promise<SearchResult>
  getDependencies:    (modrinthId: string, opts?: { gameVersion?: string; loader?: string }) => Promise<DependencyResult>
  downloadMods:       (mods: ModRow[], installPath?: string) => Promise<InstallResult>
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