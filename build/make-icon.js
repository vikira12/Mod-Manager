// ModForge 앱 아이콘 생성기 — 의존성 없이 PNG/ICO/ICNS 직접 인코딩
const zlib = require('zlib')
const fs = require('fs')
const path = require('path')

// ---------- PNG 인코더 ----------
const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

function encodePNG(size, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0 // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  const idat = zlib.deflateSync(raw, { level: 9 })
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

// ---------- 드로잉 ----------
const clamp01 = (v) => Math.max(0, Math.min(1, v))
const cov = (d) => clamp01(d + 0.5) // 1px 안티앨리어싱 커버리지

// 라운드 사각형 커버리지 (중심 cx,cy / 반너비 hw,hh / 모서리 r)
function roundRectCov(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r)
  const qy = Math.abs(py - cy) - (hh - r)
  const outLen = Math.hypot(Math.max(qx, 0), Math.max(qy, 0))
  const sd = outLen + Math.min(Math.max(qx, qy), 0) - r
  return cov(-sd)
}

// 사이드바 로고와 동일한 아이덴티티: 어두운 판 + 2x2 블록 (한 칸만 초록)
function render(size) {
  const rgba = Buffer.alloc(size * size * 4)
  const S = size / 256
  const c = size / 2

  // 배경 판
  const bgHalf = (256 / 2 - 8) * S
  const bgRadius = 56 * S

  // 2x2 블록 배치 (판 안쪽에 여백을 두고 배치)
  const cell = 40 * S       // 블록 반너비
  const gap = 9 * S         // 블록 사이 간격의 절반
  const offset = cell + gap // 중심에서 각 블록 중심까지
  const cellR = 12 * S
  const blocks = [
    { x: c - offset, y: c - offset, accent: false },
    { x: c + offset, y: c - offset, accent: false },
    { x: c - offset, y: c + offset, accent: false },
    { x: c + offset, y: c + offset, accent: true },
  ]

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5
      const py = y + 0.5

      const baseA = roundRectCov(px, py, c, c, bgHalf, bgHalf, bgRadius)
      if (baseA <= 0) continue

      // 배경: 플랫 다크
      let r = 26, g = 26, b = 30

      for (const block of blocks) {
        const a = roundRectCov(px, py, block.x, block.y, cell, cell, cellR)
        if (a <= 0) continue
        const [br, bg2, bb] = block.accent ? [63, 207, 110] : [217, 217, 222]
        r += (br - r) * a
        g += (bg2 - g) * a
        b += (bb - b) * a
      }

      const i = (y * size + x) * 4
      rgba[i] = Math.round(r)
      rgba[i + 1] = Math.round(g)
      rgba[i + 2] = Math.round(b)
      rgba[i + 3] = Math.round(255 * baseA)
    }
  }
  return rgba
}

// ---------- ICO (PNG 임베드, Vista+) ----------
function makeIco(pngs) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(pngs.length, 4)

  const entries = []
  let offset = 6 + 16 * pngs.length
  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16)
    e[0] = size >= 256 ? 0 : size
    e[1] = size >= 256 ? 0 : size
    e.writeUInt16LE(1, 4) // planes
    e.writeUInt16LE(32, 6) // bpp
    e.writeUInt32LE(data.length, 8)
    e.writeUInt32LE(offset, 12)
    offset += data.length
    entries.push(e)
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)])
}

// ---------- ICNS (PNG 임베드) ----------
function makeIcns(entries) {
  const parts = []
  let total = 8
  for (const { type, data } of entries) {
    const head = Buffer.alloc(8)
    head.write(type, 0, 'ascii')
    head.writeUInt32BE(8 + data.length, 4)
    parts.push(head, data)
    total += 8 + data.length
  }
  const header = Buffer.alloc(8)
  header.write('icns', 0, 'ascii')
  header.writeUInt32BE(total, 4)
  return Buffer.concat([header, ...parts])
}

// ---------- 출력 ----------
const root = process.argv[2]
if (!root) {
  console.error('사용법: node make-icon.js <프로젝트 루트>')
  process.exit(1)
}

const png512 = encodePNG(512, render(512))
const png256 = encodePNG(256, render(256))
const png48 = encodePNG(48, render(48))
const png32 = encodePNG(32, render(32))
const png16 = encodePNG(16, render(16))

fs.writeFileSync(path.join(root, 'build', 'icon.png'), png512) // linux (512 권장)
fs.writeFileSync(path.join(root, 'resources', 'icon.png'), png256)
fs.writeFileSync(
  path.join(root, 'build', 'icon.ico'),
  makeIco([
    { size: 256, data: png256 },
    { size: 48, data: png48 },
    { size: 32, data: png32 },
    { size: 16, data: png16 },
  ])
)
fs.writeFileSync(
  path.join(root, 'build', 'icon.icns'),
  makeIcns([
    { type: 'ic09', data: png512 }, // 512
    { type: 'ic08', data: png256 }, // 256
  ])
)

console.log('아이콘 생성 완료: build/icon.png(512), build/icon.ico, build/icon.icns, resources/icon.png(256)')
