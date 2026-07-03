import fs from 'fs'
import path from 'path'
import axios from 'axios'
import { spawn } from 'child_process'
import { app, shell } from 'electron'
import { downloadFile } from './download'
import { getMinecraftRoot } from './profilePaths'

export interface LaunchProfileInput {
  id: number
  name: string
  game_version?: string | null
  loader?: string | null
}

export interface LaunchProfileOutcome {
  ok: boolean
  versionId?: string | null
  loaderInstalled?: boolean
  launcherOpened?: boolean
  registeredName?: string
  needsLoaderInstall?: boolean
  helpUrl?: string
  warning?: string
  error?: string
}

// Fabric/Quilt는 메타 API가 런처용 버전 JSON을 그대로 제공한다
const LOADER_META: Record<string, { metaBase: string; versionPrefix: string }> = {
  fabric: { metaBase: 'https://meta.fabricmc.net/v2', versionPrefix: 'fabric-loader-' },
  quilt: { metaBase: 'https://meta.quiltmc.org/v3', versionPrefix: 'quilt-loader-' },
}

function compareVersionish(a: string, b: string): number {
  const pa = a.split(/[.+-]/).map((n) => parseInt(n, 10) || 0)
  const pb = b.split(/[.+-]/).map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

// .minecraft/versions에서 프로필(로더+게임버전)에 맞는 설치된 버전 ID 탐색
export function findInstalledVersionId(loader: string | null, gameVersion: string): string | null {
  const versionsDir = path.join(getMinecraftRoot(), 'versions')
  if (!fs.existsSync(versionsDir)) return null

  const dirs = fs.readdirSync(versionsDir)
  const lower = (loader ?? '').toLowerCase()

  if (lower === 'fabric' || lower === 'quilt') {
    const prefix = LOADER_META[lower].versionPrefix
    const suffix = `-${gameVersion}`
    const candidates = dirs.filter((d) => d.startsWith(prefix) && d.endsWith(suffix))
    if (!candidates.length) return null
    // 로더 버전이 가장 높은 것 선택
    return candidates.sort((a, b) =>
      compareVersionish(
        a.slice(prefix.length, a.length - suffix.length),
        b.slice(prefix.length, b.length - suffix.length),
      )
    ).pop()!
  }

  if (lower === 'forge') {
    const candidates = dirs.filter((d) => {
      const dl = d.toLowerCase()
      return dl.includes('forge') && !dl.includes('neoforge') && d.includes(gameVersion)
    })
    return candidates.sort(compareVersionish).pop() ?? null
  }

  if (lower === 'neoforge') {
    // NeoForge 버전 폴더명(neoforge-20.4.237)에는 게임 버전이 없어 접두사로 매칭
    const prefix = neoForgeVersionPrefix(gameVersion)
    const candidates = dirs.filter((d) => {
      const dl = d.toLowerCase()
      if (!dl.startsWith('neoforge-')) return d.toLowerCase().includes('neoforge') && d.includes(gameVersion)
      return prefix ? d.slice('neoforge-'.length).startsWith(prefix) : false
    })
    return candidates.sort(compareVersionish).pop() ?? null
  }

  // 바닐라
  return dirs.includes(gameVersion) ? gameVersion : null
}

// MC 1.20.4 → NeoForge 20.4.x, MC 1.21 → 21.0.x 명명 규칙
function neoForgeVersionPrefix(gameVersion: string): string | null {
  const m = gameVersion.match(/^1\.(\d+)(?:\.(\d+))?$/)
  if (!m) return null
  return `${m[1]}.${m[2] ?? '0'}.`
}

// 버전 JSON만 써주면 공식 런처가 첫 실행 때 라이브러리와 클라이언트를 알아서 내려받는다
export async function installFabricLikeVersion(
  loader: 'fabric' | 'quilt',
  gameVersion: string
): Promise<string> {
  const meta = LOADER_META[loader]

  const { data: loaders } = await axios.get(
    `${meta.metaBase}/versions/loader/${encodeURIComponent(gameVersion)}`,
    { timeout: 15000 }
  )
  if (!Array.isArray(loaders) || loaders.length === 0) {
    throw new Error(`${loader} 로더가 Minecraft ${gameVersion}을(를) 지원하지 않습니다.`)
  }
  const picked = loaders.find((entry: any) => entry.loader?.stable) ?? loaders[0]
  const loaderVersion = picked.loader?.version
  if (!loaderVersion) throw new Error(`${loader} 로더 버전 정보를 읽지 못했습니다.`)

  const { data: profileJson } = await axios.get(
    `${meta.metaBase}/versions/loader/${encodeURIComponent(gameVersion)}/${encodeURIComponent(loaderVersion)}/profile/json`,
    { timeout: 15000 }
  )

  const versionId: string = profileJson.id ?? `${meta.versionPrefix}${loaderVersion}-${gameVersion}`
  const versionDir = path.join(getMinecraftRoot(), 'versions', versionId)
  fs.mkdirSync(versionDir, { recursive: true })
  fs.writeFileSync(path.join(versionDir, `${versionId}.json`), JSON.stringify(profileJson, null, 2), 'utf8')
  console.log(`[Launcher] ${loader} 버전 설치 완료: ${versionId}`)
  return versionId
}

// launcher_profiles.json에 ModForge 프로필 등록/갱신
export function registerLauncherProfile(opts: { key: string; name: string; versionId: string }): void {
  const root = getMinecraftRoot()
  fs.mkdirSync(root, { recursive: true })
  const profilesPath = path.join(root, 'launcher_profiles.json')

  let data: any = {}
  if (fs.existsSync(profilesPath)) {
    try {
      data = JSON.parse(fs.readFileSync(profilesPath, 'utf8'))
    } catch {
      // 파싱 실패 시 덮어쓰면 유저의 기존 런처 설정이 날아가므로 중단
      throw new Error('launcher_profiles.json을 읽을 수 없어 등록을 중단했습니다. 파일이 손상되었는지 확인해 주세요.')
    }
    // 첫 수정 전에 원본을 1회 백업
    const backupPath = `${profilesPath}.modforge-backup`
    if (!fs.existsSync(backupPath)) fs.copyFileSync(profilesPath, backupPath)
  }

  if (typeof data !== 'object' || data === null) data = {}
  if (typeof data.profiles !== 'object' || data.profiles === null) data.profiles = {}

  const now = new Date().toISOString()
  const existing = data.profiles[opts.key] ?? {}
  data.profiles[opts.key] = {
    ...existing,
    name: opts.name,
    type: 'custom',
    created: existing.created ?? now,
    lastUsed: now, // 최근 사용으로 올려 런처 상단에 노출
    lastVersionId: opts.versionId,
    icon: existing.icon ?? 'Crafting_Table',
  }

  fs.writeFileSync(profilesPath, JSON.stringify(data, null, 2), 'utf8')
  console.log(`[Launcher] 런처 프로필 등록: ${opts.name} -> ${opts.versionId}`)
}

// ---------- Java 탐색 ----------

function findFileRecursive(dir: string, fileName: string, maxDepth: number): string | null {
  if (maxDepth < 0 || !fs.existsSync(dir)) return null
  let dirents: fs.Dirent[]
  try {
    dirents = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return null
  }
  for (const entry of dirents) {
    const full = path.join(dir, entry.name)
    if (entry.isFile() && entry.name.toLowerCase() === fileName.toLowerCase()) return full
    if (entry.isDirectory()) {
      const found = findFileRecursive(full, fileName, maxDepth - 1)
      if (found) return found
    }
  }
  return null
}

function trySpawnCheck(cmd: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const child = spawn(cmd, args, { stdio: 'ignore', windowsHide: true })
      child.once('error', () => resolve(false))
      child.once('exit', (code) => resolve(code === 0))
    } catch {
      resolve(false)
    }
  })
}

