import type { DragEvent, PointerEvent, ReactElement } from 'react'
import { TICKS_PER_SECOND, pixelsToTicks, type Clip, type MediaItem, type Track } from '@core'
import ClipView from './ClipView'
import { MEDIA_DRAG_MIME } from '../MediaBinPanel'
import styles from './TrackRow.module.css'

interface TrackRowProps {
  track: Track
  clips: Clip[]
  mediaById: Map<string, MediaItem>
  contentWidth: number
  pixelsPerSecond: number
  selectedClipIds: string[]
  onSelectClip: (clipId: string, mode: 'replace' | 'toggle') => void
  onCommitMove: (clipId: string, deltaTicks: number) => void
  onCommitTrim: (clipId: string, edge: 'start' | 'end', proposedTicks: number) => void
  computeSnappedMoveStart: (clipId: string, proposedStart: number) => number
  onToggleFlag: (trackId: string, flag: 'locked' | 'muted' | 'solo' | 'hidden') => void
  onRename: (trackId: string, name: string) => void
  onRemove: (trackId: string) => void
  onAreaPointerDown: (trackId: string, event: PointerEvent<HTMLDivElement>) => void
  onDropMedia: (trackId: string, mediaId: string, ticks: number) => void
}

export default function TrackRow({
  track,
  clips,
  mediaById,
  contentWidth,
  pixelsPerSecond,
  selectedClipIds,
  onSelectClip,
  onCommitMove,
  onCommitTrim,
  computeSnappedMoveStart,
  onToggleFlag,
  onRename,
  onRemove,
  onAreaPointerDown,
  onDropMedia
}: TrackRowProps): ReactElement {
  function handleDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault()
    const mediaId = event.dataTransfer.getData(MEDIA_DRAG_MIME)
    if (!mediaId) return
    const rect = event.currentTarget.getBoundingClientRect()
    const ticks = pixelsToTicks(event.clientX - rect.left, pixelsPerSecond, TICKS_PER_SECOND)
    onDropMedia(track.id, mediaId, Math.max(0, ticks))
  }

  return (
    <>
      <div className={styles.header} style={{ height: track.height }}>
        <span
          className={styles.name}
          title="Double-click to rename"
          onDoubleClick={() => {
            const next = window.prompt('Track name', track.name)
            if (next) onRename(track.id, next)
          }}
        >
          {track.name}
        </span>
        <button
          type="button"
          className={`${styles.toggle} ${track.locked ? styles.toggleActive : ''}`}
          title="Lock track"
          onClick={() => onToggleFlag(track.id, 'locked')}
        >
          🔒
        </button>
        <button
          type="button"
          className={`${styles.toggle} ${track.muted ? styles.toggleActive : ''}`}
          title="Mute track"
          onClick={() => onToggleFlag(track.id, 'muted')}
        >
          M
        </button>
        <button
          type="button"
          className={`${styles.toggle} ${track.solo ? styles.toggleActive : ''}`}
          title="Solo track"
          onClick={() => onToggleFlag(track.id, 'solo')}
        >
          S
        </button>
        {track.type === 'video' && (
          <button
            type="button"
            className={`${styles.toggle} ${track.hidden ? styles.toggleActive : ''}`}
            title="Hide track"
            onClick={() => onToggleFlag(track.id, 'hidden')}
          >
            👁
          </button>
        )}
        <button
          type="button"
          className={styles.toggle}
          title="Remove track"
          onClick={() => onRemove(track.id)}
        >
          ×
        </button>
      </div>
      <div
        className={`${styles.area} ${track.locked ? styles.areaLocked : ''}`}
        style={{ width: contentWidth, height: track.height }}
        data-testid={`track-area-${track.name}`}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) onAreaPointerDown(track.id, e)
        }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(MEDIA_DRAG_MIME)) e.preventDefault()
        }}
        onDrop={handleDrop}
      >
        {clips.map((clip) => (
          <ClipView
            key={clip.id}
            clip={clip}
            media={mediaById.get(clip.mediaId)}
            pixelsPerSecond={pixelsPerSecond}
            isSelected={selectedClipIds.includes(clip.id)}
            locked={track.locked}
            onSelect={onSelectClip}
            onCommitMove={onCommitMove}
            onCommitTrim={onCommitTrim}
            computeSnappedMoveStart={computeSnappedMoveStart}
          />
        ))}
      </div>
    </>
  )
}
