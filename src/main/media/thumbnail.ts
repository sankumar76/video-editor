import { runFfmpeg } from './ffmpegRun'

export async function generateThumbnail(
  inputPath: string,
  outputPath: string,
  atSeconds: number
): Promise<void> {
  const seekArgs = atSeconds > 0 ? ['-ss', atSeconds.toFixed(3)] : []
  await runFfmpeg({
    args: ['-y', ...seekArgs, '-i', inputPath, '-frames:v', '1', '-vf', 'scale=320:-2', outputPath]
  })
}
