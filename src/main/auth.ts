import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import axios from 'axios'
import { app, safeStorage } from 'electron'
import { getSetting, setSetting } from './db'

// Microsoft 계정(MSA) 인증 — Device Code Flow
//
// 토큰 체인: MS OAuth → Xbox Live(XBL) → XSTS → Minecraft 서비스 토큰 → 프로필
// 주의: Azure에 앱을 등록해 Client ID를 받아야 하며(무료),
// Minecraft API 사용은 Mojang 승인(https://aka.ms/mce-reviewappid)이 필요하다.

const TENANT = 'consumers' // 개인 Microsoft 계정 전용
const OAUTH_BASE = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0`
const SCOPE = 'XboxLive.signin offline_access'
const CLIENT_ID_SETTING_KEY = 'msa_client_id'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export interface DeviceCodeInfo {
  user_code: string
  verification_uri: string
  expires_in: number
  interval: number
  message: string
}

export interface McProfile {
  id: string // UUID (하이픈 없음)
  name: string
}

export interface AuthStartResult {
  ok: boolean
  profile?: McProfile
  error?: string
  errorCode?: 'NO_CLIENT_ID' | 'CANCELED' | 'EXPIRED' | 'NO_XBOX' | 'CHILD_ACCOUNT' | 'NO_PROFILE' | 'UNKNOWN'
}

export interface AuthStatus {
  loggedIn: boolean
  name?: string
  uuid?: string
  tokenValid?: boolean
  clientIdConfigured: boolean
  offlineEnabled: boolean
  offlineUsername?: string
}

interface StoredAccount {
  // refresh token은 safeStorage(DPAPI)로 암호화, 불가 환경에서만 평문 폴백
  ms_refresh_token_enc?: string
  ms_refresh_token_plain?: string
  mc_access_token?: string
  mc_token_expires_at?: string
  profile?: McProfile
  updated_at?: string
}

let authCanceled = false
let authInProgress = false

// ---------- 저장소 ----------

function getAccountPath(): string {
  return path.join(app.getPath('userData'), 'msa-account.json')
}

function loadAccount(): StoredAccount | null {
  try {
    const raw = fs.readFileSync(getAccountPath(), 'utf8')
    return JSON.parse(raw) as StoredAccount
  } catch {
    return null
  }
}

function saveAccount(account: StoredAccount): void {
  account.updated_at = new Date().toISOString()
  fs.writeFileSync(getAccountPath(), JSON.stringify(account, null, 2), 'utf8')
}

function storeRefreshToken(account: StoredAccount, refreshToken: string): void {
  if (safeStorage.isEncryptionAvailable()) {
    account.ms_refresh_token_enc = safeStorage.encryptString(refreshToken).toString('base64')
    delete account.ms_refresh_token_plain
  } else {
    account.ms_refresh_token_plain = refreshToken
    delete account.ms_refresh_token_enc
  }
}

function readRefreshToken(account: StoredAccount | null): string | null {
  if (!account) return null
  if (account.ms_refresh_token_enc) {
    try {
      return safeStorage.decryptString(Buffer.from(account.ms_refresh_token_enc, 'base64'))
    } catch {
      return null
    }
  }
  return account.ms_refresh_token_plain ?? null
}

export function logout(): void {
  try {
    fs.rmSync(getAccountPath(), { force: true })
  } catch {
    // 무시
  }
}

// ---------- Client ID 설정 ----------

export function getClientId(): string | null {
  return process.env.MODFORGE_MSA_CLIENT_ID ?? getSetting(CLIENT_ID_SETTING_KEY)
}

export function setClientId(clientId: string | null): void {
  setSetting(CLIENT_ID_SETTING_KEY, clientId?.trim() || null)
}

// ---------- 오프라인 모드 ----------

const OFFLINE_ENABLED_KEY = 'offline_mode'
const OFFLINE_USERNAME_KEY = 'offline_username'

export function getOfflineConfig(): { enabled: boolean; username: string } {
  return {
    enabled: getSetting(OFFLINE_ENABLED_KEY) === '1',
    username: getSetting(OFFLINE_USERNAME_KEY) ?? '',
  }
}

export function setOfflineConfig(enabled: boolean, username?: string): { ok: boolean; error?: string } {
  if (enabled) {
    const name = (username ?? '').trim()
    if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) {
      return { ok: false, error: '닉네임은 영문/숫자/밑줄 3~16자여야 합니다.' }
    }
    setSetting(OFFLINE_USERNAME_KEY, name)
    setSetting(OFFLINE_ENABLED_KEY, '1')
  } else {
    setSetting(OFFLINE_ENABLED_KEY, '0')
  }
  return { ok: true }
}

// 바닐라 오프라인 서버와 동일한 규칙: UUID v3(md5) of "OfflinePlayer:<name>"
function offlineUuid(name: string): string {
  const hash = crypto.createHash('md5').update(`OfflinePlayer:${name}`, 'utf8').digest()
  hash[6] = (hash[6] & 0x0f) | 0x30 // version 3
  hash[8] = (hash[8] & 0x3f) | 0x80 // variant
  return hash.toString('hex')
}

export function getOfflineSession(): { accessToken: string; profile: McProfile; offline: true } | null {
  const config = getOfflineConfig()
  if (!config.enabled || !config.username) return null
  return {
    accessToken: 'offline',
    profile: { id: offlineUuid(config.username), name: config.username },
    offline: true,
  }
}

// ---------- OAuth (Device Code Flow) ----------

async function requestDeviceCode(clientId: string): Promise<DeviceCodeInfo> {
  const { data } = await axios.post(
    `${OAUTH_BASE}/devicecode`,
    new URLSearchParams({ client_id: clientId, scope: SCOPE }),
    { timeout: 15000 }
  )
  return data as DeviceCodeInfo
}

interface MsTokens {
  access_token: string
  refresh_token: string
}

async function pollForToken(clientId: string, device: DeviceCodeInfo): Promise<MsTokens> {
  let intervalSec = device.interval || 5
  const deadline = Date.now() + (device.expires_in ?? 900) * 1000

  while (Date.now() < deadline) {
    if (authCanceled) throw Object.assign(new Error('로그인이 취소되었습니다.'), { code: 'CANCELED' })
    await sleep(intervalSec * 1000)
    if (authCanceled) throw Object.assign(new Error('로그인이 취소되었습니다.'), { code: 'CANCELED' })

    try {
      const { data } = await axios.post(
        `${OAUTH_BASE}/token`,
        new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          client_id: clientId,
          device_code: (device as any).device_code,
        }),
        { timeout: 15000 }
      )
      return data as MsTokens
    } catch (err: any) {
      const code = err.response?.data?.error
      if (code === 'authorization_pending') continue
      if (code === 'slow_down') {
        intervalSec += 5
        continue
      }
      if (code === 'expired_token') {
        throw Object.assign(new Error('코드 입력 시간이 만료되었습니다. 다시 시도해 주세요.'), { code: 'EXPIRED' })
      }
      if (code === 'authorization_declined' || code === 'access_denied') {
        throw Object.assign(new Error('로그인이 거부되었습니다.'), { code: 'CANCELED' })
      }
      throw err
    }
  }

  throw Object.assign(new Error('코드 입력 시간이 만료되었습니다. 다시 시도해 주세요.'), { code: 'EXPIRED' })
}

async function refreshMsTokens(clientId: string, refreshToken: string): Promise<MsTokens> {
  const { data } = await axios.post(
    `${OAUTH_BASE}/token`,
    new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      refresh_token: refreshToken,
      scope: SCOPE,
    }),
    { timeout: 15000 }
  )
  return data as MsTokens
}

// ---------- Xbox → Minecraft 토큰 체인 ----------

const XSTS_ERROR_MESSAGES: Record<string, { message: string; code: AuthStartResult['errorCode'] }> = {
  '2148916233': { message: '이 Microsoft 계정에 Xbox 프로필이 없습니다. xbox.com에서 먼저 만들어 주세요.', code: 'NO_XBOX' },
  '2148916238': { message: '자녀 계정은 가족 그룹에 추가된 후에 로그인할 수 있습니다.', code: 'CHILD_ACCOUNT' },
}

async function completeMinecraftChain(
  msAccessToken: string,
  onStage?: (message: string) => void
): Promise<{ mcAccessToken: string; expiresAt: string; profile: McProfile }> {
  onStage?.('Xbox Live 인증 중...')
  const { data: xbl } = await axios.post(
    'https://user.auth.xboxlive.com/user/authenticate',
    {
      Properties: {
        AuthMethod: 'RPS',
        SiteName: 'user.auth.xboxlive.com',
        RpsTicket: `d=${msAccessToken}`,
      },
      RelyingParty: 'http://auth.xboxlive.com',
      TokenType: 'JWT',
    },
    { timeout: 15000 }
  )

  onStage?.('XSTS 토큰 발급 중...')
  let xsts: any
  try {
    const res = await axios.post(
      'https://xsts.auth.xboxlive.com/xsts/authorize',
      {
        Properties: { SandboxId: 'RETAIL', UserTokens: [xbl.Token] },
        RelyingParty: 'rp://api.minecraftservices.com/',
        TokenType: 'JWT',
      },
      { timeout: 15000 }
    )
    xsts = res.data
  } catch (err: any) {
    const xerr = String(err.response?.data?.XErr ?? '')
    const mapped = XSTS_ERROR_MESSAGES[xerr]
    if (mapped) throw Object.assign(new Error(mapped.message), { code: mapped.code })
    throw err
  }

  const userHash = xsts.DisplayClaims?.xui?.[0]?.uhs
  if (!userHash) throw new Error('XSTS 응답에서 사용자 해시를 찾지 못했습니다.')

  onStage?.('Minecraft 서비스 로그인 중...')
  const { data: mcAuth } = await axios.post(
    'https://api.minecraftservices.com/authentication/login_with_xbox',
    { identityToken: `XBL3.0 x=${userHash};${xsts.Token}` },
    { timeout: 15000 }
  )

  onStage?.('Minecraft 프로필 확인 중...')
  let profile: McProfile
  try {
    const { data } = await axios.get('https://api.minecraftservices.com/minecraft/profile', {
      headers: { Authorization: `Bearer ${mcAuth.access_token}` },
      timeout: 15000,
    })
    profile = { id: data.id, name: data.name }
  } catch (err: any) {
    if (err.response?.status === 404) {
      throw Object.assign(
        new Error('이 계정에 Minecraft Java Edition 프로필이 없습니다. 게임을 구매했는지 확인해 주세요.'),
        { code: 'NO_PROFILE' }
      )
    }
    throw err
  }

  const expiresAt = new Date(Date.now() + (mcAuth.expires_in ?? 86400) * 1000).toISOString()
  return { mcAccessToken: mcAuth.access_token, expiresAt, profile }
}

// ---------- 공개 API ----------

export async function startDeviceAuth(
  onDeviceCode: (info: DeviceCodeInfo) => void,
  onStage?: (message: string) => void
): Promise<AuthStartResult> {
  const clientId = getClientId()
  if (!clientId) {
    return {
      ok: false,
      errorCode: 'NO_CLIENT_ID',
      error: 'Azure 앱 Client ID가 설정되지 않았습니다.',
    }
  }
  if (authInProgress) {
    return { ok: false, errorCode: 'UNKNOWN', error: '이미 로그인이 진행 중입니다.' }
  }

  authInProgress = true
  authCanceled = false
  try {
    onStage?.('로그인 코드 발급 중...')
    const device = await requestDeviceCode(clientId)
    onDeviceCode(device)

    onStage?.('브라우저에서 코드 입력을 기다리는 중...')
    const tokens = await pollForToken(clientId, device)

    const chain = await completeMinecraftChain(tokens.access_token, onStage)

    const account: StoredAccount = {
      mc_access_token: chain.mcAccessToken,
      mc_token_expires_at: chain.expiresAt,
      profile: chain.profile,
    }
    storeRefreshToken(account, tokens.refresh_token)
    saveAccount(account)

    console.log(`[Auth] 로그인 완료: ${chain.profile.name} (${chain.profile.id})`)
    return { ok: true, profile: chain.profile }
  } catch (err: any) {
    const code = err.code ?? 'UNKNOWN'
    const detail = err.response?.data?.error_description ?? err.response?.data?.errorMessage ?? err.message
    return { ok: false, errorCode: code, error: detail }
  } finally {
    authInProgress = false
    authCanceled = false
  }
}

export function cancelDeviceAuth(): void {
  authCanceled = true
}

export function getAuthStatus(): AuthStatus {
  const account = loadAccount()
  const refreshToken = readRefreshToken(account)
  const tokenValid = Boolean(
    account?.mc_token_expires_at && new Date(account.mc_token_expires_at).getTime() > Date.now() + 5 * 60 * 1000
  )
  const offline = getOfflineConfig()
  return {
    loggedIn: Boolean(refreshToken && account?.profile),
    name: account?.profile?.name,
    uuid: account?.profile?.id,
    tokenValid,
    clientIdConfigured: Boolean(getClientId()),
    offlineEnabled: offline.enabled,
    offlineUsername: offline.username || undefined,
  }
}

// 유효한 Minecraft 세션을 반환 (만료 시 refresh token으로 자동 갱신)
// 자체 실행(3단계)에서 게임 인자에 사용된다.
export async function getValidSession(): Promise<{ accessToken: string; profile: McProfile } | null> {
  const account = loadAccount()
  if (!account?.profile) return null

  const notExpired =
    account.mc_access_token &&
    account.mc_token_expires_at &&
    new Date(account.mc_token_expires_at).getTime() > Date.now() + 5 * 60 * 1000
  if (notExpired) {
    return { accessToken: account.mc_access_token!, profile: account.profile }
  }

  const clientId = getClientId()
  const refreshToken = readRefreshToken(account)
  if (!clientId || !refreshToken) return null

  try {
    const tokens = await refreshMsTokens(clientId, refreshToken)
    const chain = await completeMinecraftChain(tokens.access_token)

    const next: StoredAccount = {
      mc_access_token: chain.mcAccessToken,
      mc_token_expires_at: chain.expiresAt,
      profile: chain.profile,
    }
    storeRefreshToken(next, tokens.refresh_token ?? refreshToken)
    saveAccount(next)

    return { accessToken: chain.mcAccessToken, profile: chain.profile }
  } catch (err: any) {
    console.warn('[Auth] 세션 갱신 실패:', err.message)
    return null
  }
}
