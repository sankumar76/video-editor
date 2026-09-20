import { describe, expect, it } from 'vitest'
import { createClip, createEmptyProject } from '@core/model/factory'
import type { Sequence } from '@core/model/types'
import {
  clipsOverlap,
  collectSnapTargets,
  findNextAvailableSlot,
  hasCollision,
  snapTime
} from '@core/timeline/math'

function sequenceWithClips(): Sequence {
  const project = createEmptyProject()
  const sequence = project.sequences[0]!
  const videoTrackId = sequence.tracks.find((t) => t.type === 'video')!.id
  const clipA = createClip({
    mediaId: 'm1',
    trackId: videoTrackId,
    start: 0,
    duration: 1000,
    sourceIn: 0,
    sourceOut: 1000
  })
  const clipB = createClip({
    mediaId: 'm1',
    trackId: videoTrackId,
    start: 2000,
    duration: 500,
    sourceIn: 0,
    sourceOut: 500
  })
  return { ...sequence, clips: [clipA, clipB] }
}

describe('clipsOverlap', () => {
  it('detects overlap', () => {
    expect(clipsOverlap({ start: 0, duration: 100 }, { start: 50, duration: 100 })).toBe(true)
  })
  it('detects adjacency as non-overlapping', () => {
    expect(clipsOverlap({ start: 0, duration: 100 }, { start: 100, duration: 100 })).toBe(false)
  })
})

describe('hasCollision', () => {
  it('finds a collision with an existing clip', () => {
    const sequence = sequenceWithClips()
    const trackId = sequence.tracks[0]!.id
    expect(hasCollision(sequence, trackId, { start: 500, duration: 600 })).toBe(true)
  })
  it('excludes given clip ids', () => {
    const sequence = sequenceWithClips()
    const trackId = sequence.tracks[0]!.id
    const clipA = sequence.clips[0]!
    expect(hasCollision(sequence, trackId, { start: 0, duration: 1000 }, new Set([clipA.id]))).toBe(
      false
    )
  })
})

describe('snapTime', () => {
  it('snaps within threshold', () => {
    expect(snapTime(105, [100, 500], 10)).toBe(100)
  })
  it('does not snap beyond threshold', () => {
    expect(snapTime(120, [100, 500], 10)).toBe(120)
  })
})

describe('collectSnapTargets', () => {
  it('includes clip edges, playhead, and zero', () => {
    const sequence = sequenceWithClips()
    const targets = collectSnapTargets(sequence, 'video', new Set(), 3000)
    expect(targets).toContain(0)
    expect(targets).toContain(1000)
    expect(targets).toContain(2000)
    expect(targets).toContain(2500)
    expect(targets).toContain(3000)
  })
})

describe('findNextAvailableSlot', () => {
  it('returns earliestStart when nothing is in the way', () => {
    const sequence = sequenceWithClips()
    const trackId = sequence.tracks[0]!.id
    expect(findNextAvailableSlot(sequence, trackId, 100, 5000)).toBe(5000)
  })
  it('skips past a colliding clip', () => {
    const sequence = sequenceWithClips()
    const trackId = sequence.tracks[0]!.id
    // earliestStart=200: fits after clipA (ends 1000), but duration=1200 would then run into
    // clipB at [2000,2500), so it should land right after clipB instead.
    expect(findNextAvailableSlot(sequence, trackId, 1200, 200)).toBe(2500)
  })
})
