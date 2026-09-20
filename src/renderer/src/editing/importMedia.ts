import { addMedia } from '@core'
import { useProjectStore } from '../store/projectStore'

export async function importFilePaths(filePaths: string[]): Promise<void> {
  if (filePaths.length === 0) return
  const items = await window.cutline.media.import(filePaths)
  if (items.length === 0) return
  useProjectStore.getState().applyEdit('Import Media', (p) => addMedia(p, items))
}

export async function importViaDialog(): Promise<void> {
  const paths = await window.cutline.dialogs.importMedia()
  if (!paths) return
  await importFilePaths(paths)
}
