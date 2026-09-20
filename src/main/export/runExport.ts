import { mkdtemp, rename, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { buildFilterGraph, type ExportSettings, type Project } from '@core'
import { FfmpegCancelledError, runFfmpeg } from '../media/ffmpegRun'

export interface RunExportOptions {
  project: Project
  sequenceId: string
  settings: ExportSettings
  outputPath: string
  onProgress?: (fraction: number) => void
  signal?: AbortSignal
}

/**
 * Builds the filter graph via the shared core function, writes it to a temp
 * `-filter_complex_script` file (spec section 8: avoids Windows command-line length
 * limits), and runs ffmpeg against a temp output that's renamed into place only on
 * success — partials are deleted on cancel or failure.
 */
export async function runExport(options: RunExportOptions): Promise<void> {
  const graph = buildFilterGraph(options.project, options.sequenceId, options.settings)

  const scriptDir = await mkdtemp(path.join(tmpdir(), 'cutline-export-'))
  const scriptPath = path.join(scriptDir, 'filter_complex.txt')
  await writeFile(scriptPath, graph.filterComplexScript, 'utf-8')

  const tempOutputPath = `${options.outputPath}.partial.mp4`

  const args: string[] = []
  for (const input of graph.inputs) {
    // -loop 1 turns a still image into an indefinite video stream so the same
    // trim/setpts pipeline used for real video clips works unchanged for images.
    if (input.isImage) args.push('-loop', '1')
    args.push('-i', input.path)
  }
  args.push('-filter_complex_script', scriptPath)
  args.push('-map', `[${graph.videoOutputLabel}]`, '-map', `[${graph.audioOutputLabel}]`)
  args.push('-r', String(options.settings.frameRate), '-c:v', 'libx264', '-pix_fmt', 'yuv420p')
  if (options.settings.videoBitrateKbps) {
    args.push('-b:v', `${options.settings.videoBitrateKbps}k`)
  } else {
    args.push('-crf', String(options.settings.crf ?? 20))
  }
  args.push(
    '-preset',
    'medium',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-ar',
    String(options.settings.sampleRate),
    '-movflags',
    '+faststart',
    '-progress',
    'pipe:1',
    '-nostats',
    '-y',
    tempOutputPath
  )

  try {
    await runFfmpeg({
      args,
      totalDurationSeconds: graph.durationSeconds,
      onProgress: options.onProgress,
      signal: options.signal
    })
    await rename(tempOutputPath, options.outputPath)
  } catch (err) {
    await unlink(tempOutputPath).catch(() => undefined)
    throw err
  } finally {
    await unlink(scriptPath).catch(() => undefined)
  }
}

export { FfmpegCancelledError }
