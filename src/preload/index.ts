import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { AppDiagnostics, ExportSettings, MediaItem, MediaType, Project } from '@core'

export interface RecentProjectEntry {
  filePath: string
  name: string
  lastOpenedMs: number
}

export interface ProjectSyncState {
  project: Project | null
  filePath: string | null
  isDirty: boolean
}

function on<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T): void => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const cutlineApi = {
  app: {
    getDiagnostics: (): Promise<AppDiagnostics> => ipcRenderer.invoke('app:get-diagnostics'),
    openThirdPartyLicenses: (): Promise<void> => ipcRenderer.invoke('app:open-third-party-licenses')
  },

  dialogs: {
    importMedia: (): Promise<string[] | null> => ipcRenderer.invoke('dialog:import-media'),
    saveProjectAs: (defaultName: string): Promise<string | null> =>
      ipcRenderer.invoke('dialog:save-project-as', defaultName),
    openProject: (): Promise<string | null> => ipcRenderer.invoke('dialog:open-project'),
    chooseExportPath: (defaultName: string): Promise<string | null> =>
      ipcRenderer.invoke('dialog:choose-export-path', defaultName)
  },

  media: {
    /** Resolves an absolute filesystem path for a File from a renderer drop event. */
    getPathForFile: (file: File): string => webUtils.getPathForFile(file),
    import: (filePaths: string[]): Promise<MediaItem[]> =>
      ipcRenderer.invoke('media:import', filePaths),
    cancelJob: (mediaId: string): void => ipcRenderer.send('media:cancel-job', mediaId),
    onPatch: (callback: (payload: { mediaId: string; patch: Partial<MediaItem> }) => void) =>
      on('media:patch', callback)
  },

  project: {
    save: (project: Project, filePath: string | null): Promise<string | null> =>
      ipcRenderer.invoke('project:save', { project, filePath }),
    open: (filePath?: string): Promise<{ filePath: string; project: Project } | null> =>
      ipcRenderer.invoke('project:open', filePath),
    getRecent: (): Promise<RecentProjectEntry[]> => ipcRenderer.invoke('project:get-recent'),
    removeRecent: (filePath: string): Promise<RecentProjectEntry[]> =>
      ipcRenderer.invoke('project:remove-recent', filePath),
    syncState: (state: ProjectSyncState): void => ipcRenderer.send('project:sync-state', state)
  },

  shell: {
    showItemInFolder: (filePath: string): void =>
      ipcRenderer.send('shell:show-item-in-folder', filePath)
  },

  export: {
    start: (args: {
      project: Project
      sequenceId: string
      settings: ExportSettings
      outputPath: string
    }): Promise<string> => ipcRenderer.invoke('export:start', args),
    cancel: (jobId: string): void => ipcRenderer.send('export:cancel', jobId),
    onProgress: (callback: (payload: { jobId: string; fraction: number }) => void) =>
      on('export:progress', callback),
    onDone: (callback: (payload: { jobId: string; outputPath: string }) => void) =>
      on('export:done', callback),
    onError: (callback: (payload: { jobId: string; error: string }) => void) =>
      on('export:error', callback),
    onCancelled: (callback: (payload: { jobId: string }) => void) =>
      on('export:cancelled', callback)
  }
}

export type CutlineApi = typeof cutlineApi
export type { AppDiagnostics, ExportSettings, MediaItem, MediaType, Project }

contextBridge.exposeInMainWorld('cutline', cutlineApi)