function javaExeName(): string {
  return process.platform === 'win32' ? 'java.exe' : 'java'
}

function getRuntimeRoots(): string[] {
  // 공식 런처가 내려받은 번들 런타임 (별도 Java 설치 없이도 사용 가능)
  return process.platform === 'win32'
    ? [
        path.join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Minecraft Launcher', 'runtime'),
        path.join(process.env.LOCALAPPDATA ?? '', 'Packages', 'Microsoft.4297127D64EC6_8wekyb3d8bbwe', 'LocalCache', 'Local', 'runtime'),
        path.join(getMinecraftRoot(), 'runtime'),
      ]
    : [path.join(getMinecraftRoot(), 'runtime')]
}

// 런타임 폴더명 → 대략적인 Java 메이저 버전
const RUNTIME_MAJORS: Record<string, number> = {
  'jre-legacy': 8,
  'java-runtime-alpha': 16,
  'java-runtime-beta': 17,
  'java-runtime-gamma': 17,
  'java-runtime-delta': 21,
}

function listBundledRuntimes(): { name: string; exe: string }[] {
  const results: { name: string; exe: string }[] = []
  for (const root of getRuntimeRoots()) {
    if (!fs.existsSync(root)) continue
    let names: string[]
    try {
      names = fs.readdirSync(root)
    } catch {
      continue
    }
    for (const name of names) {
      const exe = findFileRecursive(path.join(root, name), javaExeName(), 5)
      if (exe) results.push({ name, exe })
    }
  }
  return results
}

