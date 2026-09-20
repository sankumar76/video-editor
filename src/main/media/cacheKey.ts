import { createHash } from 'node:crypto'

/** Stable cache key for a media file, used to name thumbnail/proxy files on disk. */
export function cacheKeyFor(filePath: string, fileSize: number, fileMtimeMs: number): string {
  return createHash('sha1').update(`${filePath}:${fileSize}:${fileMtimeMs}`).digest('hex')
}
