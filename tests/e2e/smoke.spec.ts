import path from 'node:path'
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'

const mainEntry = path.join(__dirname, '..', '..', 'out', 'main', 'index.js')

let app: ElectronApplication
let window: Page

test.beforeAll(async () => {
  app = await electron.launch({ args: [mainEntry] })
  window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')
})

test.afterAll(async () => {
  await app.close()
})

test('shows the placeholder layout', async () => {
  await expect(window).toHaveTitle('Cutline')
  await expect(window.getByText('Media', { exact: true })).toBeVisible()
  await expect(window.getByText('Preview', { exact: true })).toBeVisible()
  await expect(window.getByText('Inspector', { exact: true })).toBeVisible()
  await expect(window.getByText('Timeline', { exact: true })).toBeVisible()
})

test('About screen reports FFmpeg and FFprobe status', async () => {
  await window.getByRole('button', { name: 'About' }).click()
  const dialog = window.getByRole('dialog', { name: 'About Cutline' })
  await expect(dialog).toBeVisible()

  // Loading state resolves once the main process replies over IPC.
  await expect(dialog.getByText('Checking FFmpeg / FFprobe…')).toBeHidden({ timeout: 15_000 })
  await expect(dialog.getByText('FFmpeg', { exact: true })).toBeVisible()
  await expect(dialog.getByText('FFprobe', { exact: true })).toBeVisible()

  await dialog.getByRole('button', { name: 'Close' }).click()
  await expect(dialog).toBeHidden()
})
