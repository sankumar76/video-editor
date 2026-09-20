import { spawn } from 'node:child_process'
import { getFfmpegPath } from '../ffmpeg'

export interface RunFfmpegOptions {
  args: string[]
  /** Used with `-progress pipe:1` output (out_time_ms) to compute a 0..1 fraction. */
  totalDurationSeconds?: number
  onProgress?: (fraction: number) => void
  signal?: AbortSignal
}

export class FfmpegCancelledError extends Error {
  constructor() {
    super('Cancelled')
    this.name = 'FfmpegCancelledError'
  }
}

/** Runs ffmpeg with `-progress pipe:1` already appended by the caller's args, reporting fractional progress. */
export function runFfmpeg({
  args,
  totalDurationSeconds,
  onProgress,
  signal
}: RunFfmpegOptions): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    if (signal?.aborted) {
      reject(new FfmpegCancelledError())
      return
    }

    const child = spawn(getFfmpegPath(), args, { windowsHide: true })
    let stderrTail = ''
    let stdoutBuffer = ''
    let cancelled = false

    const onAbort = (): void => {
      cancelled = true
      child.kill()
    }
    signal?.addEventListener('abort', onAbort)

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBuffer += chunk.toString()
      const lines = stdoutBuffer.split('\n')
      stdoutBuffer = lines.pop() ?? ''
      for (const line of lines) {
        const [key, value] = line.split('=')
        if (key === 'out_time_ms' && totalDurationSeconds && totalDurationSeconds > 0) {
          const outSeconds = Number(value) / 1_000_000
          onProgress?.(Math.min(1, Math.max(0, outSeconds / totalDurationSeconds)))
        }
        if (key === 'progress' && value?.trim() === 'end') {
          onProgress?.(1)
        }
      }
    })

    child.stderr.on('data', (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-4000)
    })

    child.on('error', (err) => {
      signal?.removeEventListener('abort', onAbort)
      reject(err)
    })

    child.on('close', (code) => {
      signal?.removeEventListener('abort', onAbort)
      if (cancelled) {
        reject(new FfmpegCancelledError())
      } else if (code === 0) {
        resolvePromise()
      } else {
        reject(new Error(stderrTail.trim() || `ffmpeg exited with code ${code ?? 'unknown'}`))
      }
    })
  })
}
