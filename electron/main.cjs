const { app, BrowserWindow, ipcMain, protocol } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = process.env.VITE_DEV === 'true';

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#141414',
      symbolColor: '#ffffff'
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false // allow loading local files
    }
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  // Register custom protocol to load local video files
  protocol.registerFileProtocol('local', (request, callback) => {
    const url = request.url.replace('local://', '');
    try {
      return callback(decodeURIComponent(url));
    } catch (error) {
      console.error('Failed to register protocol', error);
    }
  });

  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

const { dialog } = require('electron');

// IPC Handler to select folder natively
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

// IPC Handler to scan directory
ipcMain.handle('scan-directory', async (event, dirPath) => {
  try {
    const fullPath = path.resolve(dirPath);
    if (!fs.existsSync(fullPath)) return [];
    
    const files = fs.readdirSync(fullPath);
    const mediaFiles = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return ['.mp4', '.mkv', '.avi', '.mov', '.webm'].includes(ext);
    });
    
    return mediaFiles.map(file => {
      // Clean up pirate group tags like [AnimePahe], remove extension, and replace underscores with spaces
      let cleanName = file.replace(/\[.*?\]/g, '').trim(); // Remove brackets
      cleanName = path.basename(cleanName, path.extname(cleanName)); // Remove extension
      cleanName = cleanName.replace(/[_\.]+/g, ' ').trim(); // Replace underscores/dots with spaces
      // Sometimes it leaves leading hyphens like "- 01 1080p"
      cleanName = cleanName.replace(/^[-\s]+/, '');
      
      return {
        name: cleanName || file, // Fallback to raw file if regex wipes it completely
        path: path.join(fullPath, file)
      };
    });
  } catch (error) {
    console.error("Error scanning directory:", error);
    return [];
  }
});

ipcMain.handle('select-file', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Executables', extensions: ['exe'] }]
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle('play-in-external-player', async (event, playerPath, videoPath) => {
  const { execFile } = require('child_process');
  
  // Custom arguments for VLC and PotPlayer to make them borderless/fullscreen
  let args = [videoPath];
  const playerLower = playerPath.toLowerCase();
  
  if (playerLower.includes('vlc.exe')) {
    args.push('--fullscreen', '--no-video-title-show', '--play-and-exit');
  } else if (playerLower.includes('potplayer')) {
    args.push('/fullscreen', '/close');
  }

  execFile(playerPath, args, (error) => {
    if (error) {
      console.error('Failed to launch external player:', error);
    }
  });
});
