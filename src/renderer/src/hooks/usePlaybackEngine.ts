import { useEffect, useRef, useState, type RefObject } from 'react'
import {
  TICKS_PER_SECOND,
  clipEnd,
  pathToFileUrl,
  sequenceDuration,
  ticksToSeconds,
  type Project,
  type Sequence,
  type Track
} from '@core'
import { activeSequence, useProjectStore } from '../store/projectStore'

type ManagedKind = 'video' | 'image' | 'audio'

interface ManagedElement {
  el: HTMLVideoElement | HTMLImageElement | HTMLAudioElement
  kind: ManagedKind
  srcUrl: string
}

function computeFitRect(
  mediaWidth: number,
  mediaHeight: number,
  canvasWidth: number,
  canvasHeight: number
): { x: number; y: number; w: number; h: number } {
  if (mediaWidth <= 0 || mediaHeight <= 0) return { x: 0, y: 0, w: canvasWidth, h: canvasHeight }
  const scale = Math.min(canvasWidth / mediaWidth, canvasHeight / mediaHeight)
  const w = mediaWidth * scale
  const h = mediaHeight * scale
  return { x: (canvasWidth - w) / 2, y: (canvasHeight - h) / 2, w, h }
}

function isTrackAudible(track: Track, anySoloed: boolean): boolean {
  if (track.muted) return false
  return anySoloed ? track.solo : true
}

export interface PlaybackEngine {
  isPlaying: boolean
  play: () => void
  playReverse: () => void
  pause: () => void
  stepFrame: (direction: 1 | -1) => void
  toggle: () => void
}

