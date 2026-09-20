import type { ReactElement } from 'react'
import { useUiStore } from '../store/uiStore'
import styles from './TitleBar.module.css'

export default function TitleBar(): ReactElement {
  const openAbout = useUiStore((state) => state.openAbout)

  return (
    <header className={styles.bar}>
      <div className={styles.brand}>
        <span className={styles.name}>Cutline</span>
        <span className={styles.placeholderNote}>M0 scaffold</span>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.button} onClick={openAbout}>
          About
        </button>
      </div>
    </header>
  )
}
