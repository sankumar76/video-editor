export type MediaType = 'video' | 'audio' | 'image'

export type ProbeStatus = 'pending' | 'probing' | 'ready' | 'error'

export interface MediaItem {
  id: string
  /** Absolute path at import time. */
  originalPath: string
  /** Path relative to the project file, used for relinking; null until the project is saved once. */
  relativePath: string | null
  type: MediaType
  fileName: string
  fileSize: number
  fileMtimeMs: number

  probeStatus: ProbeStatus
  probeError: string | null

  /** Ticks. 0 for still images. */
  duration: number
  width: number
  height: number
  /** 0, 90, 180, or 270. */
  rotation: number
  frameRate: number
  isVariableFrameRate: boolean
  videoCodec: string | null
  hasAudio: boolean
  audioCodec: string | null
  audioChannels: number
  audioSampleRate: number

  /** Whether the file can be played directly by Chromium, or needs `proxyPath` for preview. */
  needsProxy: boolean
  proxyStatus: ProbeStatus
  proxyPath: string | null
  /** 0..1, only meaningful while proxyStatus === 'probing'. */
  proxyProgress: number
  thumbnailStatus: ProbeStatus
  thumbnailPath: string | null
}

export type TrackType = 'video' | 'audio'

export interface Track {
  id: string
  type: TrackType
  name: string
  /** Render/stack order: for video tracks, higher index draws on top. */
  index: number
  locked: boolean
  muted: boolean
  solo: boolean
  hidden: boolean
  height: number
}

export interface Clip {
  id: string
  mediaId: string
  trackId: string
  /** Timeline position, ticks. */
  start: number
  /** Timeline duration, ticks (may differ from sourceOut - sourceIn when speed != 1). */
  duration: number
  /** In point within the source media, ticks, at speed 1x. */
  sourceIn: number
  /** Out point within the source media, ticks, at speed 1x. */
  sourceOut: number
  speed: number
  enabled: boolean
  volume: number
  /** Id of the paired audio/video clip created from the same import, if any. */
  linkedClipId: string | null
}

export interface Sequence {
  id: string
  name: string
  tracks: Track[]
  clips: Clip[]
}

export const SCHEMA_VERSION = 1

export interface Project {
  schemaVersion: typeof SCHEMA_VERSION
  name: string
  resolution: { width: number; height: number }
  frameRate: number
  sampleRate: number
  backgroundColor: string
  media: MediaItem[]
  sequences: Sequence[]
  activeSequenceId: string
}
