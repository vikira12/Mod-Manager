import { contextBridge, ipcRenderer } from 'electron'
import type { ElectronAPI } from './index.d'

const api: ElectronAPI = {
  // 검색
  searchMod: (query, opts = {}) =>
    ipcRenderer.invoke('search-mod', query, opts),

  // 의존성
  getDependencies: (modrinthId, opts = {}) =>
    ipcRenderer.invoke('get-dependencies', modrinthId, opts),

  // 설치
  downloadMods: (mods, installPath) =>
    ipcRenderer.invoke('download-mods', mods, installPath),

  // 동기화
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
}

contextBridge.exposeInMainWorld('electron', api)