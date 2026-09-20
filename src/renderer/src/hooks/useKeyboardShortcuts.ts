import { useEffect } from 'react'
import { useProjectStore } from '../store/projectStore'
import { useUiStore } from '../store/uiStore'
import {
  copySelected,
  cutSelected,
  deleteSelected,
  duplicateSelected,
  pasteAtPlayhead,
  selectAllClips,
  splitAtPlayhead
} from '../editing/actions'
import { importViaDialog } from '../editing/importMedia'
import { openProjectViaDialog, saveProject, saveProjectAs } from '../editing/projectActions'
import { isTypingInField } from '../utils/isTypingInField'

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (isTypingInField()) return
      const mod = event.ctrlKey || event.metaKey

      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) useProjectStore.getState().redo()
        else useProjectStore.getState().undo()
        return
      }
      if (mod && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        useProjectStore.getState().redo()
        return
      }
      if (mod && event.key.toLowerCase() === 'c') {
        event.preventDefault()
        copySelected()
        return
      }
      if (mod && event.key.toLowerCase() === 'x') {
        event.preventDefault()
        cutSelected()
        return
      }
      if (mod && event.key.toLowerCase() === 'v') {
        event.preventDefault()
        pasteAtPlayhead()
        return
      }
      if (mod && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        duplicateSelected()
        return
      }
      if (mod && event.key.toLowerCase() === 'a') {
        event.preventDefault()
        selectAllClips()
        return
      }
      if (mod && event.shiftKey && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void saveProjectAs()
        return
      }
      if (mod && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void saveProject()
        return
      }
      if (mod && event.key.toLowerCase() === 'o') {
        event.preventDefault()
        void openProjectViaDialog()
        return
      }
      if (mod && event.key.toLowerCase() === 'i') {
        event.preventDefault()
        void importViaDialog()
        return
      }
      if (mod && event.key.toLowerCase() === 'm') {
        event.preventDefault()
        useUiStore.getState().openExport()
        return
      }
      if (mod && event.key.toLowerCase() === 'b') {
        event.preventDefault()
        splitAtPlayhead()
        return
      }
      if (mod) return

      switch (event.key) {
        case 's':
        case 'S':
          splitAtPlayhead()
          break
        case 'Delete':
        case 'Backspace':
          if (event.shiftKey) deleteSelected(true)
          else deleteSelected(false)
          break
        case 'n':
        case 'N':
          useProjectStore.getState().toggleSnapping()
          break
        case '=':
        case '+':
          useProjectStore.getState().setZoom(useProjectStore.getState().pixelsPerSecond * 1.4)
          break
        case '-':
        case '_':
          useProjectStore.getState().setZoom(useProjectStore.getState().pixelsPerSecond / 1.4)
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
}
