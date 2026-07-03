export interface ModRow {
  id?: number
  ver_id?: number
  modrinth_id: string
  name: string
  slug?: string
  description: string
  icon_url: string | null
  downloads: number
  // resolver의 DepNode처럼 일부 경로에서는 채워지지 않음
  categories?: string[]
  loaders?: string[]
  version_number: string
  modrinth_ver_id: string
  file_url: string | null
  file_name: string | null
  dep_type?: DepType
  depth?: number
  // 의존성이 이 정확한 버전을 고정(pin)해서 선택된 경우
  pinned?: boolean
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

export interface AppliedUpdate {
  modrinth_id: string
  name: string
  fileName: string
  version_number: string | null
  removedOld: string | null
}

export interface ApplyUpdatesResult {
  ok: boolean
  applied: AppliedUpdate[]
  failed: { name: string; reason: string }[]
  backupPath: string | null
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
    errors?: string | null
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
  pinned:          boolean
  children:        DepNode[]
}

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
  ok:           boolean
  root:         DepNode | null
  installOrder: DepNode[]
  required:     DepNode[]
  optional:     DepNode[]
  conflicts:    { mod: DepNode; conflictWith: string }[]
  pinConflicts: PinConflict[]
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

export interface MrpackProgress {
  total: number
  done: number
  name: string
}

export interface MrpackImportResult {
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

export interface ActivateProfileResult {
  ok: boolean
  storagePath?: string
  targetPath?: string
  backupPath?: string | null
  adoptedFiles?: number
  error?: string
}

export interface DeviceCodeInfo {
  user_code: string
  verification_uri: string
  expires_in: number
  interval: number
  message: string
}

export interface AuthStatus {
  loggedIn: boolean
  name?: string
  uuid?: string
  tokenValid?: boolean
  clientIdConfigured: boolean
  offlineEnabled: boolean
  offlineUsername?: string
}

export interface AuthStartResult {
  ok: boolean
  profile?: { id: string; name: string }
  error?: string
  errorCode?: 'NO_CLIENT_ID' | 'CANCELED' | 'EXPIRED' | 'NO_XBOX' | 'CHILD_ACCOUNT' | 'NO_PROFILE' | 'UNKNOWN'
}

export interface GameFilesProgress {
  phase: 'client' | 'libraries' | 'assets'
  done: number
  total: number
  name: string
}

export interface PrepareGameFilesResult {
  ok: boolean
  versionId?: string
  jarId?: string
  loaderInstalled?: boolean
  clientDownloaded?: boolean
  librariesTotal?: number
  librariesDownloaded?: number
  librariesMissing?: number
  assetsTotal?: number
  assetsDownloaded?: number
  assetsFailed?: number
  needsLoaderInstall?: boolean
  helpUrl?: string
  error?: string
}

export interface GameLaunchResult {
  ok: boolean
  pid?: number
  versionId?: string
  javaMajor?: number | null
  offline?: boolean
  activated?: boolean
  needsLogin?: boolean
  needsLoaderInstall?: boolean
  helpUrl?: string
  error?: string
}

export interface LaunchProfileResult {
  ok: boolean
  versionId?: string | null
  loaderInstalled?: boolean
  launcherOpened?: boolean
  registeredName?: string
  activated?: boolean
  needsLoaderInstall?: boolean
  helpUrl?: string
  warning?: string
  error?: string
}

export interface ElectronAPI {
  searchMod:          (query: string, opts?: { loader?: string; gameVersion?: string }) => Promise<SearchResult>
  getRecommendations: (data: { profileId: string; loader?: string; gameVersion?: string; limit?: number }) => Promise<RecommendationResult>
  getDependencies:    (modrinthId: string, opts?: { gameVersion?: string; loader?: string }) => Promise<DependencyResult>
  getModDetail:       (modrinthId: string, opts?: { gameVersion?: string; loader?: string }) => Promise<ModDetailResult>
  checkProfileUpdates: (profileId: string, opts?: { gameVersion?: string; loader?: string; modrinthIds?: string[] }) => Promise<UpdateCheckResult>
  applyProfileUpdates: (profileId: string, opts?: { gameVersion?: string; loader?: string; modrinthIds?: string[] }) => Promise<ApplyUpdatesResult>

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
  activateProfile: (profileId: string) => Promise<ActivateProfileResult>
  deactivateProfile: () => Promise<{ ok: boolean; targetPath?: string; error?: string }>
  launchProfile: (profileId: string) => Promise<LaunchProfileResult>
  onLoaderInstallProgress: (cb: (data: { message: string }) => void) => () => void
  prepareGameFiles: (profileId: string) => Promise<PrepareGameFilesResult>
  onGameFilesProgress: (cb: (data: GameFilesProgress) => void) => () => void
  launchGameDirect: (profileId: string) => Promise<GameLaunchResult>
  stopGame: (profileId: string) => Promise<{ ok: boolean }>
  onGameLog: (cb: (data: { lines: string[] }) => void) => () => void
  onGameExit: (cb: (data: {
    profileId: number
    code: number | null
    crashed: boolean
    crashReportPath: string | null
    crashSummary: string | null
  }) => void) => () => void

  // Microsoft 계정 인증
  authStatus: () => Promise<AuthStatus>
  authStart: () => Promise<AuthStartResult>
  authCancel: () => Promise<{ ok: boolean }>
  authLogout: () => Promise<{ ok: boolean }>
  authGetClientId: () => Promise<{ clientId: string | null }>
  authSetClientId: (clientId: string | null) => Promise<{ ok: boolean }>
  authSetOffline: (enabled: boolean, username?: string) => Promise<{ ok: boolean; error?: string; status?: AuthStatus }>
  getLaunchSettings: () => Promise<{ memoryMb: number; totalMemoryMb: number }>
  setLaunchSettings: (data: { memoryMb?: number }) => Promise<{ ok: boolean }>
  onAuthDeviceCode: (cb: (data: DeviceCodeInfo) => void) => () => void
  onAuthStage: (cb: (data: { message: string }) => void) => () => void
  backupProfileMods: (profileId: string) => Promise<{ ok: boolean; backupPath?: string; error?: string }>
  restoreProfileBackup: (profileId: string, backupPath: string) => Promise<{ ok: boolean; restoredPath?: string; currentBackup?: string | null; error?: string }>
  getInstalledMods: (profileId: string) => Promise<any[]>
  exportProfilePack: (profileId: string) => Promise<ExportPackResult>
  importProfilePack: () => Promise<ImportPackResult>
  importMrpack: () => Promise<MrpackImportResult>
  onMrpackProgress: (cb: (data: MrpackProgress) => void) => () => void
  uninstallMod: (profileId: string, modId: string, opts?: { deleteFile?: boolean }) => Promise<{ ok: boolean; deletedFile?: string | null; warning?: string }>
  saveProfileMods: (profileId: string, mods: Array<number | { id: number; ver_id?: number }>) => Promise<{ ok: boolean }>
}

declare global {
  interface Window {
    electron: ElectronAPI
  }
}
