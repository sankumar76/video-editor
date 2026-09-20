import { useEffect, useRef, useState, type ReactElement } from 'react'
import { formatTimecode } from '@core'
import { usePlaybackEngine, type PlaybackEngine } from '../hooks/usePlaybackEngine'
import { useProjectStore } from '../store/projectStore'
import { isTypingInField } from '../utils/isTypingInField'
import styles from './PreviewPanel.module.css'

type Zoom = 'fit' | 100 | 50 | 25

export default function PreviewPanel(): ReactElement {
  const project = useProjectStore((s) => s.project)
  const playheadTicks = useProjectStore((s) => s.playheadTicks)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const loopRef = useRef(false)
  const [loop, setLoop] = useState(false)
  const [zoom, setZoom] = useState<Zoom>('fit')
  const [showSafeArea, setShowSafeArea] = useState(false)

  useEffect(() => {
    loopRef.current = loop
  }, [loop])

  const engine = usePlaybackEngine(canvasRef, loopRef)
  const engineRef = useRef<PlaybackEngine>(engine)

  useEffect(() => {
    engineRef.current = engine
  })

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (isTypingInField()) return
      switch (event.code) {
        case 'Space':
          event.preventDefault()
          engineRef.current.toggle()
          break
        case 'KeyJ':
          if (engineRef.current.isPlaying) engineRef.current.pause()
          else engineRef.current.playReverse()
          break
        case 'KeyK':
          engineRef.current.pause()
          break
        case 'KeyL':
          if (engineRef.current.isPlaying) engineRef.current.pause()
          else engineRef.current.play()
          break
        case 'ArrowLeft':
          engineRef.current.stepFrame(-1)
          break
        case 'ArrowRight':
          engineRef.current.stepFrame(1)
          break
        default:
          return
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const timecode = formatTimecode(playheadTicks, project.frameRate || 30)
  const canvasStyle =
    zoom === 'fit' ? {} : { width: `${(project.resolution.width * zoom) / 100}px`, height: 'auto' }

  return (
    <div className={styles.panel}>
      <div className={styles.stage}>
        <canvas
          ref={canvasRef}
          width={project.resolution.width}
          height={project.resolution.height}
          className={styles.canvas}
          style={canvasStyle}
        />
        {showSafeArea && (
          <>
            <div className={styles.safeArea} style={{ inset: '5%' }} />
            <div className={styles.safeAreaInner} style={{ inset: '10%' }} />
          </>
        )}
      </div>
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.button}
          onClick={() => engine.stepFrame(-1)}
          title="Frame back (Left)"
        >
          ⏮
        </button>
        <button
          type="button"
          className={styles.button}
          onClick={() => (engine.isPlaying ? engine.pause() : engine.playReverse())}
          title="Shuttle back (J)"
        >
          ◀
        </button>
        <button
          type="button"
          className={styles.button}
          onClick={engine.toggle}
          title="Play / Pause (Space)"
        >
          {engine.isPlaying ? '⏸' : '▶'}
        </button>
        <button
          type="button"
          className={styles.button}
          onClick={() => (engine.isPlaying ? engine.pause() : engine.play())}
          title="Shuttle forward (L)"
        >
          ▶▶
        </button>
        <button
          type="button"
          className={styles.button}
          onClick={() => engine.stepFrame(1)}
          title="Frame forward (Right)"
        >
          ⏭
        </button>
        <button
          type="button"
          className={`${styles.button} ${loop ? styles.buttonActive : ''}`}
          onClick={() => setLoop((v) => !v)}
          title="Loop playback"
        >
          Loop
        </button>
        <button
          type="button"
          className={`${styles.button} ${showSafeArea ? styles.buttonActive : ''}`}
          onClick={() => setShowSafeArea((v) => !v)}
          title="Safe area guides"
        >
          Safe area
        </button>
        <select
          className={styles.button}
          value={zoom}
          onChange={(e) =>
            setZoom(e.target.value === 'fit' ? 'fit' : (Number(e.target.value) as Zoom))
          }
        >
          <option value="fit">Fit</option>
          <option value="100">100%</option>
          <option value="50">50%</option>
          <option value="25">25%</option>
        </select>
        <span className={styles.timecode} data-testid="playhead-timecode">
          {timecode}
        </span>
      </div>
    </div>
  )
}
