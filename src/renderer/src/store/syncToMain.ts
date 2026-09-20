import { useProjectStore } from './projectStore'

let initialized = false

/** Keeps main process's copy of {project, filePath, isDirty} fresh for the close-confirmation flow. */
export function initProjectSyncToMain(): void {
  if (initialized) return
  initialized = true

  let timeout: ReturnType<typeof setTimeout> | undefined
  const push = (): void => {
    const { project, filePath, isDirty } = useProjectStore.getState()
    window.cutline.project.syncState({ project, filePath, isDirty })
  }

  push()
  useProjectStore.subscribe((state, prev) => {
    if (
      state.project === prev.project &&
      state.filePath === prev.filePath &&
      state.isDirty === prev.isDirty
    ) {
      return
    }
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(push, 250)
  })
}
