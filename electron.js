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
  const dbDir = app.getPath('userData'); // Safe, writable directory (e.g. AppData/Roaming/GymPro)
  
  // Use Electron's bundled Node to run our server.js, enabling SQLite support.
  // This inherently understands the packed .asar archive path.
  serverProcess = fork(path.join(__dirname, 'server.js'), [], {
    env: { 
      ...process.env, 
      ELECTRON_RUN_AS_NODE: '1',
      GYMPRO_DB_DIR: dbDir 
    },
    execArgv: ['--experimental-sqlite'],
    stdio: 'inherit'
  });

  serverProcess.on('error', (err) => {
    console.error('Failed to start server:', err);
  });
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
