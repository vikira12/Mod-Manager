export interface ModRow {
  id?: number
  ver_id?: number
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
  dep_type?: DepType
  depth?: number
  children?: DepNode[]
  source?: 'local' | 'api' | 'mixed'
  recommendation_score?: number
  recommendation_reason?: string
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

export interface ModDetail extends ModRow {
  follows?: number
  license?: string | null
  updated_at?: string | null
  version_type?: string
  game_versions?: string[]
  version_loaders?: string[]
  file_size?: number | null
  file_hash_sha1?: string | null
  published_at?: string | null
  dependencies?: ModRow[]
}

export interface ModDetailResult {
  ok: boolean
  detail: ModDetail | null
  error?: string
}

export interface ModUpdateInfo {
  modrinth_id: string
  slug: string
  name: string
  icon_url: string | null
  installed_version_id: string | null
  installed_version_number: string | null
  latest_version_id: string | null
  latest_version_number: string | null
  latest_file_url: string | null
  latest_file_name: string | null
  latest_ver_db_id: number | null
  update_available: boolean
  status: 'update_available' | 'up_to_date' | 'unknown'
}

export interface UpdateCheckResult {
  ok: boolean
  updates: ModUpdateInfo[]
  error?: string
}

export interface InstallResult {
  success: boolean
  files: string[]
  failed: { name: string; reason: string }[]
  backupPath?: string | null
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
  id:              number
  ver_id:          number
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

export interface RecommendationResult {
  ok: boolean
  recommendations: ModRow[]
  error?: string
}

export interface ScannedJarMod {
  source: 'jar'
  file_path: string
  file_name: string
  jar_mod_id: string | null
  name: string
  version_number: string | null
  loader: 'fabric' | 'forge' | 'quilt' | 'unknown'
}

export interface ConflictSubject {
  modrinth_id?: string | null
  slug?: string | null
  jar_mod_id?: string | null
  name?: string | null
  version_number?: string | null
  source?: string
}

export interface ConflictDetail {
  type: 'modrinth' | 'custom-rule'
  severity: 'warning' | 'blocker'
  a: ConflictSubject
  b: ConflictSubject
  reason: string
  source: string
}

export interface InstallPlanValidationResult {
  ok: boolean
  conflicts: ConflictDetail[]
  scannedJars: ScannedJarMod[]
  error?: string
}

export interface ExportPackResult {
  ok: boolean
  canceled?: boolean
  filePath?: string
  modCount?: number
  localJarCount?: number
  error?: string
}

export interface ImportPackResult {
  ok: boolean
  canceled?: boolean
  profileId?: number
  profileName?: string
  imported?: number
  downloaded?: number
  localJarCount?: number
  backupPath?: string | null
  failed?: { name: string; reason: string }[]
  error?: string
}

export interface ElectronAPI {
  searchMod:          (query: string, opts?: { loader?: string; gameVersion?: string }) => Promise<SearchResult>
  getRecommendations: (data: { profileId: string; loader?: string; gameVersion?: string; limit?: number }) => Promise<RecommendationResult>
  getDependencies:    (modrinthId: string, opts?: { gameVersion?: string; loader?: string }) => Promise<DependencyResult>
  getModDetail:       (modrinthId: string, opts?: { gameVersion?: string; loader?: string }) => Promise<ModDetailResult>
  checkProfileUpdates: (profileId: string, opts?: { gameVersion?: string; loader?: string }) => Promise<UpdateCheckResult>

  // 의존성 해결 엔진
  resolveDeps:        (modrinthId: string, opts?: { gameVersion?: string; loader?: string; selected?: string[] }) => Promise<ResolveResult>
  validateSelection:  (modrinthIds: string[], opts?: { gameVersion?: string; loader?: string }) => Promise<ValidationResult>
  scanModJars:        (modsPath?: string) => Promise<{ ok: boolean; mods: ScannedJarMod[]; error?: string }>
  validateInstallPlan: (data: {
    profileId: string
    selectedMods: ModRow[]
    installPath?: string
    gameVersion?: string
    loader?: string
  }) => Promise<InstallPlanValidationResult>

  downloadMods:       (mods: ModRow[], installPath?: string) => Promise<InstallResult>
  
  // 폴더 연결 (Junction/Symlink)
  createJunction:     (sourceDir: string, targetDir: string) => Promise<{ ok: boolean; error?: string }>
  removeJunction:     (targetDir: string) => Promise<{ ok: boolean; error?: string }>

  syncModrinth:       (opts?: { limit?: number }) => Promise<SyncResult>
  syncStatus:         () => Promise<SyncStatus>
  openFolder:         (path: string) => Promise<void>
  selectInstallPath:  () => Promise<{ ok: boolean; canceled?: boolean; path?: string }>
  
  onSyncProgress:     (cb: (data: SyncProgress) => void)    => () => void
  onInstallProgress:  (cb: (data: InstallProgress) => void) => () => void

  getProfiles: () => Promise<any[]>
  createProfile: (data: { name: string; gameVersion: string; loader: string }) => Promise<{ ok: boolean; id?: number }>
  deleteProfile: (id: string) => Promise<{ ok: boolean }>
  updateProfilePath: (profileId: string, installPath: string | null) => Promise<{ ok: boolean; error?: string }>
  backupProfileMods: (profileId: string) => Promise<{ ok: boolean; backupPath?: string; error?: string }>
  restoreProfileBackup: (profileId: string, backupPath: string) => Promise<{ ok: boolean; restoredPath?: string; currentBackup?: string | null; error?: string }>
  getInstalledMods: (profileId: string) => Promise<any[]>
  exportProfilePack: (profileId: string) => Promise<ExportPackResult>
  importProfilePack: () => Promise<ImportPackResult>
  uninstallMod: (profileId: string, modId: string, opts?: { deleteFile?: boolean }) => Promise<{ ok: boolean; deletedFile?: string | null; warning?: string }>
  saveProfileMods: (profileId: string, mods: Array<number | { id: number; ver_id?: number }>) => Promise<{ ok: boolean }>
}

declare global {
  interface Window {
    electron: ElectronAPI
  }
}
