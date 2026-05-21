console.log('--- Electron wrapper starting ---');
const { app, BrowserWindow } = require('electron');
const path = require('path');
const { fork } = require('child_process');

let mainWindow;
let serverProcess;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'GymPro',
    icon: path.join(__dirname, 'public', 'images', 'logo.jpg'), // Ensure this exists or use a .ico file
    autoHideMenuBar: true, // Hides the default menu bar
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  function loadUrlWithRetry(url, retries = 30) {
    mainWindow.loadURL(url).catch((err) => {
      if (retries > 0) {
        setTimeout(() => loadUrlWithRetry(url, retries - 1), 1000);
      } else {
        const { dialog } = require('electron');
        dialog.showErrorBox('Startup Error', 'The local server failed to start in time. Please restart the app.');
      }
    });
  }

  loadUrlWithRetry('http://localhost:3000');

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

function startServer() {
  const dbDir = app.getPath('userData'); 
  const fs = require('fs');
  const logPath = path.join(dbDir, 'server-error.log');
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });
  
  logStream.write('\n\n--- Starting server with fork ---\n');
  logStream.write('Node version: ' + process.version + '\n');
  logStream.write('Electron version: ' + process.versions.electron + '\n');
  logStream.write('__dirname is: ' + __dirname + '\n');

  try {
    serverProcess = fork(path.join(__dirname, 'server.js'), [], {
      env: { 
        ...process.env, 
        ELECTRON_RUN_AS_NODE: '1',
        GYMPRO_DB_DIR: dbDir,
        PORT: '3000'
      },
      execArgv: ['--experimental-sqlite'],
      stdio: ['ignore', 'pipe', 'pipe', 'ipc']
    });

    serverProcess.stdout.on('data', (data) => logStream.write(data));
    serverProcess.stderr.on('data', (data) => logStream.write(data));

    serverProcess.on('error', (err) => {
      logStream.write('Fork error: ' + err.toString() + '\n');
    });

    serverProcess.on('exit', (code, signal) => {
      logStream.write('Server exited with code ' + code + ' signal ' + signal + '\n');
      const { dialog } = require('electron');
      dialog.showErrorBox('Server Crashed', 'The background server exited unexpectedly. Check logs at: ' + logPath);
    });
  } catch (err) {
    logStream.write('Failed to start fork: ' + err.toString() + '\n');
  }
}

app.whenReady().then(() => {
  console.log('Electron app is ready. Starting server...');
  startServer();
  createWindow();
});

app.on('window-all-closed', function () {
  // Quit when all windows are closed, except on macOS
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', function () {
  // On OS X it's common to re-create a window in the app when the dock icon is clicked
  if (mainWindow === null) {
    createWindow();
  }
});

// Important: Kill the backend server when Electron app is quitting
app.on('will-quit', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});
