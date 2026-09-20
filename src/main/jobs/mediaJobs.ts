import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { secondsToTicks, needsProxyForPreview, type MediaItem, type MediaType } from '@core'
import { probeMedia } from '../media/probe'
import { generateThumbnail } from '../media/thumbnail'
import { generateProxy } from '../media/proxy'
import { cacheKeyFor } from '../media/cacheKey'
import { proxiesDir, thumbnailsDir } from '../paths'
import { ConcurrencyQueue } from './concurrencyQueue'

export interface MediaJobInput {
  mediaId: string
  filePath: string
  fileSize: number
  fileMtimeMs: number
  type: MediaType
}

export type MediaItemPatch = Partial<MediaItem>

/**
 * Runs probe -> thumbnail -> proxy (if needed) for each imported file, with limited
 * concurrency so a big batch import doesn't saturate the machine. Every stage reports
 * back as a partial MediaItem patch; these are metadata fills, not user edits, so they
 * deliberately bypass the undo/redo command history.
 */
export class MediaJobManager {
  private readonly queue = new ConcurrencyQueue(2)
  private readonly controllers = new Map<string, AbortController>()

  constructor(private readonly onPatch: (mediaId: string, patch: MediaItemPatch) => void) {}

  enqueue(input: MediaJobInput): void {
    const controller = new AbortController()
    this.controllers.set(input.mediaId, controller)
    this.queue.add(() => this.process(input, controller.signal))
  }

  cancel(mediaId: string): void {
    this.controllers.get(mediaId)?.abort()
  }

  private async process(input: MediaJobInput, signal: AbortSignal): Promise<void> {
    if (signal.aborted) return
    this.onPatch(input.mediaId, { probeStatus: 'probing' })

    let probe
    try {
      probe = await probeMedia(input.filePath)
    } catch (err) {
      this.onPatch(input.mediaId, {
        probeStatus: 'error',
        probeError: err instanceof Error ? err.message : String(err)
      })
      return
    }
    if (signal.aborted) return

    const isImage = input.type === 'image'
    const durationTicks = isImage ? 0 : secondsToTicks(probe.durationSeconds)
    const ext = path.extname(input.filePath)
    const needsProxy =
      !isImage &&
      needsProxyForPreview({
        containerExtension: ext,
        videoCodec: probe.videoCodec,
        audioCodec: probe.audioCodec
      })

    this.onPatch(input.mediaId, {
      probeStatus: 'ready',
      probeError: null,
      duration: durationTicks,
      width: probe.width,
      height: probe.height,
      rotation: probe.rotation,
      frameRate: probe.frameRate,
      isVariableFrameRate: probe.isVariableFrameRate,
      videoCodec: probe.videoCodec,
      hasAudio: probe.hasAudio,
      audioCodec: probe.audioCodec,
      audioChannels: probe.audioChannels,
      audioSampleRate: probe.audioSampleRate,
      needsProxy
    })

    const cacheKey = cacheKeyFor(input.filePath, input.fileSize, input.fileMtimeMs)

    if (input.type !== 'audio') {
      await this.runThumbnail(input, cacheKey, Math.min(1, probe.durationSeconds * 0.1), signal)
    }

    if (needsProxy) {
      await this.runProxy(input, cacheKey, probe.durationSeconds, signal)
    }
  }

  private async runThumbnail(
    input: MediaJobInput,
    cacheKey: string,
    atSeconds: number,
    signal: AbortSignal
  ): Promise<void> {
    this.onPatch(input.mediaId, { thumbnailStatus: 'probing' })
    try {
      await mkdir(thumbnailsDir(), { recursive: true })
      const outputPath = path.join(thumbnailsDir(), `${cacheKey}.jpg`)
      await generateThumbnail(input.filePath, outputPath, atSeconds)
      if (signal.aborted) return
      this.onPatch(input.mediaId, { thumbnailStatus: 'ready', thumbnailPath: outputPath })
    } catch (err) {
      if (signal.aborted) return
      this.onPatch(input.mediaId, { thumbnailStatus: 'error' })
      void err
    }
  }

  private async runProxy(
    input: MediaJobInput,
    cacheKey: string,
    durationSeconds: number,
    signal: AbortSignal
  ): Promise<void> {
    this.onPatch(input.mediaId, { proxyStatus: 'probing', proxyProgress: 0 })
    try {
      await mkdir(proxiesDir(), { recursive: true })
      const outputPath = path.join(proxiesDir(), `${cacheKey}.mp4`)
      await generateProxy({
        inputPath: input.filePath,
        outputPath,
        durationSeconds,
        signal,
        onProgress: (fraction) => this.onPatch(input.mediaId, { proxyProgress: fraction })
      })
      if (signal.aborted) return
      this.onPatch(input.mediaId, { proxyStatus: 'ready', proxyPath: outputPath, proxyProgress: 1 })
    } catch (err) {
      if (signal.aborted) return
      this.onPatch(input.mediaId, { proxyStatus: 'error' })
      void err
    }
  }
}
