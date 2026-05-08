import fs from 'fs'
import path from 'path'
import zlib from 'zlib'

export interface ScannedJarMod {
  source: 'jar'
  file_path: string
  file_name: string
  jar_mod_id: string | null
  name: string
  version_number: string | null
  loader: 'fabric' | 'forge' | 'quilt' | 'unknown'
}

interface ZipEntry {
  name: string
  compression: number
  compressedSize: number
  uncompressedSize: number
  localHeaderOffset: number
}

const TEXT_DECODER = new TextDecoder('utf-8')

export function getDefaultModsPath(): string {
  return path.join(process.env.APPDATA ?? process.env.HOME ?? '', '.minecraft', 'mods')
}

export function scanModJars(modsPath = getDefaultModsPath()): ScannedJarMod[] {
  if (!fs.existsSync(modsPath)) return []

  return fs.readdirSync(modsPath)
    .filter((file) => file.toLowerCase().endsWith('.jar'))
    .map((file) => scanJar(path.join(modsPath, file)))
}

function scanJar(filePath: string): ScannedJarMod {
  const fileName = path.basename(filePath)

  try {
    const data = fs.readFileSync(filePath)
    const entries = readZipEntries(data)

    const fabric = readEntryText(data, entries, 'fabric.mod.json')
    if (fabric) return parseFabricLike(fabric, filePath, fileName, 'fabric')

    const quilt = readEntryText(data, entries, 'quilt.mod.json')
    if (quilt) return parseFabricLike(quilt, filePath, fileName, 'quilt')

    const forge = readEntryText(data, entries, 'META-INF/mods.toml')
    if (forge) return parseForgeToml(forge, filePath, fileName)
  } catch (err) {
    console.warn(`[JarScanner] ${fileName} 분석 실패:`, err)
  }

  return {
    source: 'jar',
    file_path: filePath,
    file_name: fileName,
    jar_mod_id: guessIdFromFileName(fileName),
    name: fileName.replace(/\.jar$/i, ''),
    version_number: null,
    loader: 'unknown',
  }
}

function readZipEntries(data: Buffer): Map<string, ZipEntry> {
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

function readEntryText(data: Buffer, entries: Map<string, ZipEntry>, name: string): string | null {
  const entry = entries.get(name)
  if (!entry) return null

  const offset = entry.localHeaderOffset
  if (data.readUInt32LE(offset) !== 0x04034b50) return null

  const fileNameLength = data.readUInt16LE(offset + 26)
  const extraLength = data.readUInt16LE(offset + 28)
  const dataStart = offset + 30 + fileNameLength + extraLength
  const compressed = data.subarray(dataStart, dataStart + entry.compressedSize)

  if (entry.compression === 0) return TEXT_DECODER.decode(compressed)
  if (entry.compression === 8) {
    const inflated = zlib.inflateRawSync(compressed, { finishFlush: zlib.constants.Z_SYNC_FLUSH })
    if (entry.uncompressedSize > 0 && inflated.length > entry.uncompressedSize) {
      return TEXT_DECODER.decode(inflated.subarray(0, entry.uncompressedSize))
    }
    return TEXT_DECODER.decode(inflated)
  }

  return null
}

function parseFabricLike(text: string, filePath: string, fileName: string, loader: 'fabric' | 'quilt'): ScannedJarMod {
  try {
    const meta = JSON.parse(text)
    const quiltMeta = meta.quilt_loader ?? meta
    const jarModId = String(quiltMeta.id ?? meta.id ?? guessIdFromFileName(fileName))
    const name = String(quiltMeta.metadata?.name ?? meta.name ?? jarModId ?? fileName)
    const version = quiltMeta.version ?? meta.version

    return {
      source: 'jar',
      file_path: filePath,
      file_name: fileName,
      jar_mod_id: jarModId,
      name,
      version_number: version ? String(version) : null,
      loader,
    }
  } catch {
    return fallback(filePath, fileName, loader)
  }
}

function parseForgeToml(text: string, filePath: string, fileName: string): ScannedJarMod {
  const firstModBlock = text.match(/\[\[mods\]\]([\s\S]*?)(?:\n\[\[|\n\[|$)/)
  const block = firstModBlock?.[1] ?? text
  const jarModId = readTomlString(block, 'modId') ?? guessIdFromFileName(fileName)
  const name = readTomlString(block, 'displayName') ?? jarModId ?? fileName.replace(/\.jar$/i, '')
  const version = readTomlString(block, 'version')

  return {
    source: 'jar',
    file_path: filePath,
    file_name: fileName,
    jar_mod_id: jarModId,
    name,
    version_number: version,
    loader: 'forge',
  }
}

function readTomlString(text: string, key: string): string | null {
  const match = text.match(new RegExp(`^\\s*${key}\\s*=\\s*["']?([^"'\\n]+)["']?`, 'm'))
  return match?.[1]?.trim() ?? null
}

function fallback(filePath: string, fileName: string, loader: ScannedJarMod['loader']): ScannedJarMod {
  const jarModId = guessIdFromFileName(fileName)
  return {
    source: 'jar',
    file_path: filePath,
    file_name: fileName,
    jar_mod_id: jarModId,
    name: jarModId ?? fileName.replace(/\.jar$/i, ''),
    version_number: null,
    loader,
  }
}

function guessIdFromFileName(fileName: string): string | null {
  const base = fileName
    .replace(/\.jar$/i, '')
    .replace(/[-_]?mc\d+(?:\.\d+){1,3}/gi, '')
    .replace(/[-_]?\d+(?:\.\d+){1,4}.*$/i, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()

  return base || null
}
