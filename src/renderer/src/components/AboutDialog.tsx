import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import type { AppDiagnostics, BinaryDiagnostic } from '@core'
import { useUiStore } from '../store/uiStore'
import styles from './AboutDialog.module.css'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; diagnostics: AppDiagnostics }

function BinaryRow({
  label,
  diagnostic
}: {
  label: string
  diagnostic: BinaryDiagnostic
}): ReactElement {
  return (
    <div className={styles.row}>
      <span className={styles.label}>{label}</span>
      <span className={`${styles.value} ${diagnostic.ok ? styles.ok : styles.error}`}>
        {diagnostic.ok
          ? diagnostic.version
          : `Not available: ${diagnostic.error ?? 'unknown error'}`}
      </span>
    </div>
  )
}

export default function AboutDialog(): ReactElement {
  const closeAbout = useUiStore((state) => state.closeAbout)
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    window.cutline.app
      .getDiagnostics()
      .then((diagnostics) => {
        if (!cancelled) setState({ status: 'ready', diagnostics })
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setState({ status: 'error', message: err instanceof Error ? err.message : String(err) })
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeAbout()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closeAbout])

  return (
    <div className={styles.overlay} onClick={closeAbout} role="presentation">
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="about-dialog-title" className={styles.title}>
          About Cutline
        </h2>

        {state.status === 'loading' && (
          <div className={styles.row}>
            <span className={styles.label}>Checking FFmpeg / FFprobe…</span>
          </div>
        )}

        {state.status === 'error' && (
          <div className={styles.row}>
            <span className={`${styles.value} ${styles.error}`}>{state.message}</span>
          </div>
        )}

        {state.status === 'ready' && (
          <>
            <div className={styles.row}>
              <span className={styles.label}>App version</span>
              <span className={styles.value}>{state.diagnostics.app.version}</span>
            </div>
            <div className={styles.row}>
              <span className={styles.label}>Electron</span>
              <span className={styles.value}>{state.diagnostics.runtime.electron}</span>
            </div>
            <div className={styles.row}>
              <span className={styles.label}>Chromium</span>
              <span className={styles.value}>{state.diagnostics.runtime.chrome}</span>
            </div>
            <div className={styles.row}>
              <span className={styles.label}>Node</span>
              <span className={styles.value}>{state.diagnostics.runtime.node}</span>
            </div>
            <BinaryRow label="FFmpeg" diagnostic={state.diagnostics.ffmpeg} />
            <BinaryRow label="FFprobe" diagnostic={state.diagnostics.ffprobe} />
          </>
        )}

        <div className={styles.closeRow}>
          <button
            type="button"
            className={styles.button}
            onClick={() => {
              window.cutline.app.openThirdPartyLicenses().catch(() => undefined)
            }}
          >
            Third-party licenses
          </button>
          <button type="button" className={styles.closeButton} onClick={closeAbout}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
