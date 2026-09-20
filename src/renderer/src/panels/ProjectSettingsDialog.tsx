import { useState, type ReactElement } from 'react'
import { setProjectSettings } from '@core'
import { useProjectStore } from '../store/projectStore'
import { useUiStore } from '../store/uiStore'
import styles from './ExportDialog.module.css'

export default function ProjectSettingsDialog(): ReactElement {
  const project = useProjectStore((s) => s.project)
  const applyEdit = useProjectStore((s) => s.applyEdit)
  const close = useUiStore((s) => s.closeProjectSettings)

  const [name, setName] = useState(project.name)
  const [width, setWidth] = useState(project.resolution.width)
  const [height, setHeight] = useState(project.resolution.height)
  const [frameRate, setFrameRate] = useState(project.frameRate)

  function save(): void {
    applyEdit('Project Settings', (p) =>
      setProjectSettings(p, { name, resolution: { width, height }, frameRate })
    )
    close()
  }

  return (
    <div className={styles.overlay} onClick={close} role="presentation">
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-settings-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="project-settings-title" className={styles.title}>
          Project Settings
        </h2>
        <div className={styles.row}>
          <span className={styles.label}>Name</span>
          <input
            className={styles.input}
            style={{ width: 200 }}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className={styles.row}>
          <span className={styles.label}>Resolution</span>
          <span>
            <input
              className={styles.input}
              style={{ width: 64 }}
              type="number"
              value={width}
              onChange={(e) => setWidth(Number(e.target.value))}
            />
            {' × '}
            <input
              className={styles.input}
              style={{ width: 64 }}
              type="number"
              value={height}
              onChange={(e) => setHeight(Number(e.target.value))}
            />
          </span>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>Frame rate</span>
          <input
            className={styles.input}
            type="number"
            value={frameRate}
            onChange={(e) => setFrameRate(Number(e.target.value))}
          />
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.button} onClick={close}>
            Cancel
          </button>
          <button type="button" className={styles.primaryButton} onClick={save}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
