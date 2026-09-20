import { describe, expect, it } from 'vitest'
import { addClips, addMedia } from '@core/commands/edits'
import { buildFilterGraph } from '@core/export/filterGraph'
import { createClip, createEmptyProject, createPendingMediaItem } from '@core/model/factory'
import type { Project } from '@core/model/types'

function projectWithTwoClips(): Project {
  let project = createEmptyProject()
  const media = createPendingMediaItem({
    originalPath: 'C:/media/clip.mp4',
    fileName: 'clip.mp4',
    fileSize: 100,
    fileMtimeMs: 0,
    type: 'video'
  })
  project = {
    ...addMedia(project, [media]),
    media: [{ ...media, hasAudio: true, duration: 10_000_000 }]
  }
  const sequenceId = project.activeSequenceId
  const videoTrackId = project.sequences[0]!.tracks.find((t) => t.type === 'video')!.id
  const audioTrackId = project.sequences[0]!.tracks.find((t) => t.type === 'audio')!.id

  const videoClip = createClip({
    mediaId: media.id,
    trackId: videoTrackId,
    start: 0,
    duration: 120_000, // 1s at 120000 ticks/sec
    sourceIn: 0,
    sourceOut: 120_000
  })
  const audioClip = createClip({
    mediaId: media.id,
    trackId: audioTrackId,
    start: 0,
    duration: 120_000,
    sourceIn: 0,
    sourceOut: 120_000
  })
  return addClips(project, sequenceId, [videoClip, audioClip])
}

describe('buildFilterGraph', () => {
  it('throws when the sequence has no clips', () => {
    const project = createEmptyProject()
    expect(() =>
      buildFilterGraph(project, project.activeSequenceId, {
        width: 1920,
        height: 1080,
        frameRate: 30,
        sampleRate: 48000,
        backgroundColor: '#000000'
      })
    ).toThrow()
  })

  it('produces one input per unique media file, a base canvas, and video+audio outputs', () => {
    const project = projectWithTwoClips()
    const result = buildFilterGraph(project, project.activeSequenceId, {
      width: 1280,
      height: 720,
      frameRate: 30,
      sampleRate: 48000,
      backgroundColor: '#000000'
    })

    expect(result.inputs).toEqual([{ path: 'C:/media/clip.mp4', isImage: false }])
    expect(result.durationSeconds).toBeCloseTo(1, 3)
    expect(result.filterComplexScript).toContain('color=c=#000000:s=1280x720')
    expect(result.filterComplexScript).toContain('[0:v]trim=')
    expect(result.filterComplexScript).toContain('[0:a]atrim=')
    expect(result.filterComplexScript).toContain('overlay=x=0:y=0')
    expect(result.videoOutputLabel).toBe('base1')
    expect(result.audioOutputLabel).toBe('aout')
  })

  it('flags image media so the caller can add -loop 1', () => {
    let project = projectWithTwoClips()
    project = { ...project, media: project.media.map((m) => ({ ...m, type: 'image' as const })) }
    const result = buildFilterGraph(project, project.activeSequenceId, {
      width: 640,
      height: 360,
      frameRate: 24,
      sampleRate: 44100,
      backgroundColor: '#000000'
    })
    expect(result.inputs[0]!.isImage).toBe(true)
  })

  it('falls back to a silent track when no clip has audio', () => {
    let project = projectWithTwoClips()
    project = { ...project, media: project.media.map((m) => ({ ...m, hasAudio: false })) }
    const result = buildFilterGraph(project, project.activeSequenceId, {
      width: 640,
      height: 360,
      frameRate: 24,
      sampleRate: 44100,
      backgroundColor: '#111111'
    })
    expect(result.filterComplexScript).toContain('anullsrc=channel_layout=stereo:sample_rate=44100')
  })
})
