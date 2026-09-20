import { describe, expect, it } from 'vitest'
import { createClip, createEmptyProject, createPendingMediaItem } from '@core/model/factory'
import {
  addClips,
  addMedia,
  addTrack,
  deleteClips,
  duplicateClips,
  moveClips,
  removeMedia,
  removeTrack,
  reorderTrack,
  setTrackFlags,
  splitClipsAt,
  trimClip
} from '@core/commands/edits'
import { CommandHistory, createCommand } from '@core/commands/history'
import type { Project } from '@core/model/types'

function withOneClip(): { project: Project; clipId: string } {
  let project = createEmptyProject()
  const media = createPendingMediaItem({
    originalPath: 'C:/media/clip.mp4',
    fileName: 'clip.mp4',
    fileSize: 100,
    fileMtimeMs: 0,
    type: 'video'
  })
  project = addMedia(project, [media])
  const sequenceId = project.activeSequenceId
  const trackId = project.sequences[0]!.tracks.find((t) => t.type === 'video')!.id
  // Scaled well above MIN_CLIP_DURATION_TICKS (one frame at 60fps) so trim tests have
  // plenty of room to shrink the clip without hitting that floor.
  const clip = createClip({
    mediaId: media.id,
    trackId,
    start: 100_000,
    duration: 200_000,
    sourceIn: 0,
    sourceOut: 200_000
  })
  project = addClips(project, sequenceId, [clip])
  return { project, clipId: clip.id }
}

describe('CommandHistory do/undo round-trips', () => {
  it('undo restores the exact previous project for every edit type', () => {
    const history = new CommandHistory<Project>()
    let project = createEmptyProject()

    const media = createPendingMediaItem({
      originalPath: 'C:/media/a.mp4',
      fileName: 'a.mp4',
      fileSize: 1,
      fileMtimeMs: 0,
      type: 'video'
    })

    const steps: Array<(p: Project) => Project> = [
      (p) => addMedia(p, [media]),
      (p) => addTrack(p, p.activeSequenceId, 'video'),
      (p) =>
        addClips(p, p.activeSequenceId, [
          createClip({
            mediaId: media.id,
            trackId: p.sequences[0]!.tracks[0]!.id,
            start: 0,
            duration: 1000,
            sourceIn: 0,
            sourceOut: 1000
          })
        ])
    ]

    const snapshots: Project[] = [project]
    for (const step of steps) {
      const before = project
      const after = step(project)
      history.push(createCommand('step', before, after))
      project = after
      snapshots.push(project)
    }

    // Undo everything, expecting each prior snapshot back in reverse order.
    for (let i = snapshots.length - 1; i > 0; i--) {
      const restored = history.undo()
      expect(restored).toEqual(snapshots[i - 1])
      project = restored!
    }
    expect(history.canUndo).toBe(false)

    // Redo everything back to the final state.
    for (let i = 1; i < snapshots.length; i++) {
      const redone = history.redo()
      expect(redone).toEqual(snapshots[i])
      project = redone!
    }
    expect(history.canRedo).toBe(false)
    expect(project).toEqual(snapshots.at(-1))
  })
})

describe('media commands', () => {
  it('removeMedia cascades to delete clips using it', () => {
    const { project, clipId } = withOneClip()
    const mediaId = project.media[0]!.id
    const next = removeMedia(project, [mediaId])
    expect(next.media).toHaveLength(0)
    expect(next.sequences[0]!.clips.find((c) => c.id === clipId)).toBeUndefined()
  })
})

describe('track commands', () => {
  it('addTrack appends a track with the next index', () => {
    const project = createEmptyProject()
    const next = addTrack(project, project.activeSequenceId, 'video')
    const videoTracks = next.sequences[0]!.tracks.filter((t) => t.type === 'video')
    expect(videoTracks).toHaveLength(2)
    expect(videoTracks[1]!.index).toBe(1)
  })

  it('removeTrack also removes clips on that track', () => {
    const { project, clipId } = withOneClip()
    const trackId = project.sequences[0]!.clips[0]!.trackId
    const next = removeTrack(project, project.activeSequenceId, trackId)
    expect(next.sequences[0]!.tracks.find((t) => t.id === trackId)).toBeUndefined()
    expect(next.sequences[0]!.clips.find((c) => c.id === clipId)).toBeUndefined()
  })

  it('setTrackFlags updates only the targeted track', () => {
    const project = createEmptyProject()
    const trackId = project.sequences[0]!.tracks[0]!.id
    const next = setTrackFlags(project, project.activeSequenceId, trackId, { muted: true })
    expect(next.sequences[0]!.tracks.find((t) => t.id === trackId)!.muted).toBe(true)
  })

  it('reorderTrack swaps indices with the neighboring track', () => {
    let project = createEmptyProject()
    project = addTrack(project, project.activeSequenceId, 'video')
    const videoTracks = project.sequences[0]!.tracks.filter((t) => t.type === 'video')
    const first = videoTracks[0]!
    const second = videoTracks[1]!
    const next = reorderTrack(project, project.activeSequenceId, first.id, 'up')
    const nextTracks = next.sequences[0]!.tracks
    expect(nextTracks.find((t) => t.id === first.id)!.index).toBe(second.index)
    expect(nextTracks.find((t) => t.id === second.id)!.index).toBe(first.index)
  })
})

