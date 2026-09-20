import {
  addClips,
  createClip,
  createId,
  deleteClips,
  duplicateClips,
  findNextAvailableSlot,
  hasCollision,
  moveClips,
  secondsToTicks,
  splitClipsAt,
  trimClip,
  type Clip,
  type Project
} from '@core'
import { activeSequence, useProjectStore } from '../store/projectStore'

const IMAGE_DEFAULT_DURATION_TICKS = secondsToTicks(5)

function withLinkedIds(project: Project, clipIds: readonly string[]): string[] {
  const sequence = activeSequence(project)
  const result = new Set(clipIds)
  for (const id of clipIds) {
    const clip = sequence.clips.find((c) => c.id === id)
    if (clip?.linkedClipId) result.add(clip.linkedClipId)
  }
  return [...result]
}

export function splitAtPlayhead(): void {
  const { project, selectedClipIds, playheadTicks, applyEdit } = useProjectStore.getState()
  const sequence = activeSequence(project)
  let targetIds: string[] = selectedClipIds
  if (targetIds.length === 0) {
    targetIds = sequence.clips
      .filter((c) => c.start < playheadTicks && playheadTicks < c.start + c.duration)
      .map((c) => c.id)
  }
  targetIds = withLinkedIds(project, targetIds)
  if (targetIds.length === 0) return
  applyEdit('Split', (p) => splitClipsAt(p, sequence.id, targetIds, playheadTicks))
}

export function deleteSelected(ripple: boolean): void {
  const { project, selectedClipIds, applyEdit, clearSelection } = useProjectStore.getState()
  if (selectedClipIds.length === 0) return
  const sequence = activeSequence(project)
  const ids = withLinkedIds(project, selectedClipIds)
  applyEdit(ripple ? 'Ripple Delete' : 'Delete', (p) => deleteClips(p, sequence.id, ids, ripple))
  clearSelection()
}

export function duplicateSelected(): void {
  const { project, selectedClipIds, applyEdit } = useProjectStore.getState()
  if (selectedClipIds.length === 0) return
  const sequence = activeSequence(project)
  applyEdit('Duplicate', (p) => duplicateClips(p, sequence.id, selectedClipIds))
}

export function selectAllClips(): void {
  const { project, selectClips } = useProjectStore.getState()
  const sequence = activeSequence(project)
  selectClips(
    sequence.clips.map((c) => c.id),
    'replace'
  )
}

let clipboard: Clip[] | null = null

export function copySelected(): void {
  const { project, selectedClipIds } = useProjectStore.getState()
  const sequence = activeSequence(project)
  const ids = withLinkedIds(project, selectedClipIds)
  const clips = sequence.clips.filter((c) => ids.includes(c.id))
  clipboard = clips.length > 0 ? clips.map((c) => ({ ...c })) : null
}

export function cutSelected(): void {
  copySelected()
  deleteSelected(false)
}

export function pasteAtPlayhead(): void {
  if (!clipboard || clipboard.length === 0) return
  const snapshot = clipboard
  const { project, playheadTicks, applyEdit, selectClips } = useProjectStore.getState()
  const sequence = activeSequence(project)
  const earliestStart = Math.min(...snapshot.map((c) => c.start))
  const offset = playheadTicks - earliestStart

  let pastedIds: string[] = []

  applyEdit('Paste', (p) => {
    const seq = activeSequence(p)
    const idMap = new Map<string, string>()
    const shifted = snapshot.map((c) => {
      const newId = createId('clip')
      idMap.set(c.id, newId)
      return { ...c, id: newId, start: c.start + offset }
    })

    let working = seq.clips
    const placed = shifted.map((clip) => {
      const workingSequence = { ...seq, clips: working }
      const start = findNextAvailableSlot(workingSequence, clip.trackId, clip.duration, clip.start)
      const placedClip: Clip = { ...clip, start }
      working = [...working, placedClip]
      return placedClip
    })

    for (const clip of placed) {
      if (clip.linkedClipId && idMap.has(clip.linkedClipId)) {
        clip.linkedClipId = idMap.get(clip.linkedClipId) ?? null
      }
    }

    pastedIds = placed.map((c) => c.id)
    return addClips(p, sequence.id, placed)
  })

  if (pastedIds.length > 0) selectClips(pastedIds, 'replace')
}