// `java -version` 출력에서 메이저 버전 파싱 (1.8.0 → 8)
export function getJavaMajor(exe: string): Promise<number | null> {
  return new Promise((resolve) => {
    try {
      const child = spawn(exe, ['-version'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
      let output = ''
      child.stdout?.on('data', (d) => (output += d))
      child.stderr?.on('data', (d) => (output += d))
      child.once('error', () => resolve(null))
      child.once('exit', () => {
        const m = output.match(/version "(\d+)(?:\.(\d+))?/)
        if (!m) return resolve(null)
        const major = parseInt(m[1], 10) === 1 ? parseInt(m[2] ?? '8', 10) : parseInt(m[1], 10)
        resolve(Number.isFinite(major) ? major : null)
      })
    } catch {
      resolve(null)
    }
  })
}

// JAVA_HOME → 번들 런타임(최신 우선) → PATH (설치기 실행 등 버전 무관 용도)
export async function findJavaExecutable(): Promise<string | null> {
  const javaHome = process.env.JAVA_HOME
  if (javaHome) {
    const candidate = path.join(javaHome, 'bin', javaExeName())
    if (fs.existsSync(candidate)) return candidate
  }

  const bundled = listBundledRuntimes().sort(
    (a, b) => (RUNTIME_MAJORS[b.name] ?? 0) - (RUNTIME_MAJORS[a.name] ?? 0)
  )
  if (bundled.length) return bundled[0].exe

  if (await trySpawnCheck('java', ['-version'])) return 'java'
  return null
}

// 요구 메이저 버전을 충족하는 Java 탐색 (게임 실행용).
// 요구를 충족하는 번들 중 가장 낮은 버전을 선호 — 구버전 MC는 높은 Java에서 깨진다.
export async function findJavaForVersion(
  requiredMajor?: number
): Promise<{ path: string; major: number | null } | null> {
  const bundled = listBundledRuntimes()
  const satisfying = bundled
    .filter((b) => !requiredMajor || (RUNTIME_MAJORS[b.name] ?? 0) >= requiredMajor)
    .sort((a, b) => (RUNTIME_MAJORS[a.name] ?? 99) - (RUNTIME_MAJORS[b.name] ?? 99))

  const candidates: string[] = [...satisfying.map((b) => b.exe)]
  const javaHome = process.env.JAVA_HOME
  if (javaHome) candidates.push(path.join(javaHome, 'bin', javaExeName()))
  candidates.push('java')
  candidates.push(...bundled.map((b) => b.exe)) // 마지막 수단

  const tried = new Set<string>()
  for (const candidate of candidates) {
    if (tried.has(candidate)) continue
    tried.add(candidate)
    if (candidate !== 'java' && !fs.existsSync(candidate)) continue
    const major = await getJavaMajor(candidate)
    if (major == null) continue
    if (!requiredMajor || major >= requiredMajor) return { path: candidate, major }
  }
  return null
}

// ---------- Forge 자동 설치 ----------

async function getForgePromotedVersion(gameVersion: string): Promise<string | null> {
  const { data } = await axios.get(
    'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json',
    { timeout: 15000 }
  )
  const promos = data?.promos ?? {}
  return promos[`${gameVersion}-recommended`] ?? promos[`${gameVersion}-latest`] ?? null
}

function runInstaller(javaPath: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(javaPath, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    let lastLines: string[] = []
    const capture = (buf: Buffer) => {
      const lines = buf.toString().split(/\r?\n/).filter(Boolean)
      lastLines = lastLines.concat(lines).slice(-12)
    }
    child.stdout?.on('data', capture)
    child.stderr?.on('data', capture)
    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`설치기가 코드 ${code}로 종료되었습니다: ${lastLines.slice(-3).join(' / ')}`))
    })
  })
}

