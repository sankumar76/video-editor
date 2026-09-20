/**
 * Whether Chromium (the preview renderer) can reliably play a file directly, or whether
 * an H.264+AAC proxy must be generated for preview (spec section 2). Conservative
 * allowlist on purpose: a false negative just costs an unnecessary proxy; a false
 * positive means a clip silently fails to preview.
 */
const SAFE_CONTAINERS = new Set(['mp4', 'mov', 'm4v', 'webm', 'ogg'])
const SAFE_VIDEO_CODECS = new Set(['h264', 'vp8', 'vp9', 'av1'])
const SAFE_AUDIO_CODECS = new Set(['aac', 'mp3', 'opus', 'vorbis', 'flac'])

export interface CodecSupportInput {
  containerExtension: string
  videoCodec: string | null
  audioCodec: string | null
}

export function needsProxyForPreview(input: CodecSupportInput): boolean {
  const container = input.containerExtension.replace(/^\./, '').toLowerCase()
  if (!SAFE_CONTAINERS.has(container)) return true
  if (input.videoCodec && !SAFE_VIDEO_CODECS.has(input.videoCodec.toLowerCase())) return true
  if (input.audioCodec && !SAFE_AUDIO_CODECS.has(input.audioCodec.toLowerCase())) return true
  return false
}