/** Drives the preview canvas: manages per-clip media elements, playback clock, and drawing. */
export function usePlaybackEngine(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  loopRef: RefObject<boolean>
): PlaybackEngine {
  const elementsRef = useRef<Map<string, ManagedElement>>(new Map())
  const [isPlaying, setIsPlayingState] = useState(false)
  const isPlayingRef = useRef(false)
  const directionRef = useRef<1 | -1>(1)
  const rafRef = useRef<number>(0)
  const lastTimestampRef = useRef<number | null>(null)

  const setIsPlaying = (value: boolean): void => {
    isPlayingRef.current = value
    setIsPlayingState(value)
  }

  // Keep the media-element pool in sync with the active sequence's clips.
  useEffect(() => {
    const sync = (project: Project): void => {
      const sequence = activeSequence(project)
      const mediaById = new Map(project.media.map((m) => [m.id, m]))
      const needed = new Set<string>()

      for (const clip of sequence.clips) {
        const media = mediaById.get(clip.mediaId)
        if (!media || media.type === 'audio') continue
        if (media.type === 'video') {
          const srcPath = media.needsProxy
            ? media.proxyStatus === 'ready'
              ? media.proxyPath
              : null
            : media.originalPath
          if (!srcPath) continue
          needed.add(clip.id)
          const srcUrl = pathToFileUrl(srcPath)
          const existing = elementsRef.current.get(clip.id)
          if (existing?.srcUrl === srcUrl) continue
          const video = document.createElement('video')
          video.src = srcUrl
          video.preload = 'auto'
          video.playsInline = true
          elementsRef.current.set(clip.id, { el: video, kind: 'video', srcUrl })
        } else if (media.type === 'image') {
          needed.add(clip.id)
          const srcUrl = pathToFileUrl(media.originalPath)
          const existing = elementsRef.current.get(clip.id)
          if (existing?.srcUrl === srcUrl) continue
          const img = new Image()
          img.src = srcUrl
          elementsRef.current.set(clip.id, { el: img, kind: 'image', srcUrl })
        }
      }

      // Pure-audio clips also need a playable element so their sound is heard.
      for (const clip of sequence.clips) {
        const media = mediaById.get(clip.mediaId)
        if (media?.type !== 'audio') continue
        needed.add(clip.id)
        const srcUrl = pathToFileUrl(media.originalPath)
        const existing = elementsRef.current.get(clip.id)
        if (existing?.srcUrl === srcUrl) continue
        const audio = document.createElement('audio')
        audio.src = srcUrl
        audio.preload = 'auto'
        elementsRef.current.set(clip.id, { el: audio, kind: 'audio', srcUrl })
      }

      for (const [clipId, entry] of elementsRef.current) {
        if (needed.has(clipId)) continue
        if (entry.kind !== 'image') (entry.el as HTMLMediaElement).pause()
        elementsRef.current.delete(clipId)
      }
    }

    sync(useProjectStore.getState().project)
    const unsubscribe = useProjectStore.subscribe((state) => sync(state.project))
    return unsubscribe
  }, [])

  function draw(project: Project, sequence: Sequence, playheadTicks: number): void {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = project.backgroundColor
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const mediaById = new Map(project.media.map((m) => [m.id, m]))
    const videoTracks = sequence.tracks
      .filter((t) => t.type === 'video' && !t.hidden)
      .sort((a, b) => a.index - b.index)

    for (const track of videoTracks) {
      const clip = sequence.clips.find(
        (c) =>
          c.trackId === track.id &&
          c.enabled &&
          c.start <= playheadTicks &&
          playheadTicks < clipEnd(c)
      )
      if (!clip) continue
      const entry = elementsRef.current.get(clip.id)
      const media = mediaById.get(clip.mediaId)
      if (!entry || !media) continue
      const rect = computeFitRect(media.width, media.height, canvas.width, canvas.height)
      try {
        ctx.drawImage(entry.el as CanvasImageSource, rect.x, rect.y, rect.w, rect.h)
      } catch {
        // Element not decoded yet; skip this frame.
      }
    }
  }

  function syncElementPlayback(project: Project, sequence: Sequence, playheadTicks: number): void {
    const mediaById = new Map(project.media.map((m) => [m.id, m]))
    const trackById = new Map(sequence.tracks.map((t) => [t.id, t]))
    const anySoloed = sequence.tracks.some((t) => t.solo)

    const activeClipIds = new Set<string>()
    for (const track of sequence.tracks) {
      const clip = sequence.clips.find(
        (c) =>
          c.trackId === track.id &&
          c.enabled &&
          c.start <= playheadTicks &&
          playheadTicks < clipEnd(c)
      )
      if (clip) activeClipIds.add(clip.id)
    }

    for (const [clipId, entry] of elementsRef.current) {
      if (entry.kind === 'image') continue
      const clip = sequence.clips.find((c) => c.id === clipId)
      const track = clip ? trackById.get(clip.trackId) : undefined
      const media = clip ? mediaById.get(clip.mediaId) : undefined
      const mediaEl = entry.el as HTMLVideoElement | HTMLAudioElement

      if (!clip || !track || !media || !activeClipIds.has(clipId)) {
        if (!mediaEl.paused) mediaEl.pause()
        continue
      }

      const expectedSourceSeconds = ticksToSeconds(clip.sourceIn + (playheadTicks - clip.start))
      const drift = Math.abs(mediaEl.currentTime - expectedSourceSeconds)
      if (drift > 0.12 || mediaEl.readyState < 2) {
        try {
          // These <video>/<audio> elements are created via document.createElement and
          // never rendered by React — they're an imperative playback layer the
          // compiler's ref-immutability analysis doesn't model, so mutating them here
          // (via a ref) is the intended pattern, not an accidental effect side-channel.
          // eslint-disable-next-line react-hooks/immutability
          mediaEl.currentTime = Math.max(0, expectedSourceSeconds)
        } catch {
          // Not seekable yet.
        }
      }
      mediaEl.muted = !isTrackAudible(track, anySoloed)
      mediaEl.volume = Math.min(1, Math.max(0, clip.volume))

      if (isPlayingRef.current && directionRef.current === 1) {
        if (mediaEl.paused) void mediaEl.play().catch(() => undefined)
      } else if (!mediaEl.paused) {
        mediaEl.pause()
      }
    }
  }

  useEffect(() => {
    function tick(timestamp: number): void {
      const previous = lastTimestampRef.current
      lastTimestampRef.current = timestamp
      const elapsedMs = previous === null ? 0 : timestamp - previous

      const store = useProjectStore.getState()
      const sequence = activeSequence(store.project)
      const maxTicks = sequenceDuration(sequence)

      let playhead = store.playheadTicks
      if (isPlayingRef.current) {
        playhead += directionRef.current * (elapsedMs / 1000) * TICKS_PER_SECOND
        if (playhead >= maxTicks) {
          if (loopRef.current && directionRef.current === 1) {
            playhead = 0
          } else {
            playhead = maxTicks
            setIsPlaying(false)
          }
        } else if (playhead <= 0) {
          playhead = 0
          setIsPlaying(false)
        }
        store.setPlayhead(playhead)
      }

      syncElementPlayback(store.project, sequence, playhead)
      draw(store.project, sequence, playhead)

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reads live state via getState() by design
  }, [])

  return {
    isPlaying,
    play: () => {
      directionRef.current = 1
      setIsPlaying(true)
    },
    playReverse: () => {
      directionRef.current = -1
      setIsPlaying(true)
    },
    pause: () => setIsPlaying(false),
    toggle: () => {
      if (isPlayingRef.current) {
        setIsPlaying(false)
      } else {
        directionRef.current = 1
        setIsPlaying(true)
      }
    },
    stepFrame: (direction) => {
      setIsPlaying(false)
      const store = useProjectStore.getState()
      const project = store.project
      const fps = project.frameRate || 30
      const stepTicks = Math.round(TICKS_PER_SECOND / fps)
      const sequence = activeSequence(project)
      const maxTicks = sequenceDuration(sequence)
      const next = Math.min(maxTicks, Math.max(0, store.playheadTicks + direction * stepTicks))
      store.setPlayhead(next)
    }
  }
}
