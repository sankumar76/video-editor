import { useEffect, useRef, useState, type ReactElement } from 'react'
import type { ExportSettings } from '@core'
import { useProjectStore } from '../store/projectStore'
import { useUiStore } from '../store/uiStore'
import styles from './ExportDialog.module.css'

type Quality = 'draft' | 'good' | 'best'

const QUALITY_CRF: Record<Quality, number> = { draft: 28, good: 20, best: 16 }

type Phase =
  | { kind: 'form' }
  | { kind: 'exporting'; jobId: string; fraction: number }
  | { kind: 'done'; outputPath: string }
  | { kind: 'error'; message: string }
  | { kind: 'cancelled' }

export default function ExportDialog(): ReactElement {
  const project = useProjectStore((s) => s.project)
  const close = useUiStore((s) => s.closeExport)

  const [width, setWidth] = useState(project.resolution.width)
  const [height, setHeight] = useState(project.resolution.height)
  const [frameRate, setFrameRate] = useState(project.frameRate)
  const [quality, setQuality] = useState<Quality>('good')
  const [advanced, setAdvanced] = useState(false)
  const [crf, setCrf] = useState(QUALITY_CRF.good)
  const [phase, setPhase] = useState<Phase>({ kind: 'form' })
  const jobIdRef = useRef<string | null>(null)

  useEffect(() => {
    const offProgress = window.cutline.export.onProgress(({ jobId, fraction }) => {
      if (jobId !== jobIdRef.current) return
      setPhase({ kind: 'exporting', jobId, fraction })
    })
    const offDone = window.cutline.export.onDone(({ jobId, outputPath }) => {
      if (jobId !== jobIdRef.current) return
      setPhase({ kind: 'done', outputPath })
    })
    const offError = window.cutline.export.onError(({ jobId, error }) => {
      if (jobId !== jobIdRef.current) return
      setPhase({ kind: 'error', message: error })
    })
    const offCancelled = window.cutline.export.onCancelled(({ jobId }) => {
      if (jobId !== jobIdRef.current) return
      setPhase({ kind: 'cancelled' })
    })
    return () => {
      offProgress()
      offDone()
      offError()
      offCancelled()
    }
  }, [])

  async function startExport(): Promise<void> {
    const outputPath = await window.cutline.dialogs.chooseExportPath(`${project.name}.mp4`)
    if (!outputPath) return

    const settings: ExportSettings = {
      width,
      height,
      frameRate,
      sampleRate: project.sampleRate,
      backgroundColor: project.backgroundColor,
      crf: advanced ? crf : QUALITY_CRF[quality]
    }

    const jobId = await window.cutline.export.start({
      project,
      sequenceId: project.activeSequenceId,
      settings,
      outputPath
    })
    jobIdRef.current = jobId
    setPhase({ kind: 'exporting', jobId, fraction: 0 })
  }

  function cancel(): void {
    if (jobIdRef.current) window.cutline.export.cancel(jobIdRef.current)
  }

  const isExporting = phase.kind === 'exporting'

  return (
    <div
      className={styles.overlay}
      onClick={phase.kind === 'form' ? close : undefined}
      role="presentation"
    >
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="export-dialog-title" className={styles.title}>
          Export
        </h2>

        {phase.kind === 'form' && (
          <>
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
            <div className={styles.row}>
              <span className={styles.label}>Quality</span>
              {!advanced ? (
                <div className={styles.qualityGroup}>
                  {(['draft', 'good', 'best'] as Quality[]).map((q) => (
                    <button
                      key={q}
                      type="button"
                      className={`${styles.qualityButton} ${quality === q ? styles.qualityButtonActive : ''}`}
                      onClick={() => setQuality(q)}
                    >
                      {q[0]!.toUpperCase() + q.slice(1)}
                    </button>
                  ))}
                </div>
              ) : (
                <input
                  className={styles.input}
                  type="number"
                  min={0}
                  max={51}
                  value={crf}
                  onChange={(e) => setCrf(Number(e.target.value))}
                />
              )}
            </div>
            <div className={styles.row}>
              <span className={styles.label}>Advanced</span>
              <input
                type="checkbox"
                checked={advanced}
                onChange={(e) => setAdvanced(e.target.checked)}
              />
            </div>
          </>
        )}

        {isExporting && (
          <>
            <div className={styles.progressTrack}>
              <div
                className={styles.progressFill}
                style={{ width: `${Math.round(phase.fraction * 100)}%` }}
              />
            </div>
            <div className={styles.statusText}>Exporting… {Math.round(phase.fraction * 100)}%</div>
          </>
        )}

        {phase.kind === 'done' && (
          <div className={styles.statusText}>
            Export complete.
            <br />
            <button
              type="button"
              className={styles.button}
              style={{ marginTop: 8 }}
              onClick={() => window.cutline.shell.showItemInFolder(phase.outputPath)}
            >
              Open folder
            </button>
          </div>
        )}

        {phase.kind === 'error' && (
          <div className={styles.errorText}>Export failed: {phase.message}</div>
        )}
        {phase.kind === 'cancelled' && <div className={styles.statusText}>Export cancelled.</div>}

        <div className={styles.actions}>
          {phase.kind === 'form' && (
            <>
              <button type="button" className={styles.button} onClick={close}>
                Cancel
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => void startExport()}
              >
                Export
              </button>
            </>
          )}
          {isExporting && (
            <button type="button" className={styles.button} onClick={cancel}>
              Cancel Export
            </button>
          )}
          {(phase.kind === 'done' || phase.kind === 'error' || phase.kind === 'cancelled') && (
            <button type="button" className={styles.primaryButton} onClick={close}>
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
