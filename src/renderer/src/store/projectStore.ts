import { create } from 'zustand'
import {
  CommandHistory,
  createCommand,
  createEmptyProject,
  type MediaItem,
  type Project
} from '@core'

export interface ProjectStoreState {
  project: Project
  filePath: string | null
  isDirty: boolean
  canUndo: boolean
  canRedo: boolean
  undoLabel: string | null
  redoLabel: string | null

  selectedClipIds: string[]
  playheadTicks: number
  pixelsPerSecond: number
  snappingEnabled: boolean

  applyEdit: (label: string, mutate: (project: Project) => Project) => void
  undo: () => void
  redo: () => void

  loadProject: (project: Project, filePath: string | null) => void
  newProject: () => void
  markSaved: (filePath: string) => void

  patchMediaItem: (mediaId: string, patch: Partial<MediaItem>) => void

  selectClips: (clipIds: string[], mode?: 'replace' | 'toggle' | 'add') => void
  clearSelection: () => void

  setPlayhead: (ticks: number) => void
  setZoom: (pixelsPerSecond: number) => void
  toggleSnapping: () => void
}

const history = new CommandHistory<Project>()

export const useProjectStore = create<ProjectStoreState>((set, get) => ({
  project: createEmptyProject(),
  filePath: null,
  isDirty: false,
  canUndo: false,
  canRedo: false,
  undoLabel: null,
  redoLabel: null,

  selectedClipIds: [],
  playheadTicks: 0,
  pixelsPerSecond: 60,
  snappingEnabled: true,

  applyEdit: (label, mutate) => {
    const before = get().project
    const after = mutate(before)
    if (after === before) return
    history.push(createCommand(label, before, after))
    set({
      project: after,
      isDirty: true,
      canUndo: history.canUndo,
      canRedo: history.canRedo,
      undoLabel: history.undoLabel ?? null,
      redoLabel: history.redoLabel ?? null
    })
  },

  undo: () => {
    const restored = history.undo()
    if (!restored) return
    set({
      project: restored,
      isDirty: true,
      canUndo: history.canUndo,
      canRedo: history.canRedo,
      undoLabel: history.undoLabel ?? null,
      redoLabel: history.redoLabel ?? null
    })
  },

  redo: () => {
    const restored = history.redo()
    if (!restored) return
    set({
      project: restored,
      isDirty: true,
      canUndo: history.canUndo,
      canRedo: history.canRedo,
      undoLabel: history.undoLabel ?? null,
      redoLabel: history.redoLabel ?? null
    })
  },

  loadProject: (project, filePath) => {
    history.clear()
    set({
      project,
      filePath,
      isDirty: false,
      canUndo: false,
      canRedo: false,
      undoLabel: null,
      redoLabel: null,
      selectedClipIds: [],
      playheadTicks: 0
    })
  },

  newProject: () => {
    history.clear()
    set({
      project: createEmptyProject(),
      filePath: null,
      isDirty: false,
      canUndo: false,
      canRedo: false,
      undoLabel: null,
      redoLabel: null,
      selectedClipIds: [],
      playheadTicks: 0
    })
  },

  markSaved: (filePath) => set({ filePath, isDirty: false }),

  // Background probe/thumbnail/proxy updates: real project data (persisted on save),
  // so they mark the project dirty, but they aren't a user edit — never undoable.
  patchMediaItem: (mediaId, patch) => {
    const project = get().project
    set({
      project: {
        ...project,
        media: project.media.map((m) => (m.id === mediaId ? { ...m, ...patch } : m))
      },
      isDirty: true
    })
  },

  selectClips: (clipIds, mode = 'replace') => {
    const current = get().selectedClipIds
    if (mode === 'replace') {
      set({ selectedClipIds: clipIds })
    } else if (mode === 'add') {
      set({ selectedClipIds: [...new Set([...current, ...clipIds])] })
    } else {
      const toRemove = new Set(clipIds.filter((id) => current.includes(id)))
      const toAdd = clipIds.filter((id) => !current.includes(id))
      set({ selectedClipIds: [...current.filter((id) => !toRemove.has(id)), ...toAdd] })
    }
  },

  clearSelection: () => set({ selectedClipIds: [] }),

  setPlayhead: (ticks) => set({ playheadTicks: Math.max(0, ticks) }),
  setZoom: (pixelsPerSecond) =>
    set({ pixelsPerSecond: Math.min(2000, Math.max(2, pixelsPerSecond)) }),
  toggleSnapping: () => set((s) => ({ snappingEnabled: !s.snappingEnabled }))
}))

export function activeSequence(project: Project) {
  return project.sequences.find((s) => s.id === project.activeSequenceId) ?? project.sequences[0]!
}
