import { create } from 'zustand'

interface UiState {
  isAboutOpen: boolean
  openAbout: () => void
  closeAbout: () => void

  isExportOpen: boolean
  openExport: () => void
  closeExport: () => void

  isProjectSettingsOpen: boolean
  openProjectSettings: () => void
  closeProjectSettings: () => void
}

export const useUiStore = create<UiState>((set) => ({
  isAboutOpen: false,
  openAbout: () => set({ isAboutOpen: true }),
  closeAbout: () => set({ isAboutOpen: false }),

  isExportOpen: false,
  openExport: () => set({ isExportOpen: true }),
  closeExport: () => set({ isExportOpen: false }),

  isProjectSettingsOpen: false,
  openProjectSettings: () => set({ isProjectSettingsOpen: true }),
  closeProjectSettings: () => set({ isProjectSettingsOpen: false })
}))
