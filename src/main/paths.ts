import { app } from 'electron'
import path from 'node:path'

export function cacheDir(): string {
  return path.join(app.getPath('userData'), 'cache')
}

export function thumbnailsDir(): string {
  return path.join(cacheDir(), 'thumbnails')
}

export function proxiesDir(): string {
  return path.join(cacheDir(), 'proxies')
}

export function backupsDir(projectFilePath: string): string {
  return path.join(path.dirname(projectFilePath), '.cutline-backups')
}

export function recentProjectsFile(): string {
  return path.join(app.getPath('userData'), 'recent-projects.json')
}
