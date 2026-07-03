import fs from 'fs'
import path from 'path'
import { readZipEntries, readEntryText } from './zip'

export interface ScannedJarMod {
  source: 'jar'
  file_path: string
  file_name: string
  jar_mod_id: string | null
  name: string
  version_number: string | null
  loader: 'fabric' | 'forge' | 'quilt' | 'unknown'
}

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
  // mods.toml은 종종 version="${file.jarVersion}" 같은 미치환 플레이스홀더를 담고 있음
  const rawVersion = readTomlString(block, 'version')
  const version = rawVersion && !rawVersion.includes('${') ? rawVersion : null

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
