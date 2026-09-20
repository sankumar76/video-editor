import { spawn } from 'node:child_process'
import { getFfprobePath } from '../ffmpeg'

interface FfprobeStream {
  codec_type?: string
  codec_name?: string
  width?: number
  height?: number
  r_frame_rate?: string
  avg_frame_rate?: string
  channels?: number
  sample_rate?: string
  duration?: string
  tags?: Record<string, string>
  side_data_list?: Array<{ side_data_type?: string; rotation?: number }>
}

interface FfprobeOutput {
  streams?: FfprobeStream[]
  format?: { duration?: string }
}

export interface ProbeResult {
  durationSeconds: number
  width: number
  height: number
  rotation: number
  frameRate: number
  isVariableFrameRate: boolean
  videoCodec: string | null
  hasAudio: boolean
  audioCodec: string | null
  audioChannels: number
  audioSampleRate: number
}

function parseFraction(value: string | undefined): number {
  if (!value) return 0
  const [num, den] = value.split('/').map(Number)
  if (!num || !den) return 0
  return num / den
}

function normalizeRotation(degrees: number): number {
  const normalized = ((Math.round(degrees / 90) * 90) % 360) + (degrees < 0 ? 0 : 0)
  return ((normalized % 360) + 360) % 360
}

function readRotation(stream: FfprobeStream): number {
  const matrix = stream.side_data_list?.find((sd) => sd.side_data_type === 'Display Matrix')
  if (matrix && typeof matrix.rotation === 'number') {
    return normalizeRotation(-matrix.rotation)
  }
  const tagRotate = stream.tags?.['rotate']
  if (tagRotate) return normalizeRotation(Number(tagRotate))
  return 0
}

export function probeMedia(filePath: string): Promise<ProbeResult> {
  return new Promise((resolvePromise, reject) => {
    const args = ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filePath]
    const child = spawn(getFfprobePath(), args, { windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()))
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()))
    child.on('error', (err) => reject(err))
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `ffprobe exited with code ${code ?? 'unknown'}`))
        return
      }
      try {
        const data = JSON.parse(stdout) as FfprobeOutput
        const videoStream = data.streams?.find((s) => s.codec_type === 'video')
        const audioStream = data.streams?.find((s) => s.codec_type === 'audio')
        const durationSeconds = Number(data.format?.duration ?? videoStream?.duration ?? 0)
        const rFrameRate = parseFraction(videoStream?.r_frame_rate)
        const avgFrameRate = parseFraction(videoStream?.avg_frame_rate)

        resolvePromise({
          durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : 0,
          width: videoStream?.width ?? 0,
          height: videoStream?.height ?? 0,
          rotation: videoStream ? readRotation(videoStream) : 0,
          frameRate: rFrameRate || avgFrameRate || 0,
          isVariableFrameRate: Math.abs(rFrameRate - avgFrameRate) > 0.01,
          videoCodec: videoStream?.codec_name ?? null,
          hasAudio: Boolean(audioStream),
          audioCodec: audioStream?.codec_name ?? null,
          audioChannels: audioStream?.channels ?? 0,
          audioSampleRate: Number(audioStream?.sample_rate ?? 0)
        })
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    })
  })
}
