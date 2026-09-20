import { useProjectStore } from '../store/projectStore'

async function confirmDiscardIfDirty(): Promise<boolean> {
  if (!useProjectStore.getState().isDirty) return true
  return window.confirm('You have unsaved changes. Discard them?')
}

export async function newProject(): Promise<void> {
  if (!(await confirmDiscardIfDirty())) return
  useProjectStore.getState().newProject()
}

export async function saveProject(): Promise<boolean> {
  const { project, filePath, markSaved } = useProjectStore.getState()
  const result = await window.cutline.project.save(project, filePath)
  if (!result) return false
  markSaved(result)
  return true
}

export async function saveProjectAs(): Promise<boolean> {
  const { project, markSaved } = useProjectStore.getState()
  const result = await window.cutline.project.save(project, null)
  if (!result) return false
  markSaved(result)
  return true
}

export async function openProjectViaDialog(): Promise<void> {
  if (!(await confirmDiscardIfDirty())) return
  const result = await window.cutline.project.open()
  if (!result) return
  useProjectStore.getState().loadProject(result.project, result.filePath)
}

export async function openProjectByPath(filePath: string): Promise<void> {
  if (!(await confirmDiscardIfDirty())) return
  try {
    const result = await window.cutline.project.open(filePath)
    if (!result) return
    useProjectStore.getState().loadProject(result.project, result.filePath)
  } catch (err) {
    window.alert(`Could not open project: ${err instanceof Error ? err.message : String(err)}`)
  }
}