// 설치기 jar 기반 로더 공통 설치 절차: Java 확보 → 설치기 다운로드 → headless 실행 → 검증
async function installViaInstallerJar(opts: {
  label: string
  loader: string
  gameVersion: string
  installerUrl: string
  installerFileName: string
  onStage?: (message: string) => void
}): Promise<string> {
  const javaPath = await findJavaExecutable()
  if (!javaPath) {
    throw new Error('Java를 찾을 수 없습니다. 공식 런처로 게임을 한 번 실행해 번들 Java를 받거나, Java 17+를 설치해 주세요.')
  }

  const installerDir = path.join(app.getPath('userData'), 'installers')
  fs.mkdirSync(installerDir, { recursive: true })
  const installerPath = path.join(installerDir, opts.installerFileName)

  opts.onStage?.(`${opts.label} 설치 프로그램 다운로드 중...`)
  if (!fs.existsSync(installerPath)) {
    await downloadFile(opts.installerUrl, installerPath)
  }

  const minecraftRoot = getMinecraftRoot()
  fs.mkdirSync(minecraftRoot, { recursive: true })
  // Forge 계열 설치기는 launcher_profiles.json이 없으면 설치를 거부하므로 최소 형태로 보장
  const launcherProfiles = path.join(minecraftRoot, 'launcher_profiles.json')
  if (!fs.existsSync(launcherProfiles)) {
    fs.writeFileSync(launcherProfiles, JSON.stringify({ profiles: {} }, null, 2), 'utf8')
  }

  opts.onStage?.(`${opts.label} 설치 중... (라이브러리 다운로드 때문에 몇 분 걸릴 수 있습니다)`)
  await runInstaller(javaPath, ['-jar', installerPath, '--installClient', minecraftRoot])

  const versionId = findInstalledVersionId(opts.loader, opts.gameVersion)
  if (!versionId) {
    throw new Error(`설치기가 종료됐지만 ${opts.label} 버전이 발견되지 않았습니다. 설치기를 직접 실행해 확인해 주세요.`)
  }
  console.log(`[Launcher] ${opts.label} 설치 완료: ${versionId}`)
  return versionId
}

// Forge 설치기를 내려받아 headless(--installClient)로 실행한다
export async function installForge(gameVersion: string, onStage?: (message: string) => void): Promise<string> {
  onStage?.('Forge 버전 정보를 확인하는 중...')
  const forgeVersion = await getForgePromotedVersion(gameVersion)
  if (!forgeVersion) {
    throw new Error(`Minecraft ${gameVersion}용 Forge 버전을 찾지 못했습니다.`)
  }

  const fullVersion = `${gameVersion}-${forgeVersion}`
  return installViaInstallerJar({
    label: `Forge ${forgeVersion}`,
    loader: 'forge',
    gameVersion,
    installerUrl: `https://maven.minecraftforge.net/net/minecraftforge/forge/${fullVersion}/forge-${fullVersion}-installer.jar`,
    installerFileName: `forge-${fullVersion}-installer.jar`,
    onStage,
  })
}

// NeoForge 설치기를 내려받아 headless(--installClient)로 실행한다
export async function installNeoForge(gameVersion: string, onStage?: (message: string) => void): Promise<string> {
  onStage?.('NeoForge 버전 정보를 확인하는 중...')
  const prefix = neoForgeVersionPrefix(gameVersion)
  if (!prefix) {
    throw new Error(`게임 버전 형식을 해석할 수 없습니다: ${gameVersion}`)
  }

  const { data } = await axios.get(
    'https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge',
    { timeout: 15000 }
  )
  const versions: string[] = Array.isArray(data?.versions) ? data.versions : []
  const matching = versions.filter((v) => v.startsWith(prefix))
  if (!matching.length) {
    throw new Error(`Minecraft ${gameVersion}용 NeoForge 버전을 찾지 못했습니다.`)
  }
  // 정식 릴리스를 우선하고, 없으면 베타 중 최신
  const stable = matching.filter((v) => !v.toLowerCase().includes('beta'))
  const pool = stable.length ? stable : matching
  const neoVersion = pool.sort(compareVersionish).pop()!

  return installViaInstallerJar({
    label: `NeoForge ${neoVersion}`,
    loader: 'neoforge',
    gameVersion,
    installerUrl: `https://maven.neoforged.net/releases/net/neoforged/neoforge/${neoVersion}/neoforge-${neoVersion}-installer.jar`,
    installerFileName: `neoforge-${neoVersion}-installer.jar`,
    onStage,
  })
}

function trySpawnDetached(cmd: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const child = spawn(cmd, args, { detached: true, stdio: 'ignore' })
      child.once('error', () => resolve(false))
      // 곧바로 error 이벤트가 오지 않으면 성공으로 간주
      setTimeout(() => {
        child.unref()
        resolve(true)
      }, 300)
    } catch {
      resolve(false)
    }
  })
}

