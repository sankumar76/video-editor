import { app, BrowserWindow, ipcMain, Menu, session, shell } from 'electron'
import path from 'node:path'
import { loadWindowState, trackWindowState } from './windowState'
import { getFfmpegDiagnostics, getFfprobeDiagnostics } from './ffmpeg'
import type { AppDiagnostics } from '@core'

function getIconPath(): string {
  const file = process.platform === 'win32' ? 'icon.ico' : 'icon.png'
  return app.isPackaged
    ? path.join(process.resourcesPath, file)
    : path.join(app.getAppPath(), 'resources', file)
}

function applyContentSecurityPolicy(): void {
  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  const connectSrc = devServerUrl
    ? `'self' ${devServerUrl} ${devServerUrl.replace(/^http/, 'ws')}`
    : "'self'"

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; ` +
            `img-src 'self' data: file:; media-src 'self' file: blob:; connect-src ${connectSrc};`
        ]
      }
    })
  })
}

function getThirdPartyLicensesPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'THIRD_PARTY_LICENSES.txt')
    : path.join(app.getAppPath(), 'THIRD_PARTY_LICENSES.txt')
}

function registerIpcHandlers(): void {
  ipcMain.handle('app:get-diagnostics', async (): Promise<AppDiagnostics> => {
    const [ffmpeg, ffprobe] = await Promise.all([getFfmpegDiagnostics(), getFfprobeDiagnostics()])
    return {
      app: { name: app.getName(), version: app.getVersion() },
      runtime: {
        electron: process.versions.electron ?? 'unknown',
        chrome: process.versions.chrome ?? 'unknown',
        node: process.versions.node ?? 'unknown'
      },
      ffmpeg,
      ffprobe
    }
  })

  ipcMain.handle('app:open-third-party-licenses', async (): Promise<void> => {
    const result = await shell.openPath(getThirdPartyLicensesPath())
    if (result) throw new Error(result)
  })
}

function createWindow(): BrowserWindow {
  const state = loadWindowState()
  const window = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: '#1b1d21',
    icon: getIconPath(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  window.once('ready-to-show', () => {
    if (state.isMaximized) window.maximize()
    window.show()
  })

  trackWindowState(window)

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (devServerUrl) {
    void window.loadURL(devServerUrl)
  } else {
    void window.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  return window
}

const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  app.quit()
} else {
  let mainWindow: BrowserWindow | null = null

  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  void app.whenReady().then(() => {
    Menu.setApplicationMenu(null)
    applyContentSecurityPolicy()
    registerIpcHandlers()
    mainWindow = createWindow()
  })

  app.on('window-all-closed', () => {
    app.quit()
  })
}
