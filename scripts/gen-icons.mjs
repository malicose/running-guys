/**
 * Generates PWA icons without any external dependencies.
 * Writes: public/icons/icon-192.png  public/icons/icon-512.png
 *
 * Design: teal radial bg + white palm tree silhouette
 */
import zlib from 'node:zlib'
import fs   from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = path.dirname(fileURLToPath(import.meta.url))
const OUT   = path.resolve(__dir, '../public/icons')

// ── CRC32 table (used by PNG chunk encoding) ──────────────────────────────
const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = -1
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const tb  = Buffer.from(type, 'ascii')
  const db  = Buffer.isBuffer(data) ? data : Buffer.from(data)
  const len = Buffer.allocUnsafe(4); len.writeUInt32BE(db.length)
  const crcSrc = Buffer.concat([tb, db])
  const crc    = Buffer.allocUnsafe(4); crc.writeUInt32BE(crc32(crcSrc))
  return Buffer.concat([len, crcSrc, crc])
}

// ── Build a minimal RGBA PNG from a pixel buffer ──────────────────────────
function encodePNG(width, height, rgba /* Uint8Array w*h*4 */) {
  // Signature
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  // IHDR
  const ihdr = Buffer.allocUnsafe(13)
  ihdr.writeUInt32BE(width,  0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8]  = 8   // bit depth
  ihdr[9]  = 6   // colour type: RGBA
  ihdr[10] = 0   // compression
  ihdr[11] = 0   // filter
  ihdr[12] = 0   // interlace

  // IDAT: filter-0 prepended scanlines → deflate
  const raw = Buffer.allocUnsafe(height * (1 + width * 4))
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0            // filter None
    raw.set(
      rgba.subarray(y * width * 4, (y + 1) * width * 4),
      y * (1 + width * 4) + 1,
    )
  }

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ── Drawing helpers ────────────────────────────────────────────────────────
function makeCanvas(size) {
  const buf = new Uint8Array(size * size * 4)
  const set = (x, y, r, g, b, a = 255) => {
    x = Math.round(x); y = Math.round(y)
    if (x < 0 || x >= size || y < 0 || y >= size) return
    const i = (y * size + x) * 4
    // Simple alpha blend over current pixel
    const ai = a / 255
    buf[i]   = buf[i]   * (1 - ai) + r * ai
    buf[i+1] = buf[i+1] * (1 - ai) + g * ai
    buf[i+2] = buf[i+2] * (1 - ai) + b * ai
    buf[i+3] = Math.min(255, buf[i+3] + a)
  }
  const fill = (r, g, b, a = 255) => { for (let i = 0; i < buf.length; i += 4) { buf[i]=r; buf[i+1]=g; buf[i+2]=b; buf[i+3]=a } }
  const circle = (cx, cy, radius, r, g, b, a = 255) => {
    const r2 = radius * radius
    for (let y = Math.max(0, cy-radius|0); y <= Math.min(size-1, (cy+radius)|0); y++)
      for (let x = Math.max(0, cx-radius|0); x <= Math.min(size-1, (cx+radius)|0); x++)
        if ((x-cx)**2 + (y-cy)**2 <= r2) set(x, y, r, g, b, a)
  }
  const rect = (x0, y0, w, h, r, g, b, a = 255) => {
    for (let y = y0|0; y < (y0+h)|0; y++)
      for (let x = x0|0; x < (x0+w)|0; x++)
        set(x, y, r, g, b, a)
  }
  // Thick line (filled rectangle between two points)
  const line = (x1, y1, x2, y2, thick, r, g, b, a = 255) => {
    const dx = x2-x1, dy = y2-y1, len = Math.sqrt(dx*dx+dy*dy) || 1
    const px = -dy/len, py = dx/len
    const steps = Math.ceil(len) * 2
    for (let s = 0; s <= steps; s++) {
      const t = s/steps
      const cx = x1 + dx*t, cy = y1 + dy*t
      for (let w = -thick/2; w <= thick/2; w++)
        set(cx + px*w, cy + py*w, r, g, b, a)
    }
  }
  return { buf, fill, circle, rect, line, size }
}

