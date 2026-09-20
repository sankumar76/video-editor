import { useMemo, useRef, useState, type PointerEvent, type ReactElement } from 'react'
import {
  TICKS_PER_SECOND,
  clipEnd,
  collectSnapTargets,
  pixelsToTicks,
  removeTrack,
  secondsToTicks,
  sequenceDuration,
  setTrackFlags,
  snapTime,
  ticksToPixels,
  type Track
} from '@core'
import { activeSequence, useProjectStore } from '../../store/projectStore'
import {
  dropMediaOnTimeline,
  moveClipsWithCollisionCheck,
  trimClipEdge
} from '../../editing/actions'
import TimelineRuler from './TimelineRuler'
import TrackRow from './TrackRow'
import { HEADER_WIDTH, MIN_CONTENT_WIDTH, RULER_HEIGHT, TRAILING_PADDING_SECONDS } from './layout'
import styles from './TimelineTracks.module.css'

const SNAP_THRESHOLD_PX = 8

export default function TimelineTracks(): ReactElement {
  const project = useProjectStore((s) => s.project)
  const applyEdit = useProjectStore((s) => s.applyEdit)
  const selectedClipIds = useProjectStore((s) => s.selectedClipIds)
  const selectClips = useProjectStore((s) => s.selectClips)
  const clearSelection = useProjectStore((s) => s.clearSelection)
  const playheadTicks = useProjectStore((s) => s.playheadTicks)
  const setPlayhead = useProjectStore((s) => s.setPlayhead)
  const pixelsPerSecond = useProjectStore((s) => s.pixelsPerSecond)
  const snappingEnabled = useProjectStore((s) => s.snappingEnabled)

  const sequence = activeSequence(project)
  const mediaById = useMemo(() => new Map(project.media.map((m) => [m.id, m])), [project.media])

  const orderedTracks = useMemo(() => {
    const video = sequence.tracks
      .filter((t) => t.type === 'video')
      .sort((a, b) => b.index - a.index)
    const audio = sequence.tracks
      .filter((t) => t.type === 'audio')
      .sort((a, b) => a.index - b.index)
    return [...video, ...audio]
  }, [sequence.tracks])

  const trackTops = useMemo(() => {
    let top = RULER_HEIGHT
    const map = new Map<string, { top: number; height: number }>()
    for (const track of orderedTracks) {
      map.set(track.id, { top, height: track.height })
      top += track.height
    }
    return map
  }, [orderedTracks])

  const contentWidth = Math.max(
    MIN_CONTENT_WIDTH,
    ticksToPixels(
      sequenceDuration(sequence) + secondsToTicks(TRAILING_PADDING_SECONDS),
      pixelsPerSecond,
      TICKS_PER_SECOND
    )
  )

  const contentRef = useRef<HTMLDivElement>(null)
  const marqueeStateRef = useRef<{ x0: number; y0: number } | null>(null)
  const [marqueeRect, setMarqueeRect] = useState<{
    x: number
    y: number
    w: number
    h: number
  } | null>(null)

  function computeSnappedMoveStart(clipId: string, proposedStart: number): number {
    if (!snappingEnabled) return proposedStart
    const clip = sequence.clips.find((c) => c.id === clipId)
    if (!clip) return proposedStart
    const track = sequence.tracks.find((t) => t.id === clip.trackId)
    if (!track) return proposedStart
    const excludeIds = new Set([clip.id, clip.linkedClipId].filter((x): x is string => Boolean(x)))
    const targets = collectSnapTargets(sequence, track.type, excludeIds, playheadTicks)
    // Snap both the leading and trailing edge of the dragged clip against targets.
    const thresholdTicks = pixelsToTicks(SNAP_THRESHOLD_PX, pixelsPerSecond, TICKS_PER_SECOND)
    const snappedStart = snapTime(proposedStart, targets, thresholdTicks)
    if (snappedStart !== proposedStart) return snappedStart
    const proposedEnd = proposedStart + clip.duration
    const snappedEnd = snapTime(proposedEnd, targets, thresholdTicks)
    return snappedEnd !== proposedEnd ? proposedStart + (snappedEnd - proposedEnd) : proposedStart
  }

  function handleCommitMove(clipId: string, deltaTicks: number): void {
    const clip = sequence.clips.find((c) => c.id === clipId)
    if (!clip) return
    const ids = [clip.id, ...(clip.linkedClipId ? [clip.linkedClipId] : [])]
    const moves = ids
      .map((id) => sequence.clips.find((c) => c.id === id))
      .filter((c): c is NonNullable<typeof c> => Boolean(c))
      .map((c) => ({ clipId: c.id, start: Math.max(0, c.start + deltaTicks), trackId: c.trackId }))
    moveClipsWithCollisionCheck(moves)
  }

  function handleCommitTrim(clipId: string, edge: 'start' | 'end', proposedTicks: number): void {
    trimClipEdge(clipId, edge, proposedTicks)
  }

  function handleToggleFlag(trackId: string, flag: 'locked' | 'muted' | 'solo' | 'hidden'): void {
    const track = sequence.tracks.find((t) => t.id === trackId)
    if (!track) return
    applyEdit('Track Settings', (p) =>
      setTrackFlags(p, sequence.id, trackId, { [flag]: !track[flag] })
    )
  }

  function handleRename(trackId: string, name: string): void {
    applyEdit('Rename Track', (p) => setTrackFlags(p, sequence.id, trackId, { name }))
  }

  function handleRemoveTrack(trackId: string): void {
    if (!window.confirm('Remove this track and its clips?')) return
    applyEdit('Remove Track', (p) => removeTrack(p, sequence.id, trackId))
  }

  function handleDropMedia(trackId: string, mediaId: string, ticks: number): void {
    dropMediaOnTimeline(mediaId, trackId, ticks)
  }

  function handleSelectClip(clipId: string, mode: 'replace' | 'toggle'): void {
    selectClips([clipId], mode)
  }

  function handleAreaPointerDown(_trackId: string, event: PointerEvent<HTMLDivElement>): void {
    const contentRect = contentRef.current?.getBoundingClientRect()
    if (!contentRect) return
    const x = event.clientX - contentRect.left
    const y = event.clientY - contentRect.top
    marqueeStateRef.current = { x0: x, y0: y }
    setMarqueeRect({ x, y, w: 0, h: 0 })
    if (!event.shiftKey) clearSelection()
  }

  function handleContentPointerMove(event: PointerEvent<HTMLDivElement>): void {
    if (!marqueeStateRef.current) return
    const contentRect = contentRef.current?.getBoundingClientRect()
    if (!contentRect) return
    const x = event.clientX - contentRect.left
    const y = event.clientY - contentRect.top
    const { x0, y0 } = marqueeStateRef.current
    setMarqueeRect({
      x: Math.min(x0, x),
      y: Math.min(y0, y),
      w: Math.abs(x - x0),
      h: Math.abs(y - y0)
    })
  }

  function handleContentPointerUp(): void {
    if (!marqueeStateRef.current || !marqueeRect) {
      marqueeStateRef.current = null
      setMarqueeRect(null)
      return
    }
    const left = marqueeRect.x - HEADER_WIDTH
    const right = left + marqueeRect.w
    const top = marqueeRect.y
    const bottom = top + marqueeRect.h

    const hits: string[] = []
    for (const track of orderedTracks) {
      const pos = trackTops.get(track.id)
      if (!pos) continue
      if (pos.top + pos.height < top || pos.top > bottom) continue
      for (const clip of sequence.clips.filter((c) => c.trackId === track.id)) {
        const clipLeft = ticksToPixels(clip.start, pixelsPerSecond, TICKS_PER_SECOND)
        const clipRight = ticksToPixels(clipEnd(clip), pixelsPerSecond, TICKS_PER_SECOND)
        if (clipRight < left || clipLeft > right) continue
        hits.push(clip.id)
      }
    }
    if (hits.length > 0) selectClips(hits, 'add')
    marqueeStateRef.current = null
    setMarqueeRect(null)
  }

  return (
    <div
      className={styles.scrollContainer}
      onPointerMove={handleContentPointerMove}
      onPointerUp={handleContentPointerUp}
    >
      <div
        ref={contentRef}
        className={styles.grid}
        style={{ gridTemplateColumns: `${HEADER_WIDTH}px ${contentWidth}px` }}
      >
        <div className={styles.corner} style={{ height: RULER_HEIGHT }} />
        <div className={styles.rulerCell}>
          <TimelineRuler contentWidth={contentWidth} onScrub={setPlayhead} />
        </div>

        {orderedTracks.map((track: Track) => (
          <TrackRow
            key={track.id}
            track={track}
            clips={sequence.clips.filter((c) => c.trackId === track.id)}
            mediaById={mediaById}
            contentWidth={contentWidth}
            pixelsPerSecond={pixelsPerSecond}
            selectedClipIds={selectedClipIds}
            onSelectClip={handleSelectClip}
            onCommitMove={handleCommitMove}
            onCommitTrim={handleCommitTrim}
            computeSnappedMoveStart={computeSnappedMoveStart}
            onToggleFlag={handleToggleFlag}
            onRename={handleRename}
            onRemove={handleRemoveTrack}
            onAreaPointerDown={handleAreaPointerDown}
            onDropMedia={handleDropMedia}
          />
        ))}

        <div
          className={styles.playhead}
          style={{
            left: HEADER_WIDTH + ticksToPixels(playheadTicks, pixelsPerSecond, TICKS_PER_SECOND)
          }}
        >
          <div className={styles.playheadHandle} />
        </div>

        {marqueeRect && (
          <div
            className={styles.marquee}
            style={{
              left: marqueeRect.x,
              top: marqueeRect.y,
              width: marqueeRect.w,
              height: marqueeRect.h
            }}
          />
        )}
      </div>
    </div>
  )
}
