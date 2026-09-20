export interface BinaryDiagnostic {
  ok: boolean
  path: string
  version?: string
  error?: string
}

export interface AppDiagnostics {
  app: { name: string; version: string }
  runtime: { electron: string; chrome: string; node: string }
  ffmpeg: BinaryDiagnostic
  ffprobe: BinaryDiagnostic
}
