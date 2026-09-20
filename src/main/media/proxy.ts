import { runFfmpeg } from './ffmpegRun'

export interface GenerateProxyOptions {
  inputPath: string
  outputPath: string
  durationSeconds: number
  onProgress?: (fraction: number) => void
  signal?: AbortSignal
}

/** H.264 + AAC, capped at 720p, constant 30fps — preview-only (spec section 2). */
export async function generateProxy(options: GenerateProxyOptions): Promise<void> {
  await runFfmpeg({
    args: [
      '-y',
      '-i',
      options.inputPath,
      '-vf',
      "scale=-2:'min(720,ih)'",
      '-r',
      '30',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '20',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-movflags',
      '+faststart',
      '-progress',
      'pipe:1',
      '-nostats',
      options.outputPath
    ],
    totalDurationSeconds: options.durationSeconds,
    onProgress: options.onProgress,
    signal: options.signal
  })
}
