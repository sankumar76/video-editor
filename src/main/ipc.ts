import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import type { ExportSettings, MediaType, Project } from '@core'
import { createPendingMediaItem } from '@core'
import { MediaJobManager } from './jobs/mediaJobs'
import {
  addRecentProject,
  getRecentProjects,
  loadProjectFile,
  removeRecentProject,
  saveProjectFile
} from './project/persistence'
import { FfmpegCancelledError, runExport } from './export/runExport'

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.mkv', '.avi', '.webm', '.wmv'])
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.aac', '.flac', '.ogg', '.m4a'])
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif'])

function classifyMediaType(filePath: string): MediaType | null {
  const ext = path.extname(filePath).toLowerCase()
  if (VIDEO_EXTENSIONS.has(ext)) return 'video'
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio'
  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  return null
}

const MEDIA_DIALOG_FILTERS = [
  {
    name: 'Media files',
    extensions: [...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS, ...IMAGE_EXTENSIONS].map((ext) =>
      ext.slice(1)
    )
  },
  { name: 'All files', extensions: ['*'] }
]

interface ProjectSyncState {
  project: Project | null
  filePath: string | null
  isDirty: boolean
}

const syncState: ProjectSyncState = { project: null, filePath: null, isDirty: false }

export function getProjectSyncState(): ProjectSyncState {
  return syncState
}

export function registerAppIpcHandlers(window: BrowserWindow): void {
  const jobManager = new MediaJobManager((mediaId, patch) => {
    if (!window.isDestroyed()) {
      window.webContents.send('media:patch', { mediaId, patch })
    }
  })

  // --- Dialogs -------------------------------------------------------------

  ipcMain.handle('dialog:import-media', async () => {
    const result = await dialog.showOpenDialog(window, {
      title: 'Import media',
      properties: ['openFile', 'multiSelections'],
      filters: MEDIA_DIALOG_FILTERS
    })
    return result.canceled ? null : result.filePaths
  })

  ipcMain.handle('dialog:save-project-as', async (_event, defaultName: string) => {
    const result = await dialog.showSaveDialog(window, {
      title: 'Save Project',
      defaultPath: defaultName,
      filters: [{ name: 'Cutline Project', extensions: ['cutline'] }]
    })
    return result.canceled || !result.filePath ? null : result.filePath
  })

  ipcMain.handle('dialog:open-project', async () => {
    const result = await dialog.showOpenDialog(window, {
      title: 'Open Project',
      properties: ['openFile'],
      filters: [{ name: 'Cutline Project', extensions: ['cutline'] }]
    })
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]!
  })

  ipcMain.handle('dialog:choose-export-path', async (_event, defaultName: string) => {
    const result = await dialog.showSaveDialog(window, {
      title: 'Export',
      defaultPath: defaultName,
      filters: [{ name: 'MP4 video', extensions: ['mp4'] }]
    })
    return result.canceled || !result.filePath ? null : result.filePath
  })

  // --- Media import & background jobs ---------------------------------------

  ipcMain.handle('media:import', async (_event, filePaths: string[]) => {
    const items = []
    for (const filePath of filePaths) {
      const type = classifyMediaType(filePath)
      if (!type) continue
      let stats
      try {
        stats = await stat(filePath)
      } catch {
        continue
      }
      const item = createPendingMediaItem({
        originalPath: filePath,
        fileName: path.basename(filePath),
        fileSize: stats.size,
        fileMtimeMs: stats.mtimeMs,
        type
      })
      items.push(item)
      jobManager.enqueue({
        mediaId: item.id,
        filePath,
        fileSize: stats.size,
        fileMtimeMs: stats.mtimeMs,
        type
      })
    }
    return items
  })

  ipcMain.on('media:cancel-job', (_event, mediaId: string) => {
    jobManager.cancel(mediaId)
  })

  // --- Project persistence --------------------------------------------------

  ipcMain.handle(
    'project:save',
    async (_event, args: { project: Project; filePath: string | null }) => {
      let filePath = args.filePath
      if (!filePath) {
        const result = await dialog.showSaveDialog(window, {
          title: 'Save Project',
          defaultPath: `${args.project.name}.cutline`,
          filters: [{ name: 'Cutline Project', extensions: ['cutline'] }]
        })
        if (result.canceled || !result.filePath) return null
        filePath = result.filePath
      }
      await saveProjectFile(filePath, args.project)
      await addRecentProject({ filePath, name: args.project.name, lastOpenedMs: Date.now() })
      return filePath
    }
  )

  ipcMain.handle('project:open', async (_event, filePath?: string) => {
    let targetPath = filePath
    if (!targetPath) {
      const result = await dialog.showOpenDialog(window, {
        title: 'Open Project',
        properties: ['openFile'],
        filters: [{ name: 'Cutline Project', extensions: ['cutline'] }]
      })
      if (result.canceled || result.filePaths.length === 0) return null
      targetPath = result.filePaths[0]!
    }
    try {
      const project = await loadProjectFile(targetPath)
      await addRecentProject({ filePath: targetPath, name: project.name, lastOpenedMs: Date.now() })
      return { filePath: targetPath, project }
    } catch (err) {
      await removeRecentProject(targetPath).catch(() => undefined)
      throw err
    }
  })

  ipcMain.handle('project:get-recent', async () => getRecentProjects())
  ipcMain.handle('project:remove-recent', async (_event, filePath: string) =>
    removeRecentProject(filePath)
  )

  ipcMain.on('project:sync-state', (_event, state: ProjectSyncState) => {
    syncState.project = state.project
    syncState.filePath = state.filePath
    syncState.isDirty = state.isDirty
  })

  // --- Export ----------------------------------------------------------------

  const exportControllers = new Map<string, AbortController>()

  ipcMain.handle(
    'export:start',
    async (
      _event,
      args: { project: Project; sequenceId: string; settings: ExportSettings; outputPath: string }
    ) => {
      const jobId = randomUUID()
      const controller = new AbortController()
      exportControllers.set(jobId, controller)

      void runExport({
        project: args.project,
        sequenceId: args.sequenceId,
        settings: args.settings,
        outputPath: args.outputPath,
        signal: controller.signal,
        onProgress: (fraction) => {
          if (!window.isDestroyed()) window.webContents.send('export:progress', { jobId, fraction })
        }
      })
        .then(() => {
          if (!window.isDestroyed())
            window.webContents.send('export:done', { jobId, outputPath: args.outputPath })
        })
        .catch((err: unknown) => {
          if (window.isDestroyed()) return
          if (err instanceof FfmpegCancelledError) {
            window.webContents.send('export:cancelled', { jobId })
          } else {
            window.webContents.send('export:error', {
              jobId,
              error: err instanceof Error ? err.message : String(err)
            })
          }
        })
        .finally(() => {
          exportControllers.delete(jobId)
        })

      return jobId
    }
  )

  ipcMain.on('export:cancel', (_event, jobId: string) => {
    exportControllers.get(jobId)?.abort()
  })

  ipcMain.on('shell:show-item-in-folder', (_event, filePath: string) => {
    shell.showItemInFolder(filePath)
  })
}
