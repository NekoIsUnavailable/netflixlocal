const { app, BrowserWindow, ipcMain, protocol } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = process.env.VITE_DEV === 'true';
const SUPPORTED_MEDIA_EXTENSIONS = new Set(['.mp4', '.mkv', '.avi', '.mov', '.webm']);
const MAX_SCANNED_FILES = 50000;
const PROGRESS_EMIT_INTERVAL = 250;
const fsPromises = fs.promises;

const toLocalUri = (absPath) => `local://${encodeURIComponent(absPath)}`;

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
      webSecurity: true
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

const tryReadNfo = async (nfoPath) => {
  try {
    return await fsPromises.readFile(nfoPath, 'utf8');
  } catch {
    return null;
  }
};

// IPC Handler to scan directory
ipcMain.handle('scan-directory', async (event, dirPath) => {
  try {
    if (typeof dirPath !== 'string' || !dirPath.trim()) return [];

    const fullPath = await fsPromises.realpath(path.resolve(dirPath));
    const rootStat = await fsPromises.stat(fullPath);
    if (!rootStat.isDirectory()) return [];

    let scannedCount = 0;
    let mediaCount = 0;
    let lastProgressAt = 0;

    const emitProgress = () => {
      const now = Date.now();
      if (now - lastProgressAt < PROGRESS_EMIT_INTERVAL) return;
      lastProgressAt = now;
      event.sender.send('scan-progress', {
        scannedCount,
        mediaCount,
        done: false
      });
    };

    const mediaFiles = [];
    const dirsToVisit = [fullPath];

    while (dirsToVisit.length > 0 && scannedCount < MAX_SCANNED_FILES) {
      const currentDir = dirsToVisit.pop();
      let entries = [];

      try {
        entries = await fsPromises.readdir(currentDir, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        if (scannedCount >= MAX_SCANNED_FILES) break;

        const filepath = path.join(currentDir, entry.name);
        scannedCount += 1;
        emitProgress();

        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) {
          dirsToVisit.push(filepath);
          continue;
        }
        if (!entry.isFile()) continue;

        const ext = path.extname(entry.name).toLowerCase();
        if (!SUPPORTED_MEDIA_EXTENSIONS.has(ext)) continue;

        mediaFiles.push(filepath);
        mediaCount += 1;
      }
    }

    const enrichedFiles = await Promise.all(
      mediaFiles.map(async (filepath) => {
        let stats;
        try {
          stats = await fsPromises.stat(filepath);
        } catch {
          return null;
        }

        const file = path.basename(filepath);
        const dir = path.dirname(filepath);

        let cleanName = file.replace(/\[.*?\]/g, '').trim();
        cleanName = path.basename(cleanName, path.extname(cleanName));
        cleanName = cleanName.replace(/[_\.]+/g, ' ').trim();
        cleanName = cleanName.replace(/^[-\s]+/, '');

        const baseNoExt = path.basename(file, path.extname(file));
        const posterPath = path.join(dir, 'poster.jpg');
        const fanartPath = path.join(dir, 'fanart.jpg');
        const nfoPath = path.join(dir, `${baseNoExt}.nfo`);
        const movieNfoPath = path.join(dir, 'movie.nfo');

        let localPoster = null;
        let localFanart = null;
        try {
          await fsPromises.access(posterPath, fs.constants.R_OK);
          localPoster = toLocalUri(posterPath);
        } catch {}
        try {
          await fsPromises.access(fanartPath, fs.constants.R_OK);
          localFanart = toLocalUri(fanartPath);
        } catch {}

        let localNfoContent = await tryReadNfo(nfoPath);
        if (!localNfoContent) {
          localNfoContent = await tryReadNfo(movieNfoPath);
        }

        return {
          name: cleanName || file,
          path: filepath,
          folderName: dir !== fullPath ? path.basename(dir) : undefined,
          localPoster,
          localFanart,
          localNfoContent,
          size: stats.size,
          mtimeMs: stats.mtimeMs
        };
      })
    );

    const result = enrichedFiles.filter(Boolean).sort((a, b) => a.path.localeCompare(b.path));
    event.sender.send('scan-progress', {
      scannedCount,
      mediaCount: result.length,
      done: true,
      hitScanLimit: scannedCount >= MAX_SCANNED_FILES
    });
    return result;
  } catch (error) {
    console.error("Error scanning directory:", error);
    event.sender.send('scan-progress', { done: true, error: true });
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
