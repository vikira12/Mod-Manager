import zlib from 'zlib'

// 의존성 없는 최소 ZIP 리더 (저장/deflate 압축만 지원, ZIP64 미지원)
// jar 메타데이터 스캔과 .mrpack 해석에 공용으로 사용한다.

export interface ZipEntry {
  name: string
  compression: number
  compressedSize: number
  uncompressedSize: number
  localHeaderOffset: number
}

const TEXT_DECODER = new TextDecoder('utf-8')

export function readZipEntries(data: Buffer): Map<string, ZipEntry> {
  const entries = new Map<string, ZipEntry>()
  const eocdOffset = findEndOfCentralDirectory(data)
  if (eocdOffset < 0) return entries

  const totalEntries = data.readUInt16LE(eocdOffset + 10)
  const centralDirOffset = data.readUInt32LE(eocdOffset + 16)
  let offset = centralDirOffset

  for (let i = 0; i < totalEntries; i++) {
    if (data.readUInt32LE(offset) !== 0x02014b50) break

    const compression = data.readUInt16LE(offset + 10)
    const compressedSize = data.readUInt32LE(offset + 20)
    const uncompressedSize = data.readUInt32LE(offset + 24)
    const fileNameLength = data.readUInt16LE(offset + 28)
    const extraLength = data.readUInt16LE(offset + 30)
    const commentLength = data.readUInt16LE(offset + 32)
    const localHeaderOffset = data.readUInt32LE(offset + 42)
    const name = data.subarray(offset + 46, offset + 46 + fileNameLength).toString('utf8')

    entries.set(name, { name, compression, compressedSize, uncompressedSize, localHeaderOffset })
    offset += 46 + fileNameLength + extraLength + commentLength
  }

  return entries
}

function findEndOfCentralDirectory(data: Buffer): number {
  const minOffset = Math.max(0, data.length - 0xffff - 22)
  for (let i = data.length - 22; i >= minOffset; i--) {
    if (data.readUInt32LE(i) === 0x06054b50) return i
  }
  return -1
}

export function readEntryBuffer(data: Buffer, entries: Map<string, ZipEntry>, name: string): Buffer | null {
  const entry = entries.get(name)
  if (!entry) return null

  const offset = entry.localHeaderOffset
  if (data.readUInt32LE(offset) !== 0x04034b50) return null

  const fileNameLength = data.readUInt16LE(offset + 26)
  const extraLength = data.readUInt16LE(offset + 28)
  const dataStart = offset + 30 + fileNameLength + extraLength
  const compressed = data.subarray(dataStart, dataStart + entry.compressedSize)

  if (entry.compression === 0) return Buffer.from(compressed)
  if (entry.compression === 8) {
    const inflated = zlib.inflateRawSync(compressed, { finishFlush: zlib.constants.Z_SYNC_FLUSH })
    if (entry.uncompressedSize > 0 && inflated.length > entry.uncompressedSize) {
      return inflated.subarray(0, entry.uncompressedSize)
    }
    return inflated
  }

  return null
}

export function readEntryText(data: Buffer, entries: Map<string, ZipEntry>, name: string): string | null {
  const buf = readEntryBuffer(data, entries, name)
  return buf ? TEXT_DECODER.decode(buf) : null
}
