/**
 * Times in the project model are stored as integer ticks, never floats,
 * so repeated edits and re-saves cannot accumulate rounding drift (spec section 4).
 */
export const TICKS_PER_SECOND = 120_000

export function secondsToTicks(seconds: number): number {
  return Math.round(seconds * TICKS_PER_SECOND)
}

export function ticksToSeconds(ticks: number): number {
  return ticks / TICKS_PER_SECOND
}

export function framesToTicks(frames: number, fps: number): number {
  return Math.round((frames * TICKS_PER_SECOND) / fps)
}

export function ticksToFrames(ticks: number, fps: number): number {
  return Math.round((ticks * fps) / TICKS_PER_SECOND)
}

/** Formats ticks as HH:MM:SS:FF timecode for the given frame rate. */
export function formatTimecode(ticks: number, fps: number): string {
  const totalFrames = Math.max(0, ticksToFrames(ticks, fps))
  const framesPerHour = Math.round(fps * 3600)
  const framesPerMinute = Math.round(fps * 60)
  const hours = Math.floor(totalFrames / framesPerHour)
  const minutes = Math.floor((totalFrames % framesPerHour) / framesPerMinute)
  const seconds = Math.floor((totalFrames % framesPerMinute) / fps)
  const frames = Math.floor(totalFrames % fps)
  const pad = (value: number, length = 2): string => String(value).padStart(length, '0')
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}:${pad(frames)}`
}
