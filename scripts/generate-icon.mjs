// Generates resources/icon.png and resources/icon.ico from scratch (no network, no deps):
// a flat rounded-square background with a white "play" triangle, matching the app's dark theme.
import { writeFileSync, mkdirSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, '..', 'resources')
mkdirSync(outDir, { recursive: true })

const BG = [0x5b, 0x8c, 0xff] // accent blue
const FG = [0xff, 0xff, 0xff]

function renderRGBA(size) {
  const pixels = new Uint8Array(size * size * 4)
  const cx = size / 2
  const cy = size / 2
  const cornerRadius = size * 0.18
  const triSize = size * 0.34

  // Equilateral-ish triangle pointing right, centered slightly right of cx.
  const tx0 = cx - triSize * 0.55
  const tx1 = cx + triSize * 0.75
  const ty0 = cy - triSize
  const ty1 = cy + triSize

  function inRoundedSquare(x, y) {
    const rx = Math.max(0, Math.abs(x - cx) - (cx - cornerRadius))
    const ry = Math.max(0, Math.abs(y - cy) - (cy - cornerRadius))
    return rx * rx + ry * ry <= cornerRadius * cornerRadius
  }

  function inTriangle(x, y) {
    // Triangle points: (tx0, ty0), (tx0, ty1), (tx1, cy)
    const ax = tx0,
      ay = ty0
    const bx = tx0,
      by = ty1
    const cx2 = tx1,
      cy2 = cy
    const sign = (px, py, x1, y1, x2, y2) => (x2 - x1) * (py - y1) - (y2 - y1) * (px - x1)
    const d1 = sign(x, y, ax, ay, bx, by)
    const d2 = sign(x, y, bx, by, cx2, cy2)
    const d3 = sign(x, y, cx2, cy2, ax, ay)
    const hasNeg = d1 < 0 || d2 < 0 || d3 < 0
    const hasPos = d1 > 0 || d2 > 0 || d3 > 0
    return !(hasNeg && hasPos)
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const inSquare = inRoundedSquare(x + 0.5, y + 0.5)
      if (!inSquare) {
        pixels[i + 3] = 0
        continue
      }
      const color = inTriangle(x + 0.5, y + 0.5) ? FG : BG
      pixels[i] = color[0]
      pixels[i + 1] = color[1]
      pixels[i + 2] = color[2]
      pixels[i + 3] = 255
    }
  }
  return pixels
}

function crc32(buf) {
  let table = crc32.table
  if (!table) {
    table = crc32.table = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table[n] = c
    }
  }
  let crc = -1
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ -1) >>> 0
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const lenBuf = Buffer.alloc(4)
  lenBuf.writeUInt32BE(data.length, 0)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf])
}

function encodePNG(pixels, size) {
  const stride = size * 4
  const raw = Buffer.alloc(size * (1 + stride))
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + stride)
    raw[rowStart] = 0 // filter: none
    Buffer.from(pixels.buffer, pixels.byteOffset + y * stride, stride).copy(raw, rowStart + 1)
  }
  const idat = deflateSync(raw)
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0))
  ])
}

// Classic BMP-DIB icon frame (not PNG-compressed): the format every icon
// reader supports, including makensis's older parser.
function encodeDIBFrame(pixels, size) {
  const header = Buffer.alloc(40)
  header.writeUInt32LE(40, 0) // biSize
  header.writeInt32LE(size, 4) // biWidth
  header.writeInt32LE(size * 2, 8) // biHeight (XOR + AND mask)
  header.writeUInt16LE(1, 12) // biPlanes
  header.writeUInt16LE(32, 14) // biBitCount
  header.writeUInt32LE(0, 16) // biCompression: BI_RGB

  const stride = size * 4
  const xor = Buffer.alloc(size * stride)
  for (let y = 0; y < size; y++) {
    // DIB rows are bottom-up; source pixels are top-down.
    const srcRow = size - 1 - y
    for (let x = 0; x < size; x++) {
      const srcIdx = (srcRow * size + x) * 4
      const dstIdx = y * stride + x * 4
      xor[dstIdx] = pixels[srcIdx + 2] // B
      xor[dstIdx + 1] = pixels[srcIdx + 1] // G
      xor[dstIdx + 2] = pixels[srcIdx] // R
      xor[dstIdx + 3] = pixels[srcIdx + 3] // A
    }
  }

  const maskRowBytes = Math.ceil(Math.ceil(size / 8) / 4) * 4
  const and = Buffer.alloc(maskRowBytes * size) // all zero: fully opaque per AND mask

  return Buffer.concat([header, xor, and])
}

function encodeICO(entries) {
  // entries: [{ size, dib }]
  // ICONDIR is exactly 6 bytes; the directory table (16 bytes/entry) follows it.
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(entries.length, 4)

  let offset = 6 + entries.length * 16
  const dirs = []
  const datas = []
  for (const { size, dib } of entries) {
    const dir = Buffer.alloc(16)
    dir[0] = size >= 256 ? 0 : size
    dir[1] = size >= 256 ? 0 : size
    dir[2] = 0
    dir[3] = 0
    dir.writeUInt16LE(1, 4) // color planes
    dir.writeUInt16LE(32, 6) // bits per pixel
    dir.writeUInt32LE(dib.length, 8)
    dir.writeUInt32LE(offset, 12)
    dirs.push(dir)
    datas.push(dib)
    offset += dib.length
  }
  return Buffer.concat([header, ...dirs, ...datas])
}

// electron-builder requires the largest icon frame to be at least 256x256 to embed
// it as the packaged exe's icon. Directory entries store width/height as a single
// byte where 0 means 256 (handled below); every modern icon reader understands it.
const sizes = [16, 32, 48, 256]
const framesBySize = sizes.map((size) => {
  const pixels = renderRGBA(size)
  return { size, pixels, dib: encodeDIBFrame(pixels, size) }
})

const largest = framesBySize[framesBySize.length - 1]
writeFileSync(path.join(outDir, 'icon.png'), encodePNG(largest.pixels, largest.size))
writeFileSync(
  path.join(outDir, 'icon.ico'),
  encodeICO(framesBySize.map(({ size, dib }) => ({ size, dib })))
)

console.log(`Wrote ${path.join(outDir, 'icon.png')} and icon.ico`)