// ── Draw the icon ─────────────────────────────────────────────────────────
function drawIcon(size) {
  const c = makeCanvas(size)
  const s = size / 512   // scale factor

  // Radial gradient-like bg: dark teal center fading to deeper blue
  c.fill(0x0c, 0x71, 0xa4)  // ocean blue base
  // Vignette rings (lighter in centre)
  for (let r = size * 0.7; r > 0; r -= 2) {
    const t  = 1 - r / (size * 0.7)
    const rr = 0x0c + (0x00a8 - 0x0c) * t | 0
    const gg = 0x71 + (0xd6 - 0x71) * t | 0
    const bb = 0xa4 + (0xe2 - 0xa4) * t | 0
    c.circle(size/2, size/2, r, rr, gg, bb)
  }

  // ── Palm trunk ──────────────────────────────────────────────────────────
  // Slightly curved trunk drawn as a thick line, brown
  const tx = size * 0.5, ty1 = size * 0.85, ty2 = size * 0.45
  c.line(tx, ty1, tx - size*0.04, ty2, Math.max(4, 14*s), 0xa0, 0x6a, 0x2e)

  // ── Fronds (3 leaves) ────────────────────────────────────────────────────
  const fx = tx - size*0.04, fy = ty2
  // Each frond: arc of small circles
  const fronds = [
    { dx: -0.22, dy: -0.20, len: 0.22 },
    { dx:  0.22, dy: -0.18, len: 0.22 },
    { dx: -0.02, dy: -0.28, len: 0.20 },
    { dx: -0.28, dy: -0.04, len: 0.18 },
    { dx:  0.28, dy: -0.06, len: 0.18 },
  ]
  for (const f of fronds) {
    const steps = 18
    for (let i = 0; i <= steps; i++) {
      const t  = i / steps
      const ox = f.dx * size * f.len * t
      const oy = f.dy * size * f.len * t - 0.08 * size * t * t  // droop
      const r  = Math.max(1, (7 - 5*t) * s)
      // Lighter green tip, darker base
      const g = 0x6a + (0xc8 - 0x6a) * t | 0
      c.circle(fx + ox, fy + oy, r, 0x2d, g, 0x38)
    }
  }

  // ── Coconuts ─────────────────────────────────────────────────────────────
  c.circle(fx - size*0.06, fy + size*0.04, Math.max(3, 8*s), 0xc8, 0xa9, 0x6e)
  c.circle(fx + size*0.03, fy + size*0.03, Math.max(3, 8*s), 0xb8, 0x99, 0x5e)
  c.circle(fx - size*0.01, fy + size*0.06, Math.max(3, 7*s), 0xd8, 0xb9, 0x7e)

  // ── Sun (top-right) ───────────────────────────────────────────────────────
  c.circle(size*0.76, size*0.20, Math.max(6, 38*s), 0xff, 0xe0, 0x57)
  c.circle(size*0.76, size*0.20, Math.max(4, 28*s), 0xff, 0xf0, 0x8a)

  // ── Ocean wave (bottom strip) ─────────────────────────────────────────────
  for (let x = 0; x < size; x++) {
    const wave = Math.sin(x / size * Math.PI * 4) * size * 0.015
    const yBase = size * 0.76 + wave
    c.rect(x, yBase, 1, size - yBase, 0x1a, 0x82, 0xc0)
  }
  // Wave crest highlight
  for (let x = 0; x < size; x++) {
    const wave = Math.sin(x / size * Math.PI * 4) * size * 0.015
    const yBase = size * 0.76 + wave
    c.line(x, yBase, x+1, yBase + wave*0.1, 2*s, 0xff, 0xff, 0xff, 120)
  }

  return c.buf
}

// ── Generate both sizes ────────────────────────────────────────────────────
for (const size of [192, 512]) {
  const pixels = drawIcon(size)
  const png    = encodePNG(size, size, pixels)
  const dest   = path.join(OUT, `icon-${size}.png`)
  fs.writeFileSync(dest, png)
  console.log(`✓  ${dest}  (${(png.length/1024).toFixed(1)} KB)`)
}
