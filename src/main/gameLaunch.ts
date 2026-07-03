import fs from 'fs'
import path from 'path'
import { spawn, ChildProcess } from 'child_process'
import { getSetting } from './db'
import { getMinecraftRoot } from './profilePaths'
import { getValidSession, getOfflineSession } from './auth'
import { resolveOrInstallVersion, findJavaForVersion } from './launcher'
import {
  ensureGameFiles,
  resolveVersionChain,
  ruleAllows,
  mavenToPath,
  currentOsName,
} from './gameFiles'
import type { GameFilesProgress, VersionJson } from './gameFiles'
import { readZipEntries, readEntryBuffer } from './zip'

// 자체 실행 3단계: 공식 런처 없이 게임 프로세스를 직접 띄운다.
// natives 추출 → 클래스패스 조립 → 인자 구성(치환) → Java 선택 → spawn

export interface GameExitInfo {
  code: number | null
  crashed: boolean
  crashReportPath: string | null
  crashSummary: string | null
}

export interface GameLaunchCallbacks {
  onStage?: (message: string) => void
  onFilesProgress?: (p: GameFilesProgress) => void
  onLog?: (line: string) => void
  onExit?: (info: GameExitInfo) => void
}

export interface GameLaunchOutcome {
  ok: boolean
  pid?: number
  versionId?: string
  javaMajor?: number | null
  offline?: boolean
  needsLogin?: boolean
  needsLoaderInstall?: boolean
  helpUrl?: string
  error?: string
}

interface RunningGame {
  child: ChildProcess
  stoppedByUser: boolean
}

const runningGames = new Map<number, RunningGame>()

export function isGameRunning(profileId: number): boolean {
  return runningGames.has(profileId)
}

export function stopGame(profileId: number): boolean {
  const entry = runningGames.get(profileId)
  if (!entry) return false
  // 강제 종료도 비정상 코드로 끝나므로, 크래시로 오인하지 않게 표시
  entry.stoppedByUser = true
  entry.child.kill()
  return true
}

// ---------- 크래시 감지 ----------

function extractCrashSummary(filePath: string): string | null {
  try {
    const head = fs.readFileSync(filePath, 'utf8').slice(0, 4000).split(/\r?\n/)
    const description = head
      .find((line) => line.startsWith('Description:'))
      ?.slice('Description:'.length)
      .trim()
    const exception = head
      .map((line) => line.trim())
      .find((line) => /^[\w.$]+(Exception|Error|Throwable)(:|$)/.test(line))
    const parts = [description, exception].filter(Boolean) as string[]
    return parts.length ? parts.join(' — ').slice(0, 300) : null
  } catch {
    return null
  }
}

// 실행 시작 이후 생성된 크래시 증거를 찾는다 (모드 크래시 리포트 → JVM 하드 크래시 순)
function findCrashEvidence(root: string, startedAt: number): { path: string | null; summary: string | null } {
  try {
    const reportsDir = path.join(root, 'crash-reports')
    if (fs.existsSync(reportsDir)) {
      const candidates = fs.readdirSync(reportsDir)
        .filter((f) => f.startsWith('crash-') && f.endsWith('.txt'))
        .map((f) => {
          const full = path.join(reportsDir, f)
          return { full, mtime: fs.statSync(full).mtimeMs }
        })
        .filter((entry) => entry.mtime >= startedAt - 5000)
        .sort((a, b) => b.mtime - a.mtime)
      if (candidates.length) {
        return { path: candidates[0].full, summary: extractCrashSummary(candidates[0].full) }
      }
    }
  } catch {
    // 무시
  }

  try {
    const candidates = fs.readdirSync(root)
      .filter((f) => f.startsWith('hs_err_pid') && f.endsWith('.log'))
      .map((f) => {
        const full = path.join(root, f)
        return { full, mtime: fs.statSync(full).mtimeMs }
      })
      .filter((entry) => entry.mtime >= startedAt - 5000)
      .sort((a, b) => b.mtime - a.mtime)
    if (candidates.length) {
      return { path: candidates[0].full, summary: 'JVM이 네이티브 수준에서 하드 크래시했습니다 (드라이버/메모리 문제 가능성).' }
    }
  } catch {
    // 무시
  }

  return { path: null, summary: null }
}

