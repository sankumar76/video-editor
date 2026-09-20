import type { ReactElement } from 'react'
import AboutDialog from './components/AboutDialog'
import Panel from './components/Panel'
import TitleBar from './components/TitleBar'
import { useUiStore } from './store/uiStore'
import styles from './App.module.css'

export default function App(): ReactElement {
  const isAboutOpen = useUiStore((state) => state.isAboutOpen)

  return (
    <div className={styles.app}>
      <div className={styles.titlebar}>
        <TitleBar />
      </div>

      <Panel title="Media" className={styles.media}>
        Imported clips will appear here (M1).
      </Panel>

      <Panel title="Preview" className={styles.preview}>
        Playback preview will render here (M1).
      </Panel>

      <Panel title="Inspector" className={styles.inspector}>
        Selected clip properties will appear here (M2).
      </Panel>

      <Panel title="Timeline" className={styles.timeline}>
        Tracks and clips will appear here (M1).
      </Panel>

      {isAboutOpen && <AboutDialog />}
    </div>
  )
}
