import { TICKS_PER_SECOND } from '../time'
import type { Project } from '../model/types'
import { clipEnd, sequenceDuration } from '../timeline/math'

export interface FilterGraphInput {
  path: string
  /** Images need `-loop 1` at the input level so trim/setpts can treat them like video. */
  isImage: boolean
}

export interface ExportSettings {
  width: number
  height: number
  frameRate: number
  sampleRate: number
  backgroundColor: string
  /** 0 (best) - 51 (worst). Ignored if videoBitrateKbps is set. */
  crf?: number
  videoBitrateKbps?: number
}

export interface FilterGraphResult {
  /** One entry per -i argument, in order (array index == ffmpeg input index). */
  inputs: FilterGraphInput[]
  /** filter_complex script body, written to a temp file and passed via -filter_complex_script. */
  filterComplexScript: string
  videoOutputLabel: string
  audioOutputLabel: string
  durationSeconds: number
}

/**
 * Builds an FFmpeg filter_complex graph for the given sequence: one input per unique
 * media file (originals, never proxies), each enabled clip trimmed and time-shifted to
 * its timeline position, video tracks layered bottom-to-top with `overlay` gated by
 * `enable='between(t,start,end)'` onto a background-color canvas, and audio clips
 * delayed into position and combined with `amix`. No transitions/transforms/effects yet
 * (M2+) — this covers exactly what M1 needs: cut-only multi-track sequences.
 */
export function buildFilterGraph(
  project: Project,
  sequenceId: string,
  settings: ExportSettings
): FilterGraphResult {
  const sequence = project.sequences.find((s) => s.id === sequenceId)
  if (!sequence) throw new Error(`Sequence not found: ${sequenceId}`)

  const durationSeconds = sequenceDuration(sequence) / TICKS_PER_SECOND
  if (durationSeconds <= 0) throw new Error('Sequence has no clips to export')

  const mediaById = new Map(project.media.map((m) => [m.id, m]))
  const enabledClips = sequence.clips.filter((c) => c.enabled)

  const inputs: FilterGraphInput[] = []
  const inputIndexByMediaId = new Map<string, number>()
  for (const clip of enabledClips) {
    if (inputIndexByMediaId.has(clip.mediaId)) continue
    const media = mediaById.get(clip.mediaId)
    if (!media) continue
    inputIndexByMediaId.set(clip.mediaId, inputs.length)
    inputs.push({ path: media.originalPath, isImage: media.type === 'image' })
  }

  const lines: string[] = []
  const bg = settings.backgroundColor

  lines.push(
    `color=c=${bg}:s=${settings.width}x${settings.height}:r=${settings.frameRate}:` +
      `d=${durationSeconds.toFixed(3)}[base0]`
  )

  const videoTracks = sequence.tracks
    .filter((t) => t.type === 'video' && !t.hidden)
    .sort((a, b) => a.index - b.index)
  const videoTrackIndexById = new Map(videoTracks.map((t) => [t.id, t.index]))
  const videoClips = enabledClips
    .filter((c) => videoTrackIndexById.has(c.trackId))
    .sort(
      (a, b) =>
        (videoTrackIndexById.get(a.trackId) ?? 0) - (videoTrackIndexById.get(b.trackId) ?? 0)
    )

  let runningVideoLabel = 'base0'
  videoClips.forEach((clip, i) => {
    const inputIdx = inputIndexByMediaId.get(clip.mediaId)
    if (inputIdx === undefined) return
    const startSec = clip.start / TICKS_PER_SECOND
    const endSec = clipEnd(clip) / TICKS_PER_SECOND
    const inSec = clip.sourceIn / TICKS_PER_SECOND
    const outSec = clip.sourceOut / TICKS_PER_SECOND
    const clipLabel = `v${i}`
    const nextLabel = `base${i + 1}`

    lines.push(
      `[${inputIdx}:v]trim=start=${inSec.toFixed(3)}:end=${outSec.toFixed(3)},` +
        `setpts=PTS-STARTPTS+${startSec.toFixed(3)}/TB,` +
        `scale=${settings.width}:${settings.height}:force_original_aspect_ratio=decrease,` +
        `pad=${settings.width}:${settings.height}:(ow-iw)/2:(oh-ih)/2:color=${bg}[${clipLabel}]`
    )
    lines.push(
      `[${runningVideoLabel}][${clipLabel}]overlay=x=0:y=0:` +
        `enable='between(t,${startSec.toFixed(3)},${endSec.toFixed(3)})'[${nextLabel}]`
    )
    runningVideoLabel = nextLabel
  })

  const audioTracks = sequence.tracks.filter((t) => t.type === 'audio')
  const soloed = audioTracks.filter((t) => t.solo)
  const activeAudioTrackIds = new Set(
    (soloed.length > 0 ? soloed : audioTracks).filter((t) => !t.muted).map((t) => t.id)
  )
  const audioClips = enabledClips.filter((c) => activeAudioTrackIds.has(c.trackId))

  const audioLabels: string[] = []
  audioClips.forEach((clip, i) => {
    const media = mediaById.get(clip.mediaId)
    if (!media?.hasAudio) return
    const inputIdx = inputIndexByMediaId.get(clip.mediaId)
    if (inputIdx === undefined) return
    const startMs = Math.max(0, Math.round((clip.start / TICKS_PER_SECOND) * 1000))
    const inSec = clip.sourceIn / TICKS_PER_SECOND
    const outSec = clip.sourceOut / TICKS_PER_SECOND
    const label = `a${i}`
    lines.push(
      `[${inputIdx}:a]atrim=start=${inSec.toFixed(3)}:end=${outSec.toFixed(3)},asetpts=PTS-STARTPTS,` +
        `volume=${clip.volume},adelay=${startMs}:all=1[${label}]`
    )
    audioLabels.push(label)
  })

  const audioOutputLabel = 'aout'
  if (audioLabels.length > 0) {
    lines.push(
      `${audioLabels.map((l) => `[${l}]`).join('')}amix=inputs=${audioLabels.length}:` +
        `duration=longest:normalize=0,atrim=duration=${durationSeconds.toFixed(3)}[${audioOutputLabel}]`
    )
  } else {
    lines.push(
      `anullsrc=channel_layout=stereo:sample_rate=${settings.sampleRate}:` +
        `duration=${durationSeconds.toFixed(3)}[${audioOutputLabel}]`
    )
  }

  return {
    inputs,
    filterComplexScript: lines.join(';\n'),
    videoOutputLabel: runningVideoLabel,
    audioOutputLabel,
    durationSeconds
  }
}
