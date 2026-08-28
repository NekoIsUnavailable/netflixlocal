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
