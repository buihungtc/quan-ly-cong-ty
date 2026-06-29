const { app, BrowserWindow, shell, ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');

// Ép Electron hiển thị ô chọn ngày (type="date") theo định dạng DD/MM/YYYY
app.commandLine.appendSwitch('lang', 'en-GB');

let mainWindow = null;
let flaskProcess = null;
const FLASK_PORT = 5173;
const LOCAL_URL = `http://127.0.0.1:${FLASK_PORT}`;

// ──────────────────────────────────────────────
// IPC handlers
// ──────────────────────────────────────────────
ipcMain.on('open-external', (_, url) => {
  if (url) shell.openExternal(url);
});

// ──────────────────────────────────────────────
// Tìm Python / exe Flask
// ──────────────────────────────────────────────
function getPythonExecutable() {
  // Thử đường dẫn thư mục PyInstaller --onedir (khuyên dùng)
  const exePath1 = path.join(process.resourcesPath, 'python_dist', 'app', 'app.exe');
  if (fs.existsSync(exePath1)) return { exe: exePath1, args: [] };

  // Thử đường dẫn file đơn PyInstaller --onefile
  const exePath2 = path.join(process.resourcesPath, 'python_dist', 'app.exe');
  if (fs.existsSync(exePath2)) return { exe: exePath2, args: [] };

  // Fallback về python file trong môi trường dev
  return { exe: 'python', args: [path.join(__dirname, '..', 'app.py')] };
}

// ──────────────────────────────────────────────
// Khởi động Flask
// ──────────────────────────────────────────────
function startFlask() {
  const { exe, args } = getPythonExecutable();
  const appBaseDir = app.isPackaged 
    ? path.dirname(exe) 
    : path.join(__dirname, '..');

  const env = Object.assign({}, process.env, {
    FLASK_PORT: String(FLASK_PORT),
    APP_BASE_DIR: appBaseDir,
  });

  flaskProcess = spawn(exe, args, {
    env,
    cwd: appBaseDir,
    windowsHide: true,
  });

  flaskProcess.stdout.on('data', (d) => console.log(`[Flask] ${d.toString().trim()}`));
  flaskProcess.stderr.on('data', (d) => console.error(`[Flask ERR] ${d.toString().trim()}`));
  flaskProcess.on('close', (code) => {
    console.log(`[Flask] exited code=${code}`);
    flaskProcess = null;
  });
}

// ──────────────────────────────────────────────
// Chờ Flask sẵn sàng
// ──────────────────────────────────────────────
function waitForFlask(timeout = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      http.get(LOCAL_URL, (res) => {
        if (res.statusCode < 500) resolve();
        else setTimeout(check, 300);
      }).on('error', () => {
        if (Date.now() - start > timeout)
          reject(new Error('Flask không khởi động được sau 30 giây.'));
        else setTimeout(check, 300);
      });
    };
    check();
  });
}

// ──────────────────────────────────────────────
// Lấy server-info (local + ngrok URL) từ Flask
// Thử lại sau 3s nếu ngrok chưa sẵn sàng, tối đa 60s
// ──────────────────────────────────────────────
function fetchServerInfo(attempt = 0) {
  http.get(`${LOCAL_URL}/api/server-info`, (res) => {
    let raw = '';
    res.on('data', (d) => (raw += d));
    res.on('end', () => {
      try {
        const info = JSON.parse(raw);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('urls-ready', {
            localUrl: info.local_url || LOCAL_URL,
            ngrokUrl: info.ngrok_url || null,
            ngrokError: info.ngrok_error || null,
          });
        }
        // Nếu ngrok chưa có, chưa lỗi, và chưa hết 60s thì thử lại
        if (!info.ngrok_url && !info.ngrok_error && attempt < 20) {
          setTimeout(() => fetchServerInfo(attempt + 1), 3000);
        }
      } catch (_) {}
    });
  }).on('error', () => {
    if (attempt < 20) setTimeout(() => fetchServerInfo(attempt + 1), 3000);
  });
}

// ──────────────────────────────────────────────
// Tạo cửa sổ thông báo nhỏ
// ──────────────────────────────────────────────
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 560,
    height: 720,
    resizable: true,
    maximizable: false,
    minWidth: 480,
    minHeight: 600,
    title: 'Quản lý Hợp đồng 2026',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    backgroundColor: '#0f172a',
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'info.html'));

  // Sau khi trang load xong, gửi URL ngay với local, rồi poll ngrok
  mainWindow.webContents.on('did-finish-load', () => {
    // Gửi local URL ngay lập tức
    mainWindow.webContents.send('urls-ready', {
      localUrl: LOCAL_URL,
      ngrokUrl: null,
    });
    // Bắt đầu poll ngrok URL
    setTimeout(() => fetchServerInfo(0), 3000);
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ──────────────────────────────────────────────
// Màn hình loading tạm
// ──────────────────────────────────────────────
function createLoadingWindow() {
  const win = new BrowserWindow({
    width: 340, height: 160,
    resizable: false, frame: false,
    backgroundColor: '#0f172a',
    webPreferences: { nodeIntegration: false },
  });
  win.setMenuBarVisibility(false);
  const html = `<html><head><style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#0f172a;color:#e2e8f0;font-family:'Segoe UI',sans-serif;
         display:flex;flex-direction:column;align-items:center;
         justify-content:center;height:100vh;gap:14px}
    .sp{width:36px;height:36px;border:4px solid rgba(255,255,255,0.08);
        border-top-color:#6366f1;border-radius:50%;animation:s .7s linear infinite}
    @keyframes s{to{transform:rotate(360deg)}}
    p{font-size:.85rem;color:#475569}
    h3{font-size:1rem;color:#94a3b8;font-weight:500}
  </style></head><body>
    <h3>Quản lý Hợp đồng 2026</h3>
    <div class="sp"></div>
    <p>Đang khởi động server, vui lòng chờ...</p>
  </body></html>`;
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  return win;
}

// ──────────────────────────────────────────────
// App lifecycle
// ──────────────────────────────────────────────
app.whenReady().then(async () => {
  startFlask();
  const loadingWin = createLoadingWindow();

  try {
    await waitForFlask();
    console.log('[App] Flask ready!');
    loadingWin.close();
    createMainWindow();
  } catch (err) {
    loadingWin.close();
    const { dialog } = require('electron');
    dialog.showErrorBox('Lỗi khởi động', `Không thể kết nối server.\n\n${err.message}`);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (flaskProcess) {
    console.log('[App] Stopping Flask...');
    flaskProcess.kill();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});
