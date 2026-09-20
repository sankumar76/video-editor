import type { Clip, Sequence } from '../model/types'

export function clipEnd(clip: Pick<Clip, 'start' | 'duration'>): number {
  return clip.start + clip.duration
}

export function clipsOverlap(
  a: Pick<Clip, 'start' | 'duration'>,
  b: Pick<Clip, 'start' | 'duration'>
): boolean {
  return a.start < clipEnd(b) && b.start < clipEnd(a)
}

export function clipsOnTrack(sequence: Sequence, trackId: string): Clip[] {
  return sequence.clips.filter((clip) => clip.trackId === trackId).sort((a, b) => a.start - b.start)
}

/** True if placing a clip with the given start/duration on trackId would overlap an existing clip (other than excludeClipIds). */
export function hasCollision(
  sequence: Sequence,
  trackId: string,
  candidate: { start: number; duration: number },
  excludeClipIds: ReadonlySet<string> = new Set()
): boolean {
  return sequence.clips.some(
    (clip) =>
      clip.trackId === trackId && !excludeClipIds.has(clip.id) && clipsOverlap(clip, candidate)
  )
}

/** Snaps `time` to the nearest of `targets` within `thresholdTicks`, else returns `time` unchanged. */
export function snapTime(time: number, targets: readonly number[], thresholdTicks: number): number {
  let best = time
  let bestDistance = thresholdTicks
  for (const target of targets) {
    const distance = Math.abs(target - time)
    if (distance <= bestDistance) {
      bestDistance = distance
      best = target
    }
  }
  return best
}

/** Snap targets for a drag operation: every other clip's start/end on the same track type, plus the playhead and 0. */
export function collectSnapTargets(
  sequence: Sequence,
  trackType: 'video' | 'audio',
  excludeClipIds: ReadonlySet<string>,
  playheadTicks: number
): number[] {
  const trackIds = new Set(sequence.tracks.filter((t) => t.type === trackType).map((t) => t.id))
  const targets: number[] = [0, playheadTicks]
  for (const clip of sequence.clips) {
    if (!trackIds.has(clip.trackId) || excludeClipIds.has(clip.id)) continue
    targets.push(clip.start, clipEnd(clip))
  }
  return targets
}

export function ticksToPixels(
  ticks: number,
  pixelsPerSecond: number,
  ticksPerSecond: number
): number {
  return (ticks / ticksPerSecond) * pixelsPerSecond
}

export function pixelsToTicks(
  pixels: number,
  pixelsPerSecond: number,
  ticksPerSecond: number
): number {
  return (pixels / pixelsPerSecond) * ticksPerSecond
}

export function findClipAt(sequence: Sequence, trackId: string, time: number): Clip | undefined {
  return sequence.clips.find(
    (clip) => clip.trackId === trackId && clip.start <= time && time < clipEnd(clip)
  )
}

export function sequenceDuration(sequence: Sequence): number {
  return sequence.clips.reduce((max, clip) => Math.max(max, clipEnd(clip)), 0)
}

/** Finds the earliest start >= earliestStart on trackId that fits `duration` without colliding. */
export function findNextAvailableSlot(
  sequence: Sequence,
  trackId: string,
  duration: number,
  earliestStart: number
): number {
  const trackClips = clipsOnTrack(sequence, trackId)
  let candidate = Math.max(0, earliestStart)
  for (const clip of trackClips) {
    if (candidate + duration <= clip.start) break
    if (clipEnd(clip) > candidate) candidate = clipEnd(clip)
  }
  return candidate
}
