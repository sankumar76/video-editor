import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  unlink,
  writeFile
} from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { SCHEMA_VERSION, type Project } from '@core'
import { backupsDir, recentProjectsFile } from '../paths'

const MAX_BACKUPS = 3

export function migrateProject(raw: unknown): Project {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Not a valid Cutline project file')
  }
  const data = raw as { schemaVersion?: number }
  if (data.schemaVersion === SCHEMA_VERSION) return raw as Project
  if (data.schemaVersion === undefined) {
    throw new Error('Unrecognized project file (missing schemaVersion)')
  }
  // Future schema migrations chain here, e.g.: if (data.schemaVersion === 1) return migrateV1ToV2(data)
  throw new Error(
    `This project was saved by a newer/older version of Cutline (schema ${data.schemaVersion})`
  )
}

async function rotateBackups(filePath: string): Promise<void> {
  try {
    await stat(filePath)
  } catch {
    return // nothing to back up yet — this is the first save
  }
  const dir = backupsDir(filePath)
  await mkdir(dir, { recursive: true })
  const base = path.basename(filePath)
  await copyFile(filePath, path.join(dir, `${base}.${Date.now()}.bak`))

  const entries = await readdir(dir)
  const matching = entries
    .filter((name) => name.startsWith(`${base}.`) && name.endsWith('.bak'))
    .sort()
    .reverse()
  await Promise.all(
    matching.slice(MAX_BACKUPS).map((stale) => unlink(path.join(dir, stale)).catch(() => undefined))
  )
}

/** Atomic save: write to a temp file in the same directory, then rename over the target. */
export async function saveProjectFile(filePath: string, project: Project): Promise<void> {
  await rotateBackups(filePath)
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${randomUUID()}.tmp`
  )
  await writeFile(tempPath, JSON.stringify(project, null, 2), 'utf-8')
  await rename(tempPath, filePath)
}

export async function loadProjectFile(filePath: string): Promise<Project> {
  const raw = await readFile(filePath, 'utf-8')
  return migrateProject(JSON.parse(raw))
}

// --- Recent projects -------------------------------------------------------

export interface RecentProjectEntry {
  filePath: string
  name: string
  lastOpenedMs: number
}

async function readRecentList(): Promise<RecentProjectEntry[]> {
  try {
    const raw = await readFile(recentProjectsFile(), 'utf-8')
    return JSON.parse(raw) as RecentProjectEntry[]
  } catch {
    return []
  }
}

async function writeRecentList(list: RecentProjectEntry[]): Promise<void> {
  await mkdir(path.dirname(recentProjectsFile()), { recursive: true })
  await writeFile(recentProjectsFile(), JSON.stringify(list, null, 2), 'utf-8')
}

export async function getRecentProjects(): Promise<RecentProjectEntry[]> {
  return readRecentList()
}

export async function addRecentProject(entry: RecentProjectEntry): Promise<RecentProjectEntry[]> {
  const filtered = (await readRecentList()).filter((e) => e.filePath !== entry.filePath)
  filtered.unshift(entry)
  const trimmed = filtered.slice(0, 10)
  await writeRecentList(trimmed)
  return trimmed
}

export async function removeRecentProject(filePath: string): Promise<RecentProjectEntry[]> {
  const filtered = (await readRecentList()).filter((e) => e.filePath !== filePath)
  await writeRecentList(filtered)
  return filtered
}
