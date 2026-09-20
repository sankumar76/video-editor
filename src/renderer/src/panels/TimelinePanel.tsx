import type { ReactElement } from 'react'
import { addTrack } from '@core'
import { useProjectStore } from '../store/projectStore'
import { deleteSelected, splitAtPlayhead } from '../editing/actions'
import TimelineTracks from './timeline/TimelineTracks'
import styles from './TimelinePanel.module.css'

export default function TimelinePanel(): ReactElement {
  const applyEdit = useProjectStore((s) => s.applyEdit)
  const project = useProjectStore((s) => s.project)
  const pixelsPerSecond = useProjectStore((s) => s.pixelsPerSecond)
  const setZoom = useProjectStore((s) => s.setZoom)
  const snappingEnabled = useProjectStore((s) => s.snappingEnabled)
  const toggleSnapping = useProjectStore((s) => s.toggleSnapping)

  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <button
          type="button"
          className={styles.button}
          onClick={() =>
            applyEdit('Add Video Track', (p) => addTrack(p, project.activeSequenceId, 'video'))
          }
        >
          + Video Track
        </button>
        <button
          type="button"
          className={styles.button}
          onClick={() =>
            applyEdit('Add Audio Track', (p) => addTrack(p, project.activeSequenceId, 'audio'))
          }
        >
          + Audio Track
        </button>
        <div className={styles.divider} />
        <button type="button" className={styles.button} onClick={splitAtPlayhead} title="Split (S)">
          Split
        </button>
        <button
          type="button"
          className={styles.button}
          onClick={() => deleteSelected(false)}
          title="Delete (Del)"
        >
          Delete
        </button>
        <button
          type="button"
          className={styles.button}
          onClick={() => deleteSelected(true)}
          title="Ripple delete (Shift+Del)"
        >
          Ripple Delete
        </button>
        <div className={styles.divider} />
        <button
          type="button"
          className={`${styles.button} ${snappingEnabled ? styles.buttonActive : ''}`}
          onClick={toggleSnapping}
          title="Toggle snapping (N)"
        >
          Snap
        </button>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          className={styles.button}
          onClick={() => setZoom(pixelsPerSecond / 1.4)}
        >
          −
        </button>
        <button
          type="button"
          className={styles.button}
          onClick={() => setZoom(pixelsPerSecond * 1.4)}
        >
          +
        </button>
      </div>
      <TimelineTracks />
    </div>
  )
}
