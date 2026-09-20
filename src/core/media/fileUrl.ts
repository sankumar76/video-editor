/**
 * Converts an absolute filesystem path (Windows or POSIX) to a `file://` URL suitable
 * for `<video src>`/`<img src>`, without relying on Node's `url` module (so it works
 * from the renderer, not just main/preload). Keeps the drive-letter colon unescaped;
 * percent-encodes everything else per path segment.
 */
export function pathToFileUrl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const segments = normalized.split('/')
  const encoded = segments.map((segment, i) =>
    i === 0 && /^[A-Za-z]:$/.test(segment) ? segment : encodeURIComponent(segment)
  )
  const joined = encoded.join('/')
  return joined.startsWith('/') ? `file://${joined}` : `file:///${joined}`
}
