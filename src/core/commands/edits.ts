import { TICKS_PER_SECOND } from '../time'
import { createId } from '../model/id'
import { createTrack } from '../model/factory'
import type { Clip, MediaItem, Project, Sequence, Track, TrackType } from '../model/types'
import { clipEnd, clipsOnTrack, findNextAvailableSlot } from '../timeline/math'

export const MIN_CLIP_DURATION_TICKS = Math.round(TICKS_PER_SECOND / 60)

function updateSequence(
  project: Project,
  sequenceId: string,
  updater: (sequence: Sequence) => Sequence
): Project {
  return {
    ...project,
    sequences: project.sequences.map((sequence) =>
      sequence.id === sequenceId ? updater(sequence) : sequence
    )
  }
}

// --- Media -------------------------------------------------------------

export function addMedia(project: Project, items: readonly MediaItem[]): Project {
  return { ...project, media: [...project.media, ...items] }
}

export function removeMedia(project: Project, mediaIds: readonly string[]): Project {
  const idsToRemove = new Set(mediaIds)
  return {
    ...project,
    media: project.media.filter((m) => !idsToRemove.has(m.id)),
    sequences: project.sequences.map((sequence) => ({
      ...sequence,
      clips: sequence.clips.filter((c) => !idsToRemove.has(c.mediaId))
    }))
  }
}

export function updateMediaItem(
  project: Project,
  mediaId: string,
  patch: Partial<MediaItem>
): Project {
  return {
    ...project,
    media: project.media.map((m) => (m.id === mediaId ? { ...m, ...patch } : m))
  }
}

// --- Project settings ----------------------------------------------------

export function setProjectSettings(
  project: Project,
  patch: Partial<
    Pick<Project, 'name' | 'resolution' | 'frameRate' | 'sampleRate' | 'backgroundColor'>
  >
): Project {
  return { ...project, ...patch }
}

// --- Tracks --------------------------------------------------------------

export function addTrack(project: Project, sequenceId: string, type: TrackType): Project {
  return updateSequence(project, sequenceId, (sequence) => {
    const sameType = sequence.tracks.filter((t) => t.type === type)
    return { ...sequence, tracks: [...sequence.tracks, createTrack(type, sameType.length)] }
  })
}

export function removeTrack(project: Project, sequenceId: string, trackId: string): Project {
  return updateSequence(project, sequenceId, (sequence) => ({
    ...sequence,
    tracks: sequence.tracks.filter((t) => t.id !== trackId),
    clips: sequence.clips.filter((c) => c.trackId !== trackId)
  }))
}

export function setTrackFlags(
  project: Project,
  sequenceId: string,
  trackId: string,
  patch: Partial<Pick<Track, 'locked' | 'muted' | 'solo' | 'hidden' | 'name' | 'height'>>
): Project {
  return updateSequence(project, sequenceId, (sequence) => ({
    ...sequence,
    tracks: sequence.tracks.map((t) => (t.id === trackId ? { ...t, ...patch } : t))
  }))
}

export function reorderTrack(
  project: Project,
  sequenceId: string,
  trackId: string,
  direction: 'up' | 'down'
): Project {
  return updateSequence(project, sequenceId, (sequence) => {
    const track = sequence.tracks.find((t) => t.id === trackId)
    if (!track) return sequence
    const sameType = sequence.tracks
      .filter((t) => t.type === track.type)
      .sort((a, b) => a.index - b.index)
    const pos = sameType.findIndex((t) => t.id === trackId)
    const swapWith = direction === 'up' ? sameType[pos + 1] : sameType[pos - 1]
    if (!swapWith) return sequence
    return {
      ...sequence,
      tracks: sequence.tracks.map((t) => {
        if (t.id === track.id) return { ...t, index: swapWith.index }
        if (t.id === swapWith.id) return { ...t, index: track.index }
        return t
      })
    }
  })
}

// --- Clips -----------------------------------------------------------------

export function addClips(project: Project, sequenceId: string, clips: readonly Clip[]): Project {
  return updateSequence(project, sequenceId, (sequence) => ({
    ...sequence,
    clips: [...sequence.clips, ...clips]
  }))
}

export function moveClips(
  project: Project,
  sequenceId: string,
  moves: readonly { clipId: string; start: number; trackId: string }[]
): Project {
  return updateSequence(project, sequenceId, (sequence) => {
    const moveMap = new Map(moves.map((m) => [m.clipId, m]))
    return {
      ...sequence,
      clips: sequence.clips.map((clip) => {
        const move = moveMap.get(clip.id)
        if (!move) return clip
        return { ...clip, start: Math.max(0, move.start), trackId: move.trackId }
      })
    }
  })
}

