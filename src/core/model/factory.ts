import { createId } from './id'
import {
  SCHEMA_VERSION,
  type Clip,
  type MediaItem,
  type Project,
  type Sequence,
  type Track
} from './types'

export function createEmptyProject(name = 'Untitled Project'): Project {
  const sequence = createSequence('Sequence 1')
  return {
    schemaVersion: SCHEMA_VERSION,
    name,
    resolution: { width: 1920, height: 1080 },
    frameRate: 30,
    sampleRate: 48000,
    backgroundColor: '#000000',
    media: [],
    sequences: [sequence],
    activeSequenceId: sequence.id
  }
}

export function createSequence(name: string): Sequence {
  const videoTrack = createTrack('video', 0, 'V1')
  const audioTrack = createTrack('audio', 0, 'A1')
  return {
    id: createId('seq'),
    name,
    tracks: [videoTrack, audioTrack],
    clips: []
  }
}

export function createTrack(type: Track['type'], index: number, name?: string): Track {
  return {
    id: createId('track'),
    type,
    name: name ?? (type === 'video' ? `V${index + 1}` : `A${index + 1}`),
    index,
    locked: false,
    muted: false,
    solo: false,
    hidden: false,
    height: type === 'video' ? 72 : 48
  }
}

export function createPendingMediaItem(input: {
  originalPath: string
  fileName: string
  fileSize: number
  fileMtimeMs: number
  type: MediaItem['type']
}): MediaItem {
  return {
    id: createId('media'),
    originalPath: input.originalPath,
    relativePath: null,
    type: input.type,
    fileName: input.fileName,
    fileSize: input.fileSize,
    fileMtimeMs: input.fileMtimeMs,
    probeStatus: 'pending',
    probeError: null,
    duration: 0,
    width: 0,
    height: 0,
    rotation: 0,
    frameRate: 0,
    isVariableFrameRate: false,
    videoCodec: null,
    hasAudio: false,
    audioCodec: null,
    audioChannels: 0,
    audioSampleRate: 0,
    needsProxy: false,
    proxyStatus: 'pending',
    proxyPath: null,
    proxyProgress: 0,
    thumbnailStatus: 'pending',
    thumbnailPath: null
  }
}

export function createClip(input: {
  mediaId: string
  trackId: string
  start: number
  duration: number
  sourceIn: number
  sourceOut: number
  linkedClipId?: string | null
}): Clip {
  return {
    id: createId('clip'),
    mediaId: input.mediaId,
    trackId: input.trackId,
    start: input.start,
    duration: input.duration,
    sourceIn: input.sourceIn,
    sourceOut: input.sourceOut,
    speed: 1,
    enabled: true,
    volume: 1,
    linkedClipId: input.linkedClipId ?? null
  }
}