// ---------- natives 추출 (구형 classifiers 형식) ----------

function stripExtension(name: string): string {
  const atIdx = name.indexOf('@')
  return atIdx >= 0 ? name.slice(0, atIdx) : name
}

function extractNatives(chain: VersionJson[], root: string, nativesDir: string): number {
  try {
    fs.rmSync(nativesDir, { recursive: true, force: true })
  } catch {
    // 이전 프로세스가 점유 중이면 그대로 재사용
  }
  fs.mkdirSync(nativesDir, { recursive: true })

  const os = currentOsName()
  let count = 0

  for (const json of chain) {
    for (const lib of json.libraries ?? []) {
      if (!ruleAllows(lib.rules)) continue
      const keyTemplate = lib.natives?.[os]
      if (!keyTemplate || !lib.downloads?.classifiers) continue

      const key = String(keyTemplate).replace('${arch}', process.arch.includes('64') ? '64' : '32')
      const cls = lib.downloads.classifiers[key]
      const relPath = cls?.path ?? (lib.name ? mavenToPath(`${stripExtension(lib.name)}:${key}`) : null)
      if (!relPath) continue

      const jarPath = path.join(root, 'libraries', relPath)
      if (!fs.existsSync(jarPath)) continue

      const data = fs.readFileSync(jarPath)
      const entries = readZipEntries(data)
      const exclude: string[] = lib.extract?.exclude ?? ['META-INF/']

      for (const entryName of entries.keys()) {
        if (entryName.endsWith('/')) continue
        if (exclude.some((prefix) => entryName.startsWith(prefix))) continue

        const buf = readEntryBuffer(data, entries, entryName)
        if (!buf) continue

        const dest = path.join(nativesDir, entryName)
        // zip 경로 탈출 방지
        if (!path.resolve(dest).startsWith(path.resolve(nativesDir) + path.sep)) continue

        fs.mkdirSync(path.dirname(dest), { recursive: true })
        fs.writeFileSync(dest, buf)
        count++
      }
    }
  }
  return count
}

// ---------- 클래스패스 ----------

// 같은 라이브러리의 다른 버전이 체인에 겹치면 자식(모드 로더) 쪽을 우선
function classpathDedupeKey(name: string): string {
  const [group, artifact, , classifier] = stripExtension(name).split(':')
  return classifier ? `${group}:${artifact}:${classifier}` : `${group}:${artifact}`
}

function buildClasspath(chain: VersionJson[], root: string, clientJar: string, onWarn?: (msg: string) => void): string[] {
  const seen = new Set<string>()
  const jars: string[] = []

  for (const json of chain) {
    for (const lib of json.libraries ?? []) {
      if (!ruleAllows(lib.rules)) continue
      if (!lib.name && !lib.downloads?.artifact) continue

      const artifact = lib.downloads?.artifact
      let relPath: string | null = null
      if (artifact && (artifact.path || artifact.url)) relPath = artifact.path ?? mavenToPath(lib.name)
      else if (lib.name) relPath = mavenToPath(lib.name)
      if (!relPath) continue

      const key = lib.name ? classpathDedupeKey(lib.name) : relPath
      if (seen.has(key)) continue
      seen.add(key)

      const abs = path.join(root, 'libraries', relPath)
      if (fs.existsSync(abs)) {
        jars.push(abs)
      } else {
        onWarn?.(`클래스패스 라이브러리 누락: ${lib.name ?? relPath}`)
      }
    }
  }

  jars.push(clientJar)
  return jars
}

// ---------- 인자 구성 ----------

function flattenArgEntries(entries: any[]): string[] {
  const out: string[] = []
  for (const entry of entries) {
    if (typeof entry === 'string') {
      out.push(entry)
      continue
    }
    if (entry && typeof entry === 'object') {
      // features 조건이 붙은 규칙(해상도, 데모, 퀵플레이 등)은 전부 비활성으로 취급
      if (!ruleAllows(entry.rules)) continue
      const value = entry.value ?? entry.values
      if (Array.isArray(value)) out.push(...value.map(String))
      else if (value != null) out.push(String(value))
    }
  }
  return out
}

