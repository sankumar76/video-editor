import { useMemo, useState, type DragEvent, type ReactElement } from 'react'
import { pathToFileUrl, removeMedia, ticksToSeconds, type MediaItem } from '@core'
import { useProjectStore } from '../store/projectStore'
import { importFilePaths, importViaDialog } from '../editing/importMedia'
import { formatDurationSeconds } from '../utils/format'
import styles from './MediaBinPanel.module.css'

export const MEDIA_DRAG_MIME = 'application/x-cutline-media-id'

type SortKey = 'name' | 'duration' | 'imported'

function statusLabel(item: MediaItem): { text: string; isError: boolean; progress: number | null } {
  if (item.probeStatus === 'error') {
    return { text: item.probeError ?? 'Probe failed', isError: true, progress: null }
  }
  if (item.probeStatus === 'pending' || item.probeStatus === 'probing') {
    return { text: 'Probing…', isError: false, progress: null }
  }
  if (item.needsProxy && item.proxyStatus !== 'ready') {
    if (item.proxyStatus === 'error') return { text: 'Proxy failed', isError: true, progress: null }
    return { text: 'Generating proxy…', isError: false, progress: item.proxyProgress }
  }
  return { text: '', isError: false, progress: null }
}

export default function MediaBinPanel(): ReactElement {
  const project = useProjectStore((s) => s.project)
  const applyEdit = useProjectStore((s) => s.applyEdit)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('imported')
  const [isDragOver, setIsDragOver] = useState(false)

  const items = useMemo(() => {
    const filtered = project.media.filter((m) =>
      m.fileName.toLowerCase().includes(search.toLowerCase())
    )
    const sorted = [...filtered]
    if (sortKey === 'name') sorted.sort((a, b) => a.fileName.localeCompare(b.fileName))
    else if (sortKey === 'duration') sorted.sort((a, b) => b.duration - a.duration)
    return sorted
  }, [project.media, search, sortKey])

  async function handleDrop(event: DragEvent<HTMLDivElement>): Promise<void> {
    event.preventDefault()
    setIsDragOver(false)
    const files = Array.from(event.dataTransfer.files)
    if (files.length === 0) return
    const paths = files.map((file) => window.cutline.media.getPathForFile(file)).filter(Boolean)
    await importFilePaths(paths)
  }

  function handleDelete(mediaId: string): void {
    const usedByClips = project.sequences.some((seq) =>
      seq.clips.some((c) => c.mediaId === mediaId)
    )
    if (usedByClips) {
      const ok = window.confirm(
        'This media is used in the timeline. Deleting it will also remove those clips. Continue?'
      )
      if (!ok) return
    }
    applyEdit('Delete Media', (p) => removeMedia(p, [mediaId]))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className={styles.toolbar}>
        <button type="button" className={styles.button} onClick={() => void importViaDialog()}>
          Import…
        </button>
        <input
          className={styles.search}
          placeholder="Search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className={styles.button}
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
        >
          <option value="imported">Recent</option>
          <option value="name">Name</option>
          <option value="duration">Duration</option>
        </select>
      </div>

      <div
        className={`${styles.dropZone} ${isDragOver ? styles.dropZoneActive : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragOver(true)
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => void handleDrop(e)}
      >
        {items.length === 0 && (
          <div className={styles.empty}>
            Drag video, audio, or image files here, or click Import.
          </div>
        )}
        {items.map((item) => {
          const status = statusLabel(item)
          return (
            <div
              key={item.id}
              className={styles.item}
              draggable
              data-testid="media-item"
              data-media-name={item.fileName}
              onDragStart={(e) => {
                e.dataTransfer.setData(MEDIA_DRAG_MIME, item.id)
                e.dataTransfer.effectAllowed = 'copy'
              }}
            >
              <div className={styles.thumb}>
                {item.thumbnailPath ? (
                  <img src={pathToFileUrl(item.thumbnailPath)} alt="" />
                ) : (
                  <span>{item.type === 'audio' ? '♪' : '…'}</span>
                )}
              </div>
              <div className={styles.info}>
                <div className={styles.name} title={item.fileName}>
                  {item.fileName}
                </div>
                <div className={styles.meta}>
                  {item.duration > 0 && (
                    <span>{formatDurationSeconds(ticksToSeconds(item.duration))}</span>
                  )}
                  {item.width > 0 && (
                    <span>
                      {item.width}×{item.height}
                    </span>
                  )}
                  {item.videoCodec && <span>{item.videoCodec}</span>}
                  {!item.videoCodec && item.audioCodec && <span>{item.audioCodec}</span>}
                </div>
                {status.text && (
                  <div className={`${styles.status} ${status.isError ? styles.statusError : ''}`}>
                    {status.text}
                  </div>
                )}
                {status.progress !== null && (
                  <div className={styles.progressTrack}>
                    <div
                      className={styles.progressFill}
                      style={{ width: `${Math.round(status.progress * 100)}%` }}
                    />
                  </div>
                )}
              </div>
              <button
                type="button"
                className={styles.deleteButton}
                title="Delete from bin"
                onClick={() => handleDelete(item.id)}
              >
                ×
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
