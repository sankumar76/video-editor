import { app } from 'electron'
import { spawn } from 'node:child_process'
import path from 'node:path'
import type { BinaryDiagnostic } from '@core'

function resolveBinaryPath(devParts: string[], packagedParts: string[]): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, ...packagedParts)
    : path.join(app.getAppPath(), ...devParts)
}

/** Dev resolves from node_modules; packaged builds resolve from extraResources (see electron-builder.yml). */
export function getFfmpegPath(): string {
  return resolveBinaryPath(
    ['node_modules', 'ffmpeg-static', 'ffmpeg.exe'],
    ['ffmpeg', 'ffmpeg.exe']
  )
}

export function getFfprobePath(): string {
  return resolveBinaryPath(
    ['node_modules', 'ffprobe-static', 'bin', 'win32', 'x64', 'ffprobe.exe'],
    ['ffmpeg', 'ffprobe.exe']
  )
}

function runVersionCheck(binaryPath: string): Promise<BinaryDiagnostic> {
  return new Promise((resolvePromise) => {
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(binaryPath, ['-version'], { windowsHide: true })
    } catch (err) {
      resolvePromise({ ok: false, path: binaryPath, error: (err as Error).message })
      return
    }

    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk: Buffer) => (stdout += chunk.toString()))
    child.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString()))

    child.on('error', (err) => {
      resolvePromise({ ok: false, path: binaryPath, error: err.message })
    })

    child.on('close', (code) => {
      if (code === 0 && stdout.length > 0) {
        const firstLine = stdout.split(/\r?\n/, 1)[0] ?? ''
        resolvePromise({ ok: true, path: binaryPath, version: firstLine.trim() })
      } else {
        resolvePromise({
          ok: false,
          path: binaryPath,
          error: stderr.trim() || `Exited with code ${code ?? 'unknown'}`
        })
      }
    })
  })
}

export function getFfmpegDiagnostics(): Promise<BinaryDiagnostic> {
  return runVersionCheck(getFfmpegPath())
}

export function getFfprobeDiagnostics(): Promise<BinaryDiagnostic> {
  return runVersionCheck(getFfprobePath())
}
