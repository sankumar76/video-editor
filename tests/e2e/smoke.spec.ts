import path from 'node:path'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'

const mainEntry = path.join(__dirname, '..', '..', 'out', 'main', 'index.js')
const fixturesDir = path.join(__dirname, '..', 'fixtures')

let app: ElectronApplication
let window: Page
let scratchDir: string

test.beforeAll(async () => {
  app = await electron.launch({ args: [mainEntry] })
  window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')
  scratchDir = mkdtempSync(path.join(tmpdir(), 'cutline-e2e-'))
})

test.afterAll(async () => {
  await app.close()
  rmSync(scratchDir, { recursive: true, force: true })
})

test('shows the M1 layout', async () => {
  await expect(window).toHaveTitle('Cutline')
  await expect(window.getByRole('button', { name: 'Import…' })).toBeVisible()
  await expect(window.getByRole('button', { name: 'Split' })).toBeVisible()
  await expect(window.getByTestId('track-area-V1')).toBeVisible()
  await expect(window.getByTestId('track-area-A1')).toBeVisible()
  await expect(window.getByTestId('playhead-timecode')).toHaveText('00:00:00:00')
})

test('About screen reports working FFmpeg and FFprobe', async () => {
  await window.getByRole('button', { name: 'About' }).click()
  const dialog = window.getByRole('dialog', { name: 'About Cutline' })
  await expect(dialog).toBeVisible()

  await expect(dialog.getByText('Checking FFmpeg / FFprobe…')).toBeHidden({ timeout: 15_000 })
  // Not just "finished loading" — assert the checks actually succeeded (a real gap once:
  // a broken binary path made this text disappear via an error state too).
  await expect(dialog.getByText(/ffmpeg version/i)).toBeVisible()
  await expect(dialog.getByText(/ffprobe version/i)).toBeVisible()

  await dialog.getByRole('button', { name: 'Close' }).click()
  await expect(dialog).toBeHidden()
})

test('M1 workflow: import, arrange, trim, split, undo/redo, save, reopen, export', async () => {
  const projectPath = path.join(scratchDir, 'workflow-test.cutline')
  const exportPath = path.join(scratchDir, 'workflow-export.mp4')

  await test.step('import media', async () => {
    const importPaths = [
      path.join(fixturesDir, 'h264_sample.mp4'),
      path.join(fixturesDir, 'audio_sample.m4a'),
      path.join(fixturesDir, 'image_sample.png')
    ]
    await app.evaluate(({ dialog }, paths) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: paths })
    }, importPaths)

    await window.getByRole('button', { name: 'Import…' }).click()
    await expect(window.getByTestId('media-item')).toHaveCount(3, { timeout: 15_000 })
    // Let probe/thumbnail/proxy jobs settle so drag sources have real thumbnails/paths.
    await expect(window.getByText('Probing…')).toHaveCount(0, { timeout: 20_000 })
  })

  await test.step('arrange 3 clips on two tracks', async () => {
    const videoItem = window.getByTestId('media-item').filter({ hasText: 'h264_sample.mp4' })
    const audioItem = window.getByTestId('media-item').filter({ hasText: 'audio_sample.m4a' })
    const v1Area = window.getByTestId('track-area-V1')
    const a1Area = window.getByTestId('track-area-A1')

    // Dropping a video-with-audio file auto-creates a linked clip on the audio track.
    await videoItem.dragTo(v1Area, { targetPosition: { x: 20, y: 20 } })
    await audioItem.dragTo(a1Area, { targetPosition: { x: 400, y: 20 } })

    await expect(window.getByTestId('timeline-clip')).toHaveCount(3)
  })

  await test.step('trim a clip edge', async () => {
    const clip = window.getByTestId('timeline-clip').first()
    const box = await clip.boundingBox()
    expect(box).not.toBeNull()
    if (!box) return
    await window.mouse.move(box.x + box.width - 3, box.y + box.height / 2)
    await window.mouse.down()
    await window.mouse.move(box.x + box.width - 40, box.y + box.height / 2, { steps: 5 })
    await window.mouse.up()
    // Trimming a linked clip keeps its video+audio partner in sync (same new duration).
    const widths = await window
      .getByTestId('timeline-clip')
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width))
    expect(widths[0]).toBeCloseTo(widths[1]!, 0)
  })

  await test.step('split the selected clip at the playhead', async () => {
    for (let i = 0; i < 45; i++) {
      await window.keyboard.press('ArrowRight')
    }
    // Frame-stepping ~1.5s in; exact frame count isn't essential, just "inside the clip".
    await expect(window.getByTestId('playhead-timecode')).toHaveText(/00:00:01:1[4-9]/)
    await window.getByTestId('timeline-clip').first().click()
    await window.getByRole('button', { name: 'Split' }).click()
    // The selected video clip and its linked audio partner both split: +2 clips.
    await expect(window.getByTestId('timeline-clip')).toHaveCount(5)
  })

  await test.step('undo and redo', async () => {
    await window.keyboard.press('Control+z')
    await expect(window.getByTestId('timeline-clip')).toHaveCount(3)
    await window.keyboard.press('Control+Shift+z')
    await expect(window.getByTestId('timeline-clip')).toHaveCount(5)
  })

  await test.step('save the project', async () => {
    await app.evaluate(({ dialog }, savePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: savePath })
    }, projectPath)
    await window.getByRole('button', { name: 'Save', exact: true }).click()
    await expect.poll(() => existsSync(projectPath)).toBe(true)
  })

  await test.step('start a new project, then reopen the saved one', async () => {
    await window.getByRole('button', { name: 'New' }).click()
    await expect(window.getByTestId('timeline-clip')).toHaveCount(0)

    await app.evaluate(({ dialog }, openPath) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [openPath] })
    }, projectPath)
    await window.getByRole('button', { name: 'Open', exact: true }).click()
    await expect(window.getByTestId('timeline-clip')).toHaveCount(5)
  })

  await test.step('export and verify the output file', async () => {
    await app.evaluate(({ dialog }, outPath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: outPath })
    }, exportPath)

    await window.getByRole('button', { name: 'Export', exact: true }).click()
    const exportDialog = window.getByRole('dialog', { name: 'Export' })
    await exportDialog.getByRole('button', { name: 'Export', exact: true }).click()
    await expect(exportDialog.getByText('Export complete.')).toBeVisible({ timeout: 60_000 })
    expect(existsSync(exportPath)).toBe(true)
    await exportDialog.getByRole('button', { name: 'Close' }).click()
  })
})
