let counter = 0

/** Sortable-ish unique id, good enough for a single-session document model (no coordination needed). */
export function createId(prefix: string): string {
  counter += 1
  const random = Math.random().toString(36).slice(2, 8)
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${random}`
}
