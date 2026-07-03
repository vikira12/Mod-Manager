import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import axios from 'axios'
import { downloadFile } from './download'
import { getMinecraftRoot } from './profilePaths'

// 자체 실행 2단계: 게임 파일 준비
// 버전 JSON 체인(inheritsFrom) 해석 → 클라이언트 jar / 라이브러리 / 에셋을
// sha1 검증과 병렬 다운로드로 확보한다.

const VERSION_MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'
const RESOURCES_BASE = 'https://resources.download.minecraft.net'
const MOJANG_LIBRARIES_BASE = 'https://libraries.minecraft.net/'

export interface GameFilesProgress {
  phase: 'client' | 'libraries' | 'assets'
  done: number
  total: number
  name: string
}

export interface GameFilesResult {
  versionId: string
  jarId: string
  clientDownloaded: boolean
  librariesTotal: number
  librariesDownloaded: number
  librariesMissing: number
  assetsTotal: number
  assetsDownloaded: number
  assetsFailed: number
}

interface Rule {
  action: 'allow' | 'disallow'
  os?: { name?: string; arch?: string }
  features?: Record<string, boolean>
}

export interface VersionJson {
  id: string
  inheritsFrom?: string
  jar?: string
  mainClass?: string
  assets?: string
  assetIndex?: { id: string; url: string; sha1?: string; totalSize?: number }
  downloads?: { client?: { url: string; sha1?: string; size?: number } }
  libraries?: any[]
  arguments?: { game?: any[]; jvm?: any[] }
  minecraftArguments?: string
  javaVersion?: { component?: string; majorVersion?: number }
  type?: string
}

// ---------- 공용 유틸 ----------

function sha1File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha1')
    const stream = fs.createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

// 파일이 이미 유효하면 건너뛰고, 아니면 내려받는다. 실제로 다운로드했으면 true.
async function ensureFile(
  url: string,
  dest: string,
  expectedSha1?: string | null,
  expectedSize?: number | null,
  verifyHashOfExisting = true
): Promise<boolean> {
  if (fs.existsSync(dest)) {
    const stat = fs.statSync(dest)
    const sizeOk = expectedSize == null || stat.size === expectedSize
    if (sizeOk) {
      if (!expectedSha1 || !verifyHashOfExisting) return false
      if ((await sha1File(dest)) === expectedSha1) return false
    }
  }

  fs.mkdirSync(path.dirname(dest), { recursive: true })
  await downloadFile(url, dest)

  if (expectedSha1) {
    const actual = await sha1File(dest)
    if (actual !== expectedSha1) {
      fs.rmSync(dest, { force: true })
      throw new Error(`해시 불일치: ${path.basename(dest)}`)
    }
  }
  return true
}

async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const size = Math.max(1, Math.min(limit, items.length))
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (true) {
        const idx = next++
        if (idx >= items.length) return
        await worker(items[idx])
      }
    })
  )
}

function readJson(filePath: string): any | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

// ---------- 버전 JSON ----------

async function loadVersionJson(versionId: string): Promise<VersionJson> {
  const jsonPath = path.join(getMinecraftRoot(), 'versions', versionId, `${versionId}.json`)
  const local = readJson(jsonPath)
  if (local) return local as VersionJson

  // 로컬에 없으면 바닐라 매니페스트에서 다운로드 (모드 로더 버전은 로컬에만 존재)
  const { data: manifest } = await axios.get(VERSION_MANIFEST_URL, { timeout: 20000 })
  const entry = (manifest.versions ?? []).find((v: any) => v.id === versionId)
  if (!entry) throw new Error(`버전 정보를 찾을 수 없습니다: ${versionId}`)

  await ensureFile(entry.url, jsonPath, entry.sha1 ?? null)
  const downloaded = readJson(jsonPath)
  if (!downloaded) throw new Error(`버전 JSON을 읽지 못했습니다: ${versionId}`)
  return downloaded as VersionJson
}