function substituteAll(args: string[], vars: Record<string, string>): string[] {
  return args.map((arg) =>
    arg.replace(/\$\{(\w+)\}/g, (match, key) => (key in vars ? vars[key] : match))
  )
}

function buildArguments(
  chain: VersionJson[],
  vars: Record<string, string>
): { jvmArgs: string[]; gameArgs: string[]; mainClass?: string } {
  const ordered = [...chain].reverse() // 바닐라 → 자식(모드 로더) 순서로 이어붙임
  const jvmRaw: any[] = []
  const gameRaw: any[] = []
  let legacyArgs: string | null = null
  let mainClass: string | undefined

  for (const json of ordered) {
    if (json.arguments?.jvm) jvmRaw.push(...json.arguments.jvm)
    if (json.arguments?.game) gameRaw.push(...json.arguments.game)
    if (json.minecraftArguments) legacyArgs = json.minecraftArguments // 자식이 전체를 덮어씀
    if (json.mainClass) mainClass = json.mainClass
  }

  // 구형 버전은 jvm 인자 정의가 없으므로 기본값 구성
  if (jvmRaw.length === 0) {
    jvmRaw.push('-Djava.library.path=${natives_directory}', '-cp', '${classpath}')
  }

  const jvmArgs = substituteAll(flattenArgEntries(jvmRaw), vars)
  const gameArgs = gameRaw.length
    ? substituteAll(flattenArgEntries(gameRaw), vars)
    : legacyArgs
      ? substituteAll(legacyArgs.split(' ').filter(Boolean), vars)
      : []

  return { jvmArgs, gameArgs, mainClass }
}

// ---------- 메인: 직접 실행 ----------

