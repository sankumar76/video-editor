import { useRef, useState, type PointerEvent, type ReactElement } from 'react'
import { TICKS_PER_SECOND, clipEnd, pixelsToTicks, type Clip, type MediaItem } from '@core'
import styles from './ClipView.module.css'
import { EDGE_HANDLE_WIDTH } from './layout'

type DragPreview =
  | { kind: 'move'; deltaTicks: number }
  | { kind: 'trim-start'; ticks: number }
  | { kind: 'trim-end'; ticks: number }

interface ClipViewProps {
  clip: Clip
  media: MediaItem | undefined
  pixelsPerSecond: number
  isSelected: boolean
  locked: boolean
  onSelect: (clipId: string, mode: 'replace' | 'toggle') => void
  onCommitMove: (clipId: string, deltaTicks: number) => void
  onCommitTrim: (clipId: string, edge: 'start' | 'end', proposedTicks: number) => void
  computeSnappedMoveStart: (clipId: string, proposedStart: number) => number
}

export default function ClipView({
  clip,
  media,
  pixelsPerSecond,
  isSelected,
  locked,
  onSelect,
  onCommitMove,
  onCommitTrim,
  computeSnappedMoveStart
}: ClipViewProps): ReactElement {
  const [preview, setPreview] = useState<DragPreview | null>(null)
  const dragState = useRef<{ startClientX: number; startTicks: number } | null>(null)

  const toPx = (ticks: number): number => (ticks / TICKS_PER_SECOND) * pixelsPerSecond

  let left = toPx(clip.start)
  let width = toPx(clip.duration)
  if (preview?.kind === 'move') {
    left = toPx(clip.start + preview.deltaTicks)
  } else if (preview?.kind === 'trim-start') {
    const clamped = Math.min(preview.ticks, clipEnd(clip) - TICKS_PER_SECOND / 60)
    left = toPx(clamped)
    width = toPx(clipEnd(clip) - clamped)
  } else if (preview?.kind === 'trim-end') {
    const clamped = Math.max(preview.ticks, clip.start + TICKS_PER_SECOND / 60)
    width = toPx(clamped - clip.start)
  }

  function handleBodyPointerDown(event: PointerEvent<HTMLDivElement>): void {
    if (locked) return
    if (event.button !== 0) return
    onSelect(clip.id, event.shiftKey || event.metaKey || event.ctrlKey ? 'toggle' : 'replace')
    event.currentTarget.setPointerCapture(event.pointerId)
    dragState.current = { startClientX: event.clientX, startTicks: clip.start }
  }

  function handleBodyPointerMove(event: PointerEvent<HTMLDivElement>): void {
    if (!dragState.current) return
    const deltaPx = event.clientX - dragState.current.startClientX
    const deltaTicks = pixelsToTicks(deltaPx, pixelsPerSecond, TICKS_PER_SECOND)
    const proposedStart = Math.max(0, dragState.current.startTicks + deltaTicks)
    const snappedStart = computeSnappedMoveStart(clip.id, proposedStart)
    setPreview({ kind: 'move', deltaTicks: snappedStart - clip.start })
  }

  function handleBodyPointerUp(event: PointerEvent<HTMLDivElement>): void {
    if (!dragState.current) return
    dragState.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
    if (preview?.kind === 'move' && preview.deltaTicks !== 0) {
      onCommitMove(clip.id, preview.deltaTicks)
    }
    setPreview(null)
  }

  function handleEdgePointerDown(edge: 'start' | 'end', event: PointerEvent<HTMLDivElement>): void {
    if (locked) return
    event.stopPropagation()
    onSelect(clip.id, 'replace')
    event.currentTarget.setPointerCapture(event.pointerId)
    dragState.current = {
      startClientX: event.clientX,
      startTicks: edge === 'start' ? clip.start : clipEnd(clip)
    }
  }

  function handleEdgePointerMove(edge: 'start' | 'end', event: PointerEvent<HTMLDivElement>): void {
    if (!dragState.current) return
    const deltaPx = event.clientX - dragState.current.startClientX
    const deltaTicks = pixelsToTicks(deltaPx, pixelsPerSecond, TICKS_PER_SECOND)
    const proposed = dragState.current.startTicks + deltaTicks
    setPreview(
      edge === 'start'
        ? { kind: 'trim-start', ticks: proposed }
        : { kind: 'trim-end', ticks: proposed }
    )
  }

  function handleEdgePointerUp(edge: 'start' | 'end', event: PointerEvent<HTMLDivElement>): void {
    if (!dragState.current) return
    dragState.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
    if (preview && (preview.kind === 'trim-start' || preview.kind === 'trim-end')) {
      onCommitTrim(clip.id, edge, preview.ticks)
    }
    setPreview(null)
  }

  const kindClass =
    media?.type === 'audio' ? styles.clipAudio : media?.type === 'image' ? styles.clipImage : ''

  return (
    <div
      className={[
        styles.clip,
        kindClass,
        isSelected ? styles.clipSelected : '',
        !clip.enabled ? styles.clipDisabled : ''
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ left, width: Math.max(4, width) }}
      data-testid="timeline-clip"
      data-clip-id={clip.id}
      onPointerDown={handleBodyPointerDown}
      onPointerMove={handleBodyPointerMove}
      onPointerUp={handleBodyPointerUp}
    >
      <span className={styles.label}>{media?.fileName ?? 'Missing media'}</span>
      <div
        className={`${styles.edgeHandle} ${styles.edgeHandleLeft}`}
        style={{ width: EDGE_HANDLE_WIDTH }}
        onPointerDown={(e) => handleEdgePointerDown('start', e)}
        onPointerMove={(e) => handleEdgePointerMove('start', e)}
        onPointerUp={(e) => handleEdgePointerUp('start', e)}
      />
      <div
        className={`${styles.edgeHandle} ${styles.edgeHandleRight}`}
        style={{ width: EDGE_HANDLE_WIDTH }}
        onPointerDown={(e) => handleEdgePointerDown('end', e)}
        onPointerMove={(e) => handleEdgePointerMove('end', e)}
        onPointerUp={(e) => handleEdgePointerUp('end', e)}
      />
    </div>
  )
}