/** Returns false (and applies nothing) if the proposed move would collide. */
export function moveClipsWithCollisionCheck(
  moves: readonly { clipId: string; start: number; trackId: string }[]
): boolean {
  const { project, applyEdit } = useProjectStore.getState()
  const sequence = activeSequence(project)
  const movingIds = new Set(moves.map((m) => m.clipId))
  for (const move of moves) {
    const clip = sequence.clips.find((c) => c.id === move.clipId)
    if (!clip) continue
    if (
      hasCollision(
        sequence,
        move.trackId,
        { start: move.start, duration: clip.duration },
        movingIds
      )
    ) {
      return false
    }
  }
  applyEdit('Move', (p) => moveClips(p, sequence.id, moves))
  return true
}

export function trimClipEdge(clipId: string, edge: 'start' | 'end', proposedTime: number): void {
  const { project, applyEdit } = useProjectStore.getState()
  const sequence = activeSequence(project)
  const clip = sequence.clips.find((c) => c.id === clipId)
  if (!clip) return
  const media = project.media.find((m) => m.id === clip.mediaId)
  const mediaDuration = media?.duration ?? Number.MAX_SAFE_INTEGER

  applyEdit('Trim', (p) => {
    let next = trimClip(p, sequence.id, clipId, edge, proposedTime, mediaDuration)
    // Keep a linked video+audio pair's edges in sync rather than letting one drift.
    if (clip.linkedClipId) {
      next = trimClip(next, sequence.id, clip.linkedClipId, edge, proposedTime, mediaDuration)
    }
    return next
  })
}

/** Drops a media-bin item onto the timeline; auto-creates a linked audio clip for video-with-audio. */
export function dropMediaOnTimeline(
  mediaId: string,
  trackId: string,
  proposedStartTicks: number
): void {
  const { project, applyEdit, selectClips } = useProjectStore.getState()
  const sequence = activeSequence(project)
  const media = project.media.find((m) => m.id === mediaId)
  const track = sequence.tracks.find((t) => t.id === trackId)
  if (!media || !track) return
  if (media.type === 'audio' && track.type !== 'audio') return
  if (media.type !== 'audio' && track.type !== 'video') return

  const duration = media.type === 'image' ? IMAGE_DEFAULT_DURATION_TICKS : media.duration
  if (duration <= 0) return

  const needsAudioPartner = media.type === 'video' && media.hasAudio
  const audioTrack = needsAudioPartner ? sequence.tracks.find((t) => t.type === 'audio') : undefined

  let start = findNextAvailableSlot(sequence, trackId, duration, Math.max(0, proposedStartTicks))
  if (audioTrack) {
    const audioStart = findNextAvailableSlot(sequence, audioTrack.id, duration, start)
    if (audioStart !== start) {
      start = findNextAvailableSlot(sequence, trackId, duration, audioStart)
    }
  }

  const newIds: string[] = []
  const isFirstClipEver = project.sequences.every((s) => s.clips.length === 0)

  applyEdit('Add Clip', (p) => {
    const seq = activeSequence(p)
    const videoClip = createClip({
      mediaId,
      trackId,
      start,
      duration,
      sourceIn: 0,
      sourceOut: duration
    })
    newIds.push(videoClip.id)
    let next: Project
    if (audioTrack) {
      const audioClip = createClip({
        mediaId,
        trackId: audioTrack.id,
        start,
        duration,
        sourceIn: 0,
        sourceOut: duration,
        linkedClipId: videoClip.id
      })
      videoClip.linkedClipId = audioClip.id
      newIds.push(audioClip.id)
      next = addClips(p, seq.id, [videoClip, audioClip])
    } else {
      next = addClips(p, seq.id, [videoClip])
    }

    // First clip ever placed on the timeline sets the project's default resolution/fps.
    if (isFirstClipEver && media.type !== 'audio' && media.width > 0 && media.height > 0) {
      next = {
        ...next,
        resolution: { width: media.width, height: media.height },
        frameRate: media.frameRate > 0 ? Math.round(media.frameRate * 100) / 100 : next.frameRate
      }
    }
    return next
  })

  selectClips(newIds, 'replace')
}
