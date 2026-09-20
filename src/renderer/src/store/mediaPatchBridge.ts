import { useProjectStore } from './projectStore'

let initialized = false

/** Forwards background probe/thumbnail/proxy job updates from main into the project store. */
export function initMediaPatchBridge(): void {
  if (initialized) return
  initialized = true
  window.cutline.media.onPatch(({ mediaId, patch }) => {
    useProjectStore.getState().patchMediaItem(mediaId, patch)
  })
}
