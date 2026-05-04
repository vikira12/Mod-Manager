import { ipcMain, shell, BrowserWindow, app } from 'electron'
import fs from 'fs'
import path from 'path'
import axios from 'axios'
import {
  searchLocal, searchRemote, getDependencies,
  syncModrinth, getSyncStatus, fetchAndCache
} from './modrinth'

// 운영체제별 마인크래프트 기본 경로 찾기
function getDefaultMinecraftPath(): string {
  const home = app.getPath('home')
  if (process.platform === 'win32') {
    return path.join(app.getPath('appData'), '.minecraft', 'mods')
  } else if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'minecraft', 'mods')
  } else {
    return path.join(home, '.minecraft', 'mods')
  }
}

export function registerHandlers(win: BrowserWindow): void {
  // 모드 검색
  ipcMain.handle('search-mod', async (_e, query: string, opts = {}) => {
    try {
      const local = await searchLocal(query, opts)
      if (local.length >= 3) return { results: local, source: 'local' }

      console.log(`[IPC] DB 결과 부족(${local.length}) → API fallback`)
      const remote = await searchRemote(query, opts)
      return { results: [...local, ...remote], source: local.length ? 'mixed' : 'api' }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  // 의존성 조회
  ipcMain.handle('get-dependencies', async (_e, modrinthId: string, opts = {}) => {
    try {
      const deps = await getDependencies(modrinthId, opts)
      return { dependencies: deps }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  // 모드 설치
  ipcMain.handle('download-mods', async (_e, mods: any[], installPath?: string) => {
    const targetDir = installPath ?? getDefaultMinecraftPath()
    fs.mkdirSync(targetDir, { recursive: true })

    const success: string[] = []
    const failed: { name: string; reason: string }[] = []

    for (let mod of mods) {
      try {
        if (!mod.file_url && mod.modrinth_id) {
          console.log(`[IPC] ${mod.name} 파일 정보 없음. API에서 버전 정보를 긁어옵니다...`)
          await fetchAndCache(mod.modrinth_id) // DB에 버전 정보 저장
          
          // 캐시된 정보로 DB에서 다시 불러오기
          const refreshed = await searchLocal(mod.name)
          const matched = refreshed.find(r => r.modrinth_id === mod.modrinth_id)
          
          if (matched && matched.file_url) {
            mod = matched
          } else {
            throw new Error('해당 모드의 배포된 릴리즈 파일(jar)을 찾을 수 없습니다.')
          }
        }

        const fileName = mod.file_name ?? `${mod.slug ?? mod.modrinth_id}.jar`
        const dest = path.join(targetDir, fileName)

        if (!fs.existsSync(dest)) {
          const writer = fs.createWriteStream(dest)
          const resp = await axios({ url: mod.file_url, method: 'GET', responseType: 'stream' })
          
          await new Promise<void>((res, rej) => {
            resp.data.pipe(writer)
            writer.on('finish', res)
            writer.on('error', rej)
          })
        }

        win.webContents.send('install-progress', { name: mod.name, fileName, status: 'done' })
        success.push(fileName)
      } catch (err: any) {
        failed.push({ name: mod.name ?? mod.modrinth_id, reason: err.message })
        win.webContents.send('install-progress', { name: mod.name, status: 'error', reason: err.message })
      }
    }

    return { success: failed.length === 0, files: success, failed }
  })

  // DB 동기화
  ipcMain.handle('sync-modrinth', async (_e, opts: { limit?: number } = {}) => {
    return syncModrinth({
      ...opts,
      onProgress: (data) => win.webContents.send('sync-progress', data),
    })
  })

  ipcMain.handle('sync-status', async () => getSyncStatus())

  ipcMain.handle('open-folder', async (_e, folderPath: string) => shell.openPath(folderPath))
}