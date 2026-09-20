import { app, BrowserWindow, dialog, ipcMain, Menu, session, shell } from 'electron'
import path from 'node:path'
import { loadWindowState, trackWindowState } from './windowState'
import { getFfmpegDiagnostics, getFfprobeDiagnostics } from './ffmpeg'
import { getProjectSyncState, registerAppIpcHandlers } from './ipc'
import { addRecentProject, saveProjectFile } from './project/persistence'
import { DEV_PROJECT_ROOT } from './devRoot'
import type { AppDiagnostics } from '@core'

function getIconPath(): string {
  const file = process.platform === 'win32' ? 'icon.ico' : 'icon.png'
  return app.isPackaged
    ? path.join(process.resourcesPath, file)
    : path.join(DEV_PROJECT_ROOT, 'resources', file)
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
    : path.join(DEV_PROJECT_ROOT, 'THIRD_PARTY_LICENSES.txt')
}

function registerDiagnosticsIpcHandlers(): void {
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

async function saveFromSyncedSnapshot(window: BrowserWindow): Promise<boolean> {
  const state = getProjectSyncState()
  if (!state.project) return true
  let filePath = state.filePath
  if (!filePath) {
    const result = await dialog.showSaveDialog(window, {
      title: 'Save Project',
      defaultPath: `${state.project.name}.cutline`,
      filters: [{ name: 'Cutline Project', extensions: ['cutline'] }]
    })
    if (result.canceled || !result.filePath) return false
    filePath = result.filePath
  }
  await saveProjectFile(filePath, state.project)
  await addRecentProject({ filePath, name: state.project.name, lastOpenedMs: Date.now() })
  return true
}

/** Prompts to save before closing a window with unsynced project changes (spec section 6). */
function attachUnsavedChangesGuard(window: BrowserWindow): void {
  let allowClose = false
  window.on('close', (event) => {
    if (allowClose) return
    if (!getProjectSyncState().isDirty) return
    event.preventDefault()
    void (async () => {
      const { response } = await dialog.showMessageBox(window, {
        type: 'warning',
        buttons: ['Save', "Don't Save", 'Cancel'],
        defaultId: 0,
        cancelId: 2,
        message: 'Save changes to your project before closing?',
        detail: "Your changes will be lost if you don't save them."
      })
      if (response === 2) return
      if (response === 0) {
        const saved = await saveFromSyncedSnapshot(window)
        if (!saved) return
      }
      allowClose = true
      window.close()
    })()
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
  attachUnsavedChangesGuard(window)
  registerAppIpcHandlers(window)

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
    registerDiagnosticsIpcHandlers()
    mainWindow = createWindow()
  })

  app.on('window-all-closed', () => {
    app.quit()
  })
}