export async function launchGameDirect(
  profile: { id: number; name: string; game_version?: string | null; loader?: string | null },
  cb: GameLaunchCallbacks = {}
): Promise<GameLaunchOutcome> {
  if (runningGames.has(profile.id)) {
    return { ok: false, error: '이 프로필로 게임이 이미 실행 중입니다.' }
  }

  // 1) 로그인 세션 (정식 세션 우선, 없으면 오프라인 모드 폴백)
  cb.onStage?.('로그인 세션 확인 중...')
  let offline = false
  let session: { accessToken: string; profile: { id: string; name: string } } | null = await getValidSession()
  if (!session) {
    const offlineSession = getOfflineSession()
    if (offlineSession) {
      session = offlineSession
      offline = true
      cb.onLog?.('[알림] 오프라인 모드로 실행합니다. 온라인 서버 접속은 불가능합니다.')
    }
  }
  if (!session) {
    return {
      ok: false,
      needsLogin: true,
      error: 'Microsoft 로그인 또는 오프라인 모드 설정이 필요합니다. 사이드바 계정 메뉴를 확인해 주세요.',
    }
  }

  // 2) 버전(로더) 확보
  const ensured = await resolveOrInstallVersion(profile.game_version, profile.loader, cb.onStage)
  if (!ensured.ok) {
    return { ok: false, needsLoaderInstall: ensured.needsLoaderInstall, helpUrl: ensured.helpUrl, error: ensured.error }
  }
  const versionId = ensured.versionId!

  // 3) 게임 파일 확보
  cb.onStage?.('게임 파일 확인 중...')
  await ensureGameFiles(versionId, cb.onFilesProgress)

  const root = getMinecraftRoot()
  const chain = await resolveVersionChain(versionId)
  const vanilla = chain[chain.length - 1]
  const jarId = chain.find((j) => j.jar)?.jar ?? vanilla.id
  const clientJar = path.join(root, 'versions', jarId, `${jarId}.jar`)

  // 4) natives + 클래스패스 + 인자
  cb.onStage?.('네이티브 라이브러리 준비 중...')
  const nativesDir = path.join(root, 'versions', versionId, 'natives')
  const nativeCount = extractNatives(chain, root, nativesDir)
  if (nativeCount > 0) console.log(`[GameLaunch] natives ${nativeCount}개 추출`)

  cb.onStage?.('실행 인자 구성 중...')
  const cpSeparator = process.platform === 'win32' ? ';' : ':'
  const classpath = buildClasspath(chain, root, clientJar, (msg) => cb.onLog?.(`[경고] ${msg}`))
  const assetIndexId = chain.find((j) => j.assetIndex)?.assetIndex?.id ?? vanilla.assets ?? 'legacy'

  const vars: Record<string, string> = {
    auth_player_name: session.profile.name,
    version_name: versionId,
    game_directory: root,
    assets_root: path.join(root, 'assets'),
    assets_index_name: assetIndexId,
    auth_uuid: session.profile.id,
    auth_access_token: session.accessToken,
    auth_session: session.accessToken,
    auth_xuid: '0',
    clientid: 'modforge',
    user_type: offline ? 'legacy' : 'msa',
    version_type: chain[0].type ?? vanilla.type ?? 'release',
    user_properties: '{}',
    natives_directory: nativesDir,
    launcher_name: 'ModForge',
    launcher_version: '1.0.0',
    classpath: classpath.join(cpSeparator),
    library_directory: path.join(root, 'libraries'),
    classpath_separator: cpSeparator,
  }

  const { jvmArgs, gameArgs, mainClass } = buildArguments(chain, vars)
  if (!mainClass) return { ok: false, error: '버전 JSON에서 mainClass를 찾을 수 없습니다.' }

  // 5) Java 선택
  const requiredMajor = vanilla.javaVersion?.majorVersion
  cb.onStage?.(`Java${requiredMajor ? ` ${requiredMajor}+` : ''} 탐색 중...`)
  const java = await findJavaForVersion(requiredMajor)
  if (!java) {
    return {
      ok: false,
      error: `Java${requiredMajor ? ` ${requiredMajor} 이상` : ''}을 찾을 수 없습니다. 공식 런처로 이 버전을 한 번 실행해 번들 Java를 받거나 Java를 설치해 주세요.`,
    }
  }

  // 6) 실행
  const memoryMb = Math.min(32768, Math.max(1024, parseInt(getSetting('java_memory_mb') ?? '', 10) || 4096))
  const finalArgs = [`-Xmx${memoryMb}M`, ...jvmArgs, mainClass, ...gameArgs]

  cb.onStage?.('게임 프로세스 시작 중...')
  const startedAt = Date.now()
  const child = spawn(java.path, finalArgs, {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  const entry: RunningGame = { child, stoppedByUser: false }
  runningGames.set(profile.id, entry)

  const emitLines = (buf: Buffer) => {
    for (const line of buf.toString().split(/\r?\n/)) {
      const trimmed = line.trimEnd()
      if (trimmed) cb.onLog?.(trimmed.slice(0, 500))
    }
  }
  child.stdout?.on('data', emitLines)
  child.stderr?.on('data', emitLines)

  child.once('exit', (code) => {
    runningGames.delete(profile.id)
    console.log(`[GameLaunch] 게임 종료 (코드 ${code})`)

    const crashed = !entry.stoppedByUser && code !== 0 && code !== null
    const evidence = crashed ? findCrashEvidence(root, startedAt) : { path: null, summary: null }
    cb.onExit?.({
      code,
      crashed,
      crashReportPath: evidence.path,
      crashSummary: evidence.summary,
    })
  })
  child.once('error', (err) => {
    runningGames.delete(profile.id)
    cb.onLog?.(`[프로세스 오류] ${err.message}`)
    cb.onExit?.({ code: -1, crashed: true, crashReportPath: null, crashSummary: err.message })
  })

  console.log(`[GameLaunch] 실행: ${profile.name} → ${versionId} (Java ${java.major}, PID ${child.pid}${offline ? ', 오프라인' : ''})`)
  return { ok: true, pid: child.pid, versionId, javaMajor: java.major, offline }
}