// [자식(모드 로더), ..., 루트(바닐라)] 순서의 체인
export async function resolveVersionChain(versionId: string): Promise<VersionJson[]> {
  const chain: VersionJson[] = []
  let current: string | undefined = versionId
  for (let depth = 0; current && depth < 6; depth++) {
    const json = await loadVersionJson(current)
    chain.push(json)
    current = json.inheritsFrom
  }
  return chain
}

// ---------- 라이브러리 ----------

export function currentOsName(): string {
  if (process.platform === 'win32') return 'windows'
  if (process.platform === 'darwin') return 'osx'
  return 'linux'
}

export function ruleAllows(rules?: Rule[]): boolean {
  if (!rules || rules.length === 0) return true
  const os = currentOsName()
  const arch = process.arch === 'ia32' ? 'x86' : process.arch

  let allowed = false
  for (const rule of rules) {
    // features 조건이 붙은 규칙은 다운로드 판단에서 매칭하지 않음
    if (rule.features) continue
    const osMatch =
      (!rule.os?.name || rule.os.name === os) &&
      (!rule.os?.arch || rule.os.arch === arch)
    if (osMatch) allowed = rule.action === 'allow'
  }
  return allowed
}

// group:artifact:version[:classifier][@ext] → 메이븐 경로
export function mavenToPath(name: string): string {
  let ext = 'jar'
  let coords = name
  const atIdx = name.indexOf('@')
  if (atIdx >= 0) {
    ext = name.slice(atIdx + 1)
    coords = name.slice(0, atIdx)
  }
  const [group, artifact, version, classifier] = coords.split(':')
  const file = `${artifact}-${version}${classifier ? `-${classifier}` : ''}.${ext}`
  return `${group.replace(/\./g, '/')}/${artifact}/${version}/${file}`
}

interface LibDownload {
  url: string | null
  relPath: string
  sha1: string | null
  size: number | null
  name: string
}

function collectLibraryDownloads(chain: VersionJson[]): LibDownload[] {
  const map = new Map<string, LibDownload>()
  const os = currentOsName()

  for (const json of chain) {
    for (const lib of json.libraries ?? []) {
      if (!ruleAllows(lib.rules)) continue

      const artifact = lib.downloads?.artifact
      if (artifact && (artifact.path || artifact.url)) {
        // 바닐라/Forge 형식: downloads.artifact에 경로·URL·해시가 전부 있음
        const relPath = artifact.path ?? mavenToPath(lib.name)
        if (!map.has(relPath)) {
          map.set(relPath, {
            url: artifact.url || null, // Forge 프로세서 산출물은 url이 빈 문자열
            relPath,
            sha1: artifact.sha1 ?? null,
            size: artifact.size ?? null,
            name: lib.name,
          })
        }
      } else if (lib.name) {
        // Fabric/Quilt 형식: name + 메이븐 베이스 URL
        const relPath = mavenToPath(lib.name)
        const base = typeof lib.url === 'string' && lib.url
          ? (lib.url.endsWith('/') ? lib.url : `${lib.url}/`)
          : MOJANG_LIBRARIES_BASE
        if (!map.has(relPath)) {
          map.set(relPath, {
            url: base + relPath,
            relPath,
            sha1: lib.sha1 ?? null,
            size: lib.size ?? null,
            name: lib.name,
          })
        }
      }

      // 구형 natives(classifiers) 형식 지원
      const nativeKeyTemplate = lib.natives?.[os]
      if (nativeKeyTemplate && lib.downloads?.classifiers) {
        const nativeKey = String(nativeKeyTemplate).replace('${arch}', process.arch.includes('64') ? '64' : '32')
        const cls = lib.downloads.classifiers[nativeKey]
        if (cls?.url) {
          const relPath = cls.path ?? mavenToPath(`${lib.name}:${nativeKey}`)
          if (!map.has(relPath)) {
            map.set(relPath, {
              url: cls.url,
              relPath,
              sha1: cls.sha1 ?? null,
              size: cls.size ?? null,
              name: `${lib.name} (${nativeKey})`,
            })
          }
        }
      }
    }
  }

  return [...map.values()]
}

// ---------- 메인: 게임 파일 준비 ----------

