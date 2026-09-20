import { useEffect, useRef, useState, type ReactElement } from 'react'
import { useProjectStore } from '../store/projectStore'
import { useUiStore } from '../store/uiStore'
import { importViaDialog } from '../editing/importMedia'
import {
  newProject,
  openProjectByPath,
  openProjectViaDialog,
  saveProject,
  saveProjectAs
} from '../editing/projectActions'
import styles from './TitleBar.module.css'

interface RecentEntry {
  filePath: string
  name: string
  lastOpenedMs: number
}

export default function TitleBar(): ReactElement {
  const openAbout = useUiStore((state) => state.openAbout)
  const openExport = useUiStore((state) => state.openExport)
  const openProjectSettings = useUiStore((state) => state.openProjectSettings)
  const project = useProjectStore((s) => s.project)
  const filePath = useProjectStore((s) => s.filePath)
  const isDirty = useProjectStore((s) => s.isDirty)
  const canUndo = useProjectStore((s) => s.canUndo)
  const canRedo = useProjectStore((s) => s.canRedo)
  const undo = useProjectStore((s) => s.undo)
  const redo = useProjectStore((s) => s.redo)

  const [recentOpen, setRecentOpen] = useState(false)
  const [recent, setRecent] = useState<RecentEntry[]>([])
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent): void {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setRecentOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function toggleRecent(): Promise<void> {
    if (!recentOpen) {
      const list = await window.cutline.project.getRecent()
      setRecent(list)
    }
    setRecentOpen((v) => !v)
  }

  const displayName = `${project.name}${isDirty ? ' •' : ''}`

  return (
    <header className={styles.bar}>
      <div className={styles.brand}>
        <span className={styles.name}>Cutline</span>
        <span className={styles.placeholderNote} title={filePath ?? 'Not saved yet'}>
          {displayName}
        </span>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.button} onClick={() => void newProject()}>
          New
        </button>
        <div className={styles.menuWrap} ref={menuRef}>
          <button
            type="button"
            className={styles.button}
            onClick={() => void openProjectViaDialog()}
          >
            Open
          </button>
          <button type="button" className={styles.caretButton} onClick={() => void toggleRecent()}>
            ▾
          </button>
          {recentOpen && (
            <div className={styles.menu}>
              {recent.length === 0 && <div className={styles.menuEmpty}>No recent projects</div>}
              {recent.map((entry) => (
                <button
                  key={entry.filePath}
                  type="button"
                  className={styles.menuItem}
                  onClick={() => {
                    setRecentOpen(false)
                    void openProjectByPath(entry.filePath)
                  }}
                >
                  {entry.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <button type="button" className={styles.button} onClick={() => void saveProject()}>
          Save
        </button>
        <button type="button" className={styles.button} onClick={() => void saveProjectAs()}>
          Save As
        </button>
        <div className={styles.divider} />
        <button type="button" className={styles.button} disabled={!canUndo} onClick={undo}>
          Undo
        </button>
        <button type="button" className={styles.button} disabled={!canRedo} onClick={redo}>
          Redo
        </button>
        <div className={styles.divider} />
        <button type="button" className={styles.button} onClick={() => void importViaDialog()}>
          Import
        </button>
        <button type="button" className={styles.button} onClick={openExport}>
          Export
        </button>
        <button type="button" className={styles.button} onClick={openProjectSettings}>
          Settings
        </button>
        <button type="button" className={styles.button} onClick={openAbout}>
          About
        </button>
      </div>
    </header>
  )
}