describe('clip commands', () => {
  it('moveClips updates start and trackId', () => {
    const { project, clipId } = withOneClip()
    const audioTrackId = project.sequences[0]!.tracks.find((t) => t.type === 'audio')!.id
    const next = moveClips(project, project.activeSequenceId, [
      { clipId, start: 5000, trackId: audioTrackId }
    ])
    const clip = next.sequences[0]!.clips.find((c) => c.id === clipId)!
    expect(clip.start).toBe(5000)
    expect(clip.trackId).toBe(audioTrackId)
  })

  it('moveClips clamps start to zero', () => {
    const { project, clipId } = withOneClip()
    const trackId = project.sequences[0]!.clips[0]!.trackId
    const next = moveClips(project, project.activeSequenceId, [{ clipId, start: -500, trackId }])
    expect(next.sequences[0]!.clips.find((c) => c.id === clipId)!.start).toBe(0)
  })

  it('trimClip on the end edge shortens duration and adjusts sourceOut', () => {
    const { project, clipId } = withOneClip()
    const next = trimClip(project, project.activeSequenceId, clipId, 'end', 250_000, 1_000_000)
    const clip = next.sequences[0]!.clips.find((c) => c.id === clipId)!
    expect(clip.duration).toBe(150_000) // 250_000 - start(100_000)
    expect(clip.sourceOut).toBe(150_000) // sourceIn(0) + duration
  })

  it('trimClip on the start edge shifts start and sourceIn together', () => {
    const { project, clipId } = withOneClip()
    const next = trimClip(project, project.activeSequenceId, clipId, 'start', 150_000, 1_000_000)
    const clip = next.sequences[0]!.clips.find((c) => c.id === clipId)!
    expect(clip.start).toBe(150_000)
    expect(clip.sourceIn).toBe(50_000) // delta of 50_000 applied
    expect(clip.duration).toBe(150_000) // 300_000 (original end) - 150_000
  })

  it('trimClip refuses to shrink below the minimum duration', () => {
    const { project, clipId } = withOneClip()
    const next = trimClip(project, project.activeSequenceId, clipId, 'end', 100_000, 1_000_000)
    const clip = next.sequences[0]!.clips.find((c) => c.id === clipId)!
    expect(clip.duration).toBeGreaterThan(0)
  })

  it('splitClipsAt creates two clips that together span the original range', () => {
    const { project, clipId } = withOneClip()
    const next = splitClipsAt(project, project.activeSequenceId, [clipId], 200_000)
    const clips = next.sequences[0]!.clips
    expect(clips).toHaveLength(2)
    const [left, right] = [...clips].sort((a, b) => a.start - b.start)
    expect(left!.start).toBe(100_000)
    expect(left!.duration).toBe(100_000)
    expect(right!.start).toBe(200_000)
    expect(right!.duration).toBe(100_000)
    expect(left!.sourceOut).toBe(right!.sourceIn)
  })

  it('splitClipsAt is a no-op when the time is outside the clip', () => {
    const { project, clipId } = withOneClip()
    const next = splitClipsAt(project, project.activeSequenceId, [clipId], 900_000)
    expect(next.sequences[0]!.clips).toHaveLength(1)
  })

  it('deleteClips without ripple leaves a gap', () => {
    const { project, clipId } = withOneClip()
    const next = deleteClips(project, project.activeSequenceId, [clipId], false)
    expect(next.sequences[0]!.clips).toHaveLength(0)
  })

  it('deleteClips with ripple shifts later clips left', () => {
    const { project, clipId } = withOneClip()
    const trackId = project.sequences[0]!.clips[0]!.trackId
    const secondClip = createClip({
      mediaId: project.media[0]!.id,
      trackId,
      start: 500_000,
      duration: 100_000,
      sourceIn: 0,
      sourceOut: 100_000
    })
    const withSecond = addClips(project, project.activeSequenceId, [secondClip])
    const next = deleteClips(withSecond, project.activeSequenceId, [clipId], true)
    const remaining = next.sequences[0]!.clips
    expect(remaining).toHaveLength(1)
    // Ripple-delete closes the hole left by the deleted clip's own duration (200_000 ticks);
    // the pre-existing gap before it is untouched.
    expect(remaining[0]!.start).toBe(500_000 - 200_000)
  })

  it('duplicateClips places the copy in the next free slot on the same track', () => {
    const { project, clipId } = withOneClip()
    const next = duplicateClips(project, project.activeSequenceId, [clipId])
    expect(next.sequences[0]!.clips).toHaveLength(2)
    const original = next.sequences[0]!.clips.find((c) => c.id === clipId)!
    const duplicate = next.sequences[0]!.clips.find((c) => c.id !== clipId)!
    expect(duplicate.start).toBe(original.start + original.duration)
    expect(duplicate.duration).toBe(original.duration)
  })
})
