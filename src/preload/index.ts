import { contextBridge, ipcRenderer } from 'electron'
import type { ElectronAPI } from './index.d'

const api: ElectronAPI = {
  // 모드 검색
  searchMod: (query, opts = {}) =>
    ipcRenderer.invoke('search-mod', query, opts),

  getRecommendations: (data) =>
    ipcRenderer.invoke('get-recommendations', data),

  // 의존성 처리
  getDependencies: (modrinthId, opts = {}) =>
    ipcRenderer.invoke('get-dependencies', modrinthId, opts),

  getModDetail: (modrinthId, opts = {}) =>
    ipcRenderer.invoke('get-mod-detail', modrinthId, opts),

  checkProfileUpdates: (profileId, opts = {}) =>
    ipcRenderer.invoke('check-profile-updates', profileId, opts),

  applyProfileUpdates: (profileId, opts = {}) =>
    ipcRenderer.invoke('apply-profile-updates', profileId, opts),

  resolveDeps: (modrinthId, opts = {}) =>
    ipcRenderer.invoke('resolve-deps', modrinthId, opts),

  validateSelection: (modrinthIds, opts = {}) =>
    ipcRenderer.invoke('validate-selection', modrinthIds, opts),

  scanModJars: (modsPath) =>
    ipcRenderer.invoke('scan-mod-jars', modsPath),

  validateInstallPlan: (data) =>
    ipcRenderer.invoke('validate-install-plan', data),

  // 모드 설치
  downloadMods: (mods, installPath) =>
    ipcRenderer.invoke('download-mods', mods, installPath),

  // 폴더 연결 (Junction)
  createJunction: (sourceDir: string, targetDir: string) =>
    ipcRenderer.invoke('create-junction', sourceDir, targetDir),

  removeJunction: (targetDir: string) =>
    ipcRenderer.invoke('remove-junction', targetDir),

  // DB 동기화
  syncModrinth: (opts = {}) =>
    ipcRenderer.invoke('sync-modrinth', opts),

  syncStatus: () =>
    ipcRenderer.invoke('sync-status'),

  // 유틸
  openFolder: (path) =>
    ipcRenderer.invoke('open-folder', path),

  selectInstallPath: () =>
    ipcRenderer.invoke('select-install-path'),

  // 이벤트 리스너
  onSyncProgress: (cb) => {
    const handler = (_: Electron.IpcRendererEvent, data: any) => cb(data)
    ipcRenderer.on('sync-progress', handler)
    return () => ipcRenderer.removeListener('sync-progress', handler)
  },

  onInstallProgress: (cb) => {
    const handler = (_: Electron.IpcRendererEvent, data: any) => cb(data)
    ipcRenderer.on('install-progress', handler)
    return () => ipcRenderer.removeListener('install-progress', handler)
  },
  
  getProfiles: () => 
    ipcRenderer.invoke('get-profiles'),
    
  createProfile: (data) => 
    ipcRenderer.invoke('create-profile', data),
    
  deleteProfile: (id) => 
    ipcRenderer.invoke('delete-profile', id),

  updateProfilePath: (profileId, installPath) =>
    ipcRenderer.invoke('update-profile-path', profileId, installPath),

  activateProfile: (profileId) =>
    ipcRenderer.invoke('activate-profile', profileId),

  deactivateProfile: () =>
    ipcRenderer.invoke('deactivate-profile'),

  launchProfile: (profileId) =>
    ipcRenderer.invoke('launch-profile', profileId),

  onLoaderInstallProgress: (cb) => {
    const handler = (_: Electron.IpcRendererEvent, data: any) => cb(data)
    ipcRenderer.on('loader-install-progress', handler)
    return () => ipcRenderer.removeListener('loader-install-progress', handler)
  },

  prepareGameFiles: (profileId) =>
    ipcRenderer.invoke('prepare-game-files', profileId),

  launchGameDirect: (profileId) =>
    ipcRenderer.invoke('launch-game-direct', profileId),

  stopGame: (profileId) =>
    ipcRenderer.invoke('stop-game', profileId),

  onGameLog: (cb) => {
    const handler = (_: Electron.IpcRendererEvent, data: any) => cb(data)
    ipcRenderer.on('game-log', handler)
    return () => ipcRenderer.removeListener('game-log', handler)
  },

  onGameExit: (cb) => {
    const handler = (_: Electron.IpcRendererEvent, data: any) => cb(data)
    ipcRenderer.on('game-exit', handler)
    return () => ipcRenderer.removeListener('game-exit', handler)
  },

  onGameFilesProgress: (cb) => {
    const handler = (_: Electron.IpcRendererEvent, data: any) => cb(data)
    ipcRenderer.on('game-files-progress', handler)
    return () => ipcRenderer.removeListener('game-files-progress', handler)
  },

  // Microsoft 계정 인증
  authStatus: () => ipcRenderer.invoke('auth-status'),
  authStart: () => ipcRenderer.invoke('auth-start'),
  authCancel: () => ipcRenderer.invoke('auth-cancel'),
  authLogout: () => ipcRenderer.invoke('auth-logout'),
  authGetClientId: () => ipcRenderer.invoke('auth-get-client-id'),
  authSetClientId: (clientId) => ipcRenderer.invoke('auth-set-client-id', clientId),
  authSetOffline: (enabled, username) => ipcRenderer.invoke('auth-set-offline', enabled, username),

  getLaunchSettings: () => ipcRenderer.invoke('get-launch-settings'),
  setLaunchSettings: (data) => ipcRenderer.invoke('set-launch-settings', data),

  onAuthDeviceCode: (cb) => {
    const handler = (_: Electron.IpcRendererEvent, data: any) => cb(data)
    ipcRenderer.on('auth-device-code', handler)
    return () => ipcRenderer.removeListener('auth-device-code', handler)
  },

  onAuthStage: (cb) => {
    const handler = (_: Electron.IpcRendererEvent, data: any) => cb(data)
    ipcRenderer.on('auth-stage', handler)
    return () => ipcRenderer.removeListener('auth-stage', handler)
  },

  backupProfileMods: (profileId) =>
    ipcRenderer.invoke('backup-profile-mods', profileId),

  restoreProfileBackup: (profileId, backupPath) =>
    ipcRenderer.invoke('restore-profile-backup', profileId, backupPath),
    
  getInstalledMods: (profileId) => 
    ipcRenderer.invoke('get-installed-mods', profileId),

  exportProfilePack: (profileId) =>
    ipcRenderer.invoke('export-profile-pack', profileId),

  importProfilePack: () =>
    ipcRenderer.invoke('import-profile-pack'),

  importMrpack: () =>
    ipcRenderer.invoke('import-mrpack'),

  onMrpackProgress: (cb) => {
    const handler = (_: Electron.IpcRendererEvent, data: any) => cb(data)
    ipcRenderer.on('mrpack-progress', handler)
    return () => ipcRenderer.removeListener('mrpack-progress', handler)
  },
    
  uninstallMod: (profileId, modId, opts = {}) => 
    ipcRenderer.invoke('uninstall-mod', profileId, modId, opts),

  saveProfileMods: (profileId, modIds) => 
    ipcRenderer.invoke('save-profile-mods', profileId, modIds),
}

contextBridge.exposeInMainWorld('electron', api)
