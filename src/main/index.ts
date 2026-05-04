import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { initDB } from './db';
import { getRequiredDependencies } from './modrinth';
import fs from 'fs/promises';

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
  
  ipcMain.handle('download-mods', async (_, mods) => {
    try {
      // 1. 모드를 저장할 폴더 경로 설정 (AppData/Roaming/앱이름/mods 폴더에 저장)
      const modsDir = join(app.getPath('userData'), 'mods');
      await fs.mkdir(modsDir, { recursive: true }); // 폴더가 없으면 만듦

      const downloadResults: string[] = [];

      // 2. 전달받은 모드 목록을 하나씩 다운로드
      for (const mod of mods) {
        const file = mod.files[0];
        const fileUrl = file.url;
        const fileName = file.filename;
        const filePath = join(modsDir, fileName);

        console.log(`[다운로드 시작] ${fileName}...`);
        
        // 파일 다운로드 및 저장
        const response = await fetch(fileUrl);
        if (!response.ok) throw new Error(`${fileName} 다운로드 실패`);
        
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        await fs.writeFile(filePath, buffer);
        
        console.log(`[다운로드 완료] ${filePath}`);
        downloadResults.push(fileName);
      }

      return { success: true, path: modsDir, files: downloadResults };
    } catch (error: any) {
      console.error("다운로드 에러:", error);
      return { success: false, error: error.message };
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