import { useEffect, type ReactElement } from 'react'
import AboutDialog from './components/AboutDialog'
import Panel from './components/Panel'
import TitleBar from './components/TitleBar'
import MediaBinPanel from './panels/MediaBinPanel'
import PreviewPanel from './panels/PreviewPanel'
import TimelinePanel from './panels/TimelinePanel'
import ExportDialog from './panels/ExportDialog'
import ProjectSettingsDialog from './panels/ProjectSettingsDialog'
import { useUiStore } from './store/uiStore'
import { initMediaPatchBridge } from './store/mediaPatchBridge'
import { initProjectSyncToMain } from './store/syncToMain'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import styles from './App.module.css'

export default function App(): ReactElement {
  const isAboutOpen = useUiStore((state) => state.isAboutOpen)
  const isExportOpen = useUiStore((state) => state.isExportOpen)
  const isProjectSettingsOpen = useUiStore((state) => state.isProjectSettingsOpen)

  useEffect(() => {
    initMediaPatchBridge()
    initProjectSyncToMain()
  }, [])

  useKeyboardShortcuts()

  return (
    <div className={styles.app}>
      <div className={styles.titlebar}>
        <TitleBar />
      </div>

      <div className={styles.media}>
        <MediaBinPanel />
      </div>

      <div className={styles.preview}>
        <PreviewPanel />
      </div>

      <Panel title="Inspector" className={styles.inspector}>
        Selected clip properties will appear here (M2).
      </Panel>

      <div className={styles.timeline}>
        <TimelinePanel />
      </div>

      {isAboutOpen && <AboutDialog />}
      {isExportOpen && <ExportDialog />}
      {isProjectSettingsOpen && <ProjectSettingsDialog />}
    </div>
  )
}