export async function ensureGameFiles(
  versionId: string,
  onProgress?: (p: GameFilesProgress) => void
): Promise<GameFilesResult> {
  const root = getMinecraftRoot()
  const chain = await resolveVersionChain(versionId)
  const vanilla = chain[chain.length - 1]

  // 1) 클라이언트 jar (상속 체인에서 jar 지정이 있으면 그쪽을 따른다)
  const jarId = chain.find((j) => j.jar)?.jar ?? vanilla.id
  const clientInfo = chain.find((j) => j.downloads?.client)?.downloads?.client
  let clientDownloaded = false
  if (clientInfo?.url) {
    onProgress?.({ phase: 'client', done: 0, total: 1, name: `${jarId}.jar` })
    clientDownloaded = await ensureFile(
      clientInfo.url,
      path.join(root, 'versions', jarId, `${jarId}.jar`),
      clientInfo.sha1 ?? null,
      clientInfo.size ?? null
    )
    onProgress?.({ phase: 'client', done: 1, total: 1, name: `${jarId}.jar` })
  }

  // 2) 라이브러리
  const libs = collectLibraryDownloads(chain)
  let librariesDownloaded = 0
  let librariesMissing = 0
  let libsDone = 0

  await runPool(libs, 6, async (lib) => {
    const dest = path.join(root, 'libraries', lib.relPath)
    try {
      if (lib.url) {
        if (await ensureFile(lib.url, dest, lib.sha1, lib.size)) librariesDownloaded++
      } else if (!fs.existsSync(dest)) {
        // Forge 설치기가 생성해야 하는 파일(url 없음)이 없는 경우
        librariesMissing++
        console.warn(`[GameFiles] URL 없는 라이브러리 누락: ${lib.name}`)
      }
    } catch (err: any) {
      librariesMissing++
      console.warn(`[GameFiles] 라이브러리 다운로드 실패: ${lib.name}:`, err.message)
    } finally {
      libsDone++
      onProgress?.({ phase: 'libraries', done: libsDone, total: libs.length, name: lib.name })
    }
  })

  // 3) 에셋
  const assetIndexInfo = chain.find((j) => j.assetIndex)?.assetIndex
  let assetsTotal = 0
  let assetsDownloaded = 0
  let assetsFailed = 0

  if (assetIndexInfo?.url) {
    const indexPath = path.join(root, 'assets', 'indexes', `${assetIndexInfo.id}.json`)
    await ensureFile(assetIndexInfo.url, indexPath, assetIndexInfo.sha1 ?? null)

    const index = readJson(indexPath)
    const objects = Object.entries<any>(index?.objects ?? {})
    assetsTotal = objects.length

    // 존재+크기만 검사해 받을 목록을 추린다 (수천 개 전부 해시 검사는 과함)
    const missing = objects.filter(([, obj]) => {
      const objPath = path.join(root, 'assets', 'objects', String(obj.hash).slice(0, 2), String(obj.hash))
      try {
        return fs.statSync(objPath).size !== obj.size
      } catch {
        return true
      }
    })

    let done = 0
    await runPool(missing, 12, async ([assetName, obj]) => {
      const hash = String(obj.hash)
      const dest = path.join(root, 'assets', 'objects', hash.slice(0, 2), hash)
      try {
        await ensureFile(`${RESOURCES_BASE}/${hash.slice(0, 2)}/${hash}`, dest, hash, obj.size, false)
        assetsDownloaded++
      } catch (err: any) {
        assetsFailed++
        console.warn(`[GameFiles] 에셋 다운로드 실패: ${assetName}:`, err.message)
      } finally {
        done++
        if (done % 20 === 0 || done === missing.length) {
          onProgress?.({ phase: 'assets', done, total: missing.length, name: String(assetName) })
        }
      }
    })
  }

  return {
    versionId,
    jarId,
    clientDownloaded,
    librariesTotal: libs.length,
    librariesDownloaded,
    librariesMissing,
    assetsTotal,
    assetsDownloaded,
    assetsFailed,
  }
}