export function trimClip(
  project: Project,
  sequenceId: string,
  clipId: string,
  edge: 'start' | 'end',
  proposedTime: number,
  mediaDuration: number
): Project {
  return updateSequence(project, sequenceId, (sequence) => {
    const clip = sequence.clips.find((c) => c.id === clipId)
    if (!clip) return sequence
    const siblings = clipsOnTrack(sequence, clip.trackId).filter((c) => c.id !== clipId)

    if (edge === 'start') {
      const prev = [...siblings].reverse().find((c) => clipEnd(c) <= clip.start)
      const lowerBound = Math.max(0, clip.start - clip.sourceIn, prev ? clipEnd(prev) : 0)
      const upperBound = clip.start + clip.duration - MIN_CLIP_DURATION_TICKS
      const newStart = Math.min(Math.max(proposedTime, lowerBound), upperBound)
      const delta = newStart - clip.start
      const updated: Clip = {
        ...clip,
        start: newStart,
        duration: clip.duration - delta,
        sourceIn: clip.sourceIn + delta
      }
      return { ...sequence, clips: sequence.clips.map((c) => (c.id === clipId ? updated : c)) }
    }

    const next = siblings.find((c) => c.start >= clipEnd(clip))
    const lowerBound = clip.start + MIN_CLIP_DURATION_TICKS
    const maxBySource = clip.start + (mediaDuration - clip.sourceIn)
    const upperBound = Math.min(next ? next.start : Infinity, maxBySource)
    const newEnd = Math.min(Math.max(proposedTime, lowerBound), upperBound)
    const newDuration = newEnd - clip.start
    const updated: Clip = {
      ...clip,
      duration: newDuration,
      sourceOut: clip.sourceIn + newDuration
    }
    return { ...sequence, clips: sequence.clips.map((c) => (c.id === clipId ? updated : c)) }
  })
}

export function splitClipsAt(
  project: Project,
  sequenceId: string,
  clipIds: readonly string[],
  time: number
): Project {
  return updateSequence(project, sequenceId, (sequence) => {
    const idsToSplit = new Set(clipIds)
    const splitResults = new Map<string, { left: Clip; right: Clip }>()
    const nextClips: Clip[] = []

    for (const clip of sequence.clips) {
      if (idsToSplit.has(clip.id) && clip.start < time && time < clipEnd(clip)) {
        const left: Clip = {
          ...clip,
          id: createId('clip'),
          duration: time - clip.start,
          sourceOut: clip.sourceIn + (time - clip.start)
        }
        const right: Clip = {
          ...clip,
          id: createId('clip'),
          start: time,
          duration: clipEnd(clip) - time,
          sourceIn: clip.sourceIn + (time - clip.start)
        }
        splitResults.set(clip.id, { left, right })
      } else {
        nextClips.push(clip)
      }
    }

    for (const [originalId, pair] of splitResults) {
      const original = sequence.clips.find((c) => c.id === originalId)
      const partnerId = original?.linkedClipId ?? null
      const partnerSplit = partnerId ? splitResults.get(partnerId) : undefined
      if (partnerSplit) {
        pair.left.linkedClipId = partnerSplit.left.id
        pair.right.linkedClipId = partnerSplit.right.id
      } else {
        pair.left.linkedClipId = null
        pair.right.linkedClipId = null
      }
      nextClips.push(pair.left, pair.right)
    }

    return { ...sequence, clips: nextClips }
  })
}

export function deleteClips(
  project: Project,
  sequenceId: string,
  clipIds: readonly string[],
  ripple: boolean
): Project {
  return updateSequence(project, sequenceId, (sequence) => {
    const idsToDelete = new Set(clipIds)
    if (!ripple) {
      return { ...sequence, clips: sequence.clips.filter((c) => !idsToDelete.has(c.id)) }
    }
    const nextClips: Clip[] = []
    for (const track of sequence.tracks) {
      let shift = 0
      for (const clip of clipsOnTrack(sequence, track.id)) {
        if (idsToDelete.has(clip.id)) {
          shift += clip.duration
          continue
        }
        nextClips.push(shift > 0 ? { ...clip, start: clip.start - shift } : clip)
      }
    }
    return { ...sequence, clips: nextClips }
  })
}

export function duplicateClips(
  project: Project,
  sequenceId: string,
  clipIds: readonly string[]
): Project {
  return updateSequence(project, sequenceId, (sequence) => {
    const idsToDuplicate = new Set(clipIds)
    const originals = sequence.clips.filter((c) => idsToDuplicate.has(c.id))
    const idMap = new Map<string, string>()
    const duplicates: Clip[] = []
    let workingClips = sequence.clips

    for (const original of originals) {
      const workingSequence = { ...sequence, clips: workingClips }
      const newStart = findNextAvailableSlot(
        workingSequence,
        original.trackId,
        original.duration,
        clipEnd(original)
      )
      const newId = createId('clip')
      idMap.set(original.id, newId)
      const duplicate: Clip = { ...original, id: newId, start: newStart, linkedClipId: null }
      duplicates.push(duplicate)
      workingClips = [...workingClips, duplicate]
    }

    for (const duplicate of duplicates) {
      const original = originals.find((o) => idMap.get(o.id) === duplicate.id)
      if (original?.linkedClipId && idMap.has(original.linkedClipId)) {
        duplicate.linkedClipId = idMap.get(original.linkedClipId) ?? null
      }
    }

    return { ...sequence, clips: workingClips }
  })
}
