const { app, BrowserWindow, protocol, net } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

// Register a custom secure scheme so dynamic ES module loading works without
// the file:// CORS / module-script restrictions Chromium imposes.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
]);

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 960,
    minHeight: 540,
    title: 'Claude Shooter',
    backgroundColor: '#0a0a1a',
    autoHideMenuBar: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.loadURL('app://main/index.html');

  win.webContents.openDevTools({ mode: 'detach' });

  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('[electron] did-fail-load', code, desc, url);
  });
};

app.whenReady().then(() => {
  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.startsWith('/')) pathname = pathname.slice(1);
    if (pathname === '' || pathname.endsWith('/')) pathname += 'index.html';
    const filePath = path.join(__dirname, '..', 'dist', pathname);
    return net.fetch(pathToFileURL(filePath).toString());
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
