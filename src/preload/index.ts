import { contextBridge, ipcRenderer } from 'electron'
import type { AppDiagnostics } from '@core'

const cutlineApi = {
  getDiagnostics: (): Promise<AppDiagnostics> => ipcRenderer.invoke('app:get-diagnostics'),
  openThirdPartyLicenses: (): Promise<void> => ipcRenderer.invoke('app:open-third-party-licenses')
}

contextBridge.exposeInMainWorld('cutline', cutlineApi)
