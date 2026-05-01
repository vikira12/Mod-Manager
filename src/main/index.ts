import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { initDB } from './db';
import { getRequiredDependencies } from './modrinth';

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  ipcMain.handle('search-mod', async (_, slug: string) => {
    try {
      console.log(`[IPC] 프론트엔드에서 '${slug}' 검색 요청 들어옴!`);
      
      // 1. 모드 이름으로 최신 버전 ID 찾기
      const response = await fetch(`https://api.modrinth.com/v2/project/${slug}/version`, {
        headers: { 'User-Agent': 'my-mod-manager/1.0.0 (contact@example.com)' }
      });
      if (!response.ok) throw new Error('모드를 찾을 수 없습니다.');
      const versions = await response.json();
      const latestVersionId = versions[0].id;

      // 2. DFS 의존성 탐색 실행
      const dependencies = await getRequiredDependencies(latestVersionId);
      
      // 3. 탐색된 결과를 화면(React)으로 돌려보냄
      return dependencies; 
    } catch (error: any) {
      console.error(error);
      return { error: error.message }; 
    }
  });
  
  try {
    await initDB();
  } catch (error) {
    console.error("DB init error:", error);
  }

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.on('ping', () => console.log('pong'))

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})