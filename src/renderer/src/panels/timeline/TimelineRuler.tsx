import { useMemo, type PointerEvent, type ReactElement } from 'react'
import { TICKS_PER_SECOND, formatTimecode, pixelsToTicks } from '@core'
import { useProjectStore } from '../../store/projectStore'
import { RULER_HEIGHT } from './layout'
import styles from './TimelineRuler.module.css'

const NICE_INTERVALS_SECONDS = [
  1 / 30,
  1 / 10,
  0.5,
  1,
  2,
  5,
  10,
  15,
  30,
  60,
  120,
  300,
  600,
  1800,
  3600
]

function pickIntervalSeconds(pixelsPerSecond: number, targetSpacingPx: number): number {
  for (const interval of NICE_INTERVALS_SECONDS) {
    if (interval * pixelsPerSecond >= targetSpacingPx) return interval
  }
  return NICE_INTERVALS_SECONDS.at(-1)!
}

interface Props {
  contentWidth: number
  onScrub: (ticks: number) => void
}

export default function TimelineRuler({ contentWidth, onScrub }: Props): ReactElement {
  const pixelsPerSecond = useProjectStore((s) => s.pixelsPerSecond)
  const frameRate = useProjectStore((s) => s.project.frameRate) || 30

  const intervalSeconds = pickIntervalSeconds(pixelsPerSecond, 90)
  const marks = useMemo(() => {
    const count = Math.ceil(contentWidth / (intervalSeconds * pixelsPerSecond)) + 1
    return Array.from({ length: count }, (_, i) => i * intervalSeconds)
  }, [contentWidth, intervalSeconds, pixelsPerSecond])

  function handlePointer(event: PointerEvent<HTMLDivElement>): void {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - rect.left
    onScrub(Math.max(0, pixelsToTicks(x, pixelsPerSecond, TICKS_PER_SECOND)))
  }

  return (
    <div
      className={styles.ruler}
      style={{ width: contentWidth, height: RULER_HEIGHT }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        handlePointer(e)
      }}
      onPointerMove={(e) => {
        if (e.buttons === 1) handlePointer(e)
      }}
    >
      {marks.map((seconds) => (
        <div key={seconds} className={styles.tick} style={{ left: seconds * pixelsPerSecond }} />
      ))}
      {marks.map((seconds) => (
        <span key={seconds} className={styles.label} style={{ left: seconds * pixelsPerSecond }}>
          {formatTimecode(Math.round(seconds * TICKS_PER_SECOND), frameRate)}
        </span>
      ))}
    </div>
  )
}