export async function openMinecraftLauncher(): Promise<boolean> {
  if (process.platform === 'win32') {
    const candidates = [
      path.join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Minecraft Launcher', 'MinecraftLauncher.exe'),
      path.join(process.env['ProgramFiles'] ?? 'C:\\Program Files', 'Minecraft Launcher', 'MinecraftLauncher.exe'),
    ]
    for (const exe of candidates) {
      if (fs.existsSync(exe) && (await trySpawnDetached(exe, []))) return true
    }
    // Microsoft Store 설치판
    return trySpawnDetached('explorer.exe', ['shell:AppsFolder\\Microsoft.4297127D64EC6_8wekyb3d8bbwe!Minecraft'])
  }

  if (process.platform === 'darwin') {
    const result = await shell.openPath('/Applications/Minecraft.app')
    return result === ''
  }

  return trySpawnDetached('minecraft-launcher', [])
}

export interface EnsureVersionResult {
  ok: boolean
  versionId?: string
  loaderInstalled?: boolean
  needsLoaderInstall?: boolean
  helpUrl?: string
  error?: string
}

// 프로필(게임 버전+로더)에 맞는 버전 ID를 확보한다. 없으면 로더를 자동 설치.
// 실행(launch)과 게임 파일 준비(prepare-game-files) 양쪽에서 사용.
export async function resolveOrInstallVersion(
  gameVersion: string | null | undefined,
  loaderRaw: string | null | undefined,
  onStage?: (message: string) => void
): Promise<EnsureVersionResult> {
  if (!gameVersion) return { ok: false, error: '프로필에 게임 버전이 설정되어 있지 않습니다.' }

  const loader = (loaderRaw ?? '').toLowerCase()
  let versionId = findInstalledVersionId(loader || null, gameVersion)
  let loaderInstalled = false

  if (!versionId) {
    if (loader === 'fabric' || loader === 'quilt') {
      onStage?.(`${loaderRaw} 로더 설치 중...`)
      versionId = await installFabricLikeVersion(loader, gameVersion)
      loaderInstalled = true
    } else if (loader === 'forge') {
      try {
        versionId = await installForge(gameVersion, onStage)
        loaderInstalled = true
      } catch (err: any) {
        return {
          ok: false,
          needsLoaderInstall: true,
          helpUrl: `https://files.minecraftforge.net/net/minecraftforge/forge/index_${gameVersion}.html`,
          error: `Forge 자동 설치에 실패했습니다: ${err.message}`,
        }
      }
    } else if (loader === 'neoforge') {
      try {
        versionId = await installNeoForge(gameVersion, onStage)
        loaderInstalled = true
      } catch (err: any) {
        return {
          ok: false,
          needsLoaderInstall: true,
          helpUrl: 'https://neoforged.net/',
          error: `NeoForge 자동 설치에 실패했습니다: ${err.message}`,
        }
      }
    } else {
      // 바닐라는 공식 런처가 버전 ID만으로 알아서 내려받는다
      versionId = gameVersion
    }
  }

  return { ok: true, versionId, loaderInstalled }
}

// 프로필 실행 오케스트레이션: 버전 확보 → 런처 프로필 등록 → 런처 실행
export async function launchMinecraftProfile(
  profile: LaunchProfileInput,
  onStage?: (message: string) => void
): Promise<LaunchProfileOutcome> {
  const ensured = await resolveOrInstallVersion(profile.game_version, profile.loader, onStage)
  if (!ensured.ok) {
    return {
      ok: false,
      needsLoaderInstall: ensured.needsLoaderInstall,
      helpUrl: ensured.helpUrl,
      error: ensured.error,
    }
  }
  const versionId = ensured.versionId!
  const loaderInstalled = Boolean(ensured.loaderInstalled)

  onStage?.('공식 런처에 프로필 등록 중...')

  const registeredName = `${profile.name} · ModForge`
  registerLauncherProfile({ key: `modforge-${profile.id}`, name: registeredName, versionId })

  const launcherOpened = await openMinecraftLauncher()

  return {
    ok: true,
    versionId,
    loaderInstalled,
    launcherOpened,
    registeredName,
    warning: launcherOpened
      ? undefined
      : 'Minecraft 런처를 자동으로 찾지 못했습니다. 런처를 직접 실행하면 프로필이 등록되어 있습니다.',
  }
}
