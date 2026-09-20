import { app, screen, type BrowserWindow, type Rectangle } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

interface WindowState extends Rectangle {
  isMaximized: boolean
}

const DEFAULT_SIZE = { width: 1280, height: 800 }

function statePath(): string {
  return path.join(app.getPath('userData'), 'window-state.json')
}

function centeredOnPrimaryDisplay(size: { width: number; height: number }): WindowState {
  const work = screen.getPrimaryDisplay().workArea
  return {
    width: size.width,
    height: size.height,
    x: work.x + Math.round((work.width - size.width) / 2),
    y: work.y + Math.round((work.height - size.height) / 2),
    isMaximized: false
  }
}

function isOnAnyDisplay(state: Rectangle): boolean {
  return screen.getAllDisplays().some((display) => {
    const bounds = display.workArea
    return (
      state.x < bounds.x + bounds.width &&
      state.x + state.width > bounds.x &&
      state.y < bounds.y + bounds.height &&
      state.y + state.height > bounds.y
    )
  })
}

/** Must be called after the app 'ready' event: the `screen` module requires it. */
export function loadWindowState(): WindowState {
  try {
    const raw = readFileSync(statePath(), 'utf-8')
    const parsed = JSON.parse(raw) as Partial<WindowState>
    const state: WindowState = {
      width: parsed.width ?? DEFAULT_SIZE.width,
      height: parsed.height ?? DEFAULT_SIZE.height,
      x: parsed.x ?? 0,
      y: parsed.y ?? 0,
      isMaximized: parsed.isMaximized ?? false
    }
    return isOnAnyDisplay(state) ? state : centeredOnPrimaryDisplay(state)
  } catch {
    return centeredOnPrimaryDisplay(DEFAULT_SIZE)
  }
}

export function trackWindowState(window: BrowserWindow): void {
  let saveTimeout: NodeJS.Timeout | undefined

  const save = (): void => {
    if (saveTimeout) clearTimeout(saveTimeout)
    saveTimeout = setTimeout(() => {
      if (window.isDestroyed()) return
      const isMaximized = window.isMaximized()
      const bounds = isMaximized ? window.getNormalBounds() : window.getBounds()
      const state: WindowState = { ...bounds, isMaximized }
      try {
        writeFileSync(statePath(), JSON.stringify(state), 'utf-8')
      } catch {
        // Losing the remembered window position isn't worth surfacing to the user.
      }
    }, 300)
  }

  window.on('resize', save)
  window.on('move', save)
  window.on('close', save)
}
