import { create } from 'zustand'

interface UiState {
  isAboutOpen: boolean
  openAbout: () => void
  closeAbout: () => void
}

export const useUiStore = create<UiState>((set) => ({
  isAboutOpen: false,
  openAbout: () => set({ isAboutOpen: true }),
  closeAbout: () => set({ isAboutOpen: false })
}))
