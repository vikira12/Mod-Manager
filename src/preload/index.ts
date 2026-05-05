import { contextBridge, ipcRenderer } from 'electron'
import type { ElectronAPI } from './index.d'

const api: ElectronAPI = {
  // 모드 검색
  searchMod: (query, opts = {}) =>
    ipcRenderer.invoke('search-mod', query, opts),

  // 의존성 처리
  getDependencies: (modrinthId, opts = {}) =>
    ipcRenderer.invoke('get-dependencies', modrinthId, opts),

  resolveDeps: (modrinthId, opts = {}) =>
    ipcRenderer.invoke('resolve-deps', modrinthId, opts),

  validateSelection: (modrinthIds, opts = {}) =>
    ipcRenderer.invoke('validate-selection', modrinthIds, opts),

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
    
  getInstalledMods: (profileId) => 
    ipcRenderer.invoke('get-installed-mods', profileId),
    
  uninstallMod: (profileId, modId) => 
    ipcRenderer.invoke('uninstall-mod', profileId, modId),
}

contextBridge.exposeInMainWorld('electron', api)