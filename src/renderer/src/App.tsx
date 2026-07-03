import { useState, useEffect, useRef } from 'react'
import type { AuthStatus, ConflictDetail, DeviceCodeInfo, GameFilesProgress, ModDetail, ModRow, ModUpdateInfo, MrpackProgress, ScannedJarMod, SyncProgress, SyncStatus } from '../../preload/index.d'

// --- Types ---
type Page = 'search' | 'recommended' | 'installed' | 'profiles' | 'modDetail' | 'sync'
type ViewMode = 'list' | 'detail'

// --- Inline Icons ---
const Icon = {
  Search:    () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  Sparkles:  () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3 1.7 5.2L19 10l-5.3 1.8L12 17l-1.7-5.2L5 10l5.3-1.8L12 3z"/><path d="m19 15 .7 2.2L22 18l-2.3.8L19 21l-.7-2.2L16 18l2.3-.8L19 15z"/></svg>,
  Package:   () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>,
  User:      () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  Settings:  () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  Trash:     () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>,
  Check:     () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  Download:  () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  Alert:     () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
  ArrowLeft: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>,
  Play:      () => <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="6 3 20 12 6 21 6 3"/></svg>,
  Database:  () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>,
}

const GAME_FILES_PHASE_LABEL: Record<string, string> = {
  client: '클라이언트',
  libraries: '라이브러리',
  assets: '에셋',
}

// 게임 로그 줄 색상 (에러/경고 강조)
function logLineColor(line: string): string {
  if (/ERROR|SEVERE|FATAL|Exception|Caused by/i.test(line)) return '#f87171'
  if (/WARN/i.test(line)) return '#fbbf24'
  return '#9ca3af'
}

// SQLite CURRENT_TIMESTAMP는 UTC를 'YYYY-MM-DD HH:MM:SS'로 저장하므로 Z를 붙여 파싱
function formatDbDate(value?: string | null, dateOnly = false): string {
  if (!value) return '-'
  const iso = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`
  const d = new Date(iso)
  if (isNaN(d.getTime())) return value
  return dateOnly ? d.toLocaleDateString() : d.toLocaleString()
}

export default function App() {
  const [page, setPage] = useState<Page>('search')

  // --- Profile States ---
  const [profiles, setProfiles] = useState<any[]>([])
  const [activeProfile, setActive] = useState<any>(null)
  
  const [showAddProfile, setShowAddProfile] = useState(false)
  const [newProfileName, setNewProfileName] = useState('')
  const [newProfileVer, setNewProfileVer] = useState('1.20.1')
  const [newProfileLoader, setNewProfileLoader] = useState('Fabric')

  // --- Installed Mods State ---
  const [installedMods, setInstalledMods] = useState<any[]>([])
  const [uninstallStatus, setUninstallStatus] = useState('')
  const [exportStatus, setExportStatus] = useState('')
  const [isExporting, setExporting] = useState(false)
  const [importStatus, setImportStatus] = useState('')
  const [isImporting, setImporting] = useState(false)
  const [mrpackProgress, setMrpackProgress] = useState<MrpackProgress | null>(null)
  const [backupStatus, setBackupStatus] = useState('')
  const [activateStatus, setActivateStatus] = useState('')
  const [isActivating, setActivating] = useState(false)
  const [launchingId, setLaunchingId] = useState<string | number | null>(null)
  const [launchStatus, setLaunchStatus] = useState('')
  const [launchHelpUrl, setLaunchHelpUrl] = useState('')
  const [isPreparingFiles, setPreparingFiles] = useState(false)
  const [gameFilesProgress, setGameFilesProgress] = useState<GameFilesProgress | null>(null)
  const [prepStatus, setPrepStatus] = useState('')
  const [runningProfileId, setRunningProfileId] = useState<string | number | null>(null)
  const [runningPid, setRunningPid] = useState<number | null>(null)
  const [gameLogs, setGameLogs] = useState<string[]>([])
  const [logStickToBottom, setLogStickToBottom] = useState(true)
  const logBoxRef = useRef<HTMLDivElement | null>(null)
  const [crashInfo, setCrashInfo] = useState<{ path: string | null; summary: string | null } | null>(null)

  // --- Auth States ---
  const [authInfo, setAuthInfo] = useState<AuthStatus | null>(null)
  const [authBusy, setAuthBusy] = useState(false)
  const [authDeviceCode, setAuthDeviceCode] = useState<DeviceCodeInfo | null>(null)
  const [authMsg, setAuthMsg] = useState('')
  const [showClientIdInput, setShowClientIdInput] = useState(false)
  const [clientIdInput, setClientIdInput] = useState('')
  const [showOfflineInput, setShowOfflineInput] = useState(false)
  const [offlineNameInput, setOfflineNameInput] = useState('')

  // --- Launch Settings ---
  const [memoryMb, setMemoryMb] = useState(4096)
  const [totalMemoryMb, setTotalMemoryMb] = useState<number | null>(null)

  // --- DB Sync States ---
  const [dbStatus, setDbStatus] = useState<SyncStatus | null>(null)
  const [isSyncing, setSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null)
  const [syncLimit, setSyncLimit] = useState(100)
  const [syncMessage, setSyncMessage] = useState('')
  const [lastBackupPath, setLastBackupPath] = useState('')
  const [isBackingUp, setBackingUp] = useState(false)
  const [updates, setUpdates] = useState<Record<string, ModUpdateInfo>>({})
  const [isCheckingUpdates, setCheckingUpdates] = useState(false)
  const [isApplyingUpdates, setApplyingUpdates] = useState(false)
  const [updateStatus, setUpdateStatus] = useState('')

  // --- Search & UI States ---
  const [query, setQuery] = useState('')
  const [isSearching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<ModRow[]>([])
  const [recommendedMods, setRecommendedMods] = useState<ModRow[]>([])
  const [isLoadingRecs, setLoadingRecs] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [depResults, setDepResults] = useState<ModRow[]>([])
  const [error, setError] = useState('')
  const [hasBlockingConflict, setHasBlockingConflict] = useState(false)
  const [conflictDetails, setConflictDetails] = useState<ConflictDetail[]>([])
  const [pinWarnings, setPinWarnings] = useState<string[]>([])
  const [scannedJars, setScannedJars] = useState<ScannedJarMod[]>([])
  const [detailMod, setDetailMod] = useState<ModDetail | null>(null)
  const [detailFallback, setDetailFallback] = useState<ModRow | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailFrom, setDetailFrom] = useState<Page>('search')

  // --- Install States ---
  const [installStatus, setInstSt] = useState<'idle'|'installing'|'done'|'error'>('idle')
  const [installMsg, setInstMsg] = useState('')

  const api = window.electron
  const activeDetail = detailMod ?? detailFallback
  const updateCount = Object.values(updates).filter(u => u.update_available).length
  const lastSyncLog = dbStatus?.logs?.[0]
  const syncPct = syncProgress && syncProgress.total > 0
    ? Math.min(100, Math.round((syncProgress.synced / syncProgress.total) * 100))
    : 0

  // 초기 프로필 로드
  useEffect(() => { loadProfiles() }, [])

  // 활성 프로필이 바뀌면 검색 화면에서도 충돌 검사용 설치 목록을 최신화
  useEffect(() => {
    if (activeProfile) loadInstalledMods(activeProfile.id)
  }, [activeProfile])

  useEffect(() => {
    if (activeProfile) refreshJarScan()
  }, [activeProfile])

  useEffect(() => {
    if (activeProfile && page === 'recommended') loadRecommendations()
  }, [activeProfile, page])

  useEffect(() => {
    if (page === 'sync') {
      loadSyncStatus()
      api.getLaunchSettings().then((settings) => {
        setMemoryMb(settings.memoryMb)
        setTotalMemoryMb(settings.totalMemoryMb)
      }).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  // 동기화 진행 이벤트 구독
  useEffect(() => {
    const unsubscribe = api.onSyncProgress((data) => setSyncProgress(data))
    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // mrpack 가져오기 진행 이벤트 구독
  useEffect(() => {
    const unsubscribe = api.onMrpackProgress((data) => setMrpackProgress(data))
    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 로더 설치 단계 이벤트 구독 (실행 준비 중 상태 표시)
  useEffect(() => {
    const unsubscribe = api.onLoaderInstallProgress((data) => setLaunchStatus(data.message))
    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 게임 파일 다운로드 진행 이벤트 구독
  useEffect(() => {
    const unsubscribe = api.onGameFilesProgress((data) => setGameFilesProgress(data))
    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 게임 로그/종료 이벤트 구독
  useEffect(() => {
    const offLog = api.onGameLog((data) => {
      setGameLogs((prev) => [...prev, ...data.lines].slice(-300))
    })
    const offExit = api.onGameExit((data) => {
      setRunningPid(null)
      setRunningProfileId(null)
      if (data.crashed) {
        setLaunchStatus(`게임이 비정상 종료되었습니다 (코드 ${data.code ?? '알 수 없음'}).`)
        setCrashInfo({ path: data.crashReportPath, summary: data.crashSummary })
      } else {
        setLaunchStatus(`게임이 종료되었습니다 (코드 ${data.code ?? '0'}).`)
        setCrashInfo(null)
      }
    })
    return () => { offLog(); offExit() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 하단 고정 상태면 새 로그가 올 때 자동으로 맨 아래로 스크롤
  useEffect(() => {
    if (logStickToBottom && logBoxRef.current) {
      logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight
    }
  }, [gameLogs, logStickToBottom])

  // 사용자가 위로 스크롤하면 자동 스크롤을 멈추고, 바닥 근처로 돌아오면 다시 고정
  const handleLogScroll = () => {
    const el = logBoxRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24
    setLogStickToBottom(nearBottom)
  }

  const jumpToLogBottom = () => {
    setLogStickToBottom(true)
    if (logBoxRef.current) logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight
  }

  // 로그인 상태 로드 + 인증 이벤트 구독
  useEffect(() => {
    api.authStatus().then(setAuthInfo).catch(() => {})
    const offCode = api.onAuthDeviceCode((info) => setAuthDeviceCode(info))
    const offStage = api.onAuthStage((data) => setAuthMsg(data.message))
    return () => { offCode(); offStage() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadProfiles = async () => {
    try {
      const list = await api.getProfiles()
      setProfiles(list)
      // 게임에 연결된 프로필이 있으면 우선 선택
      if (list.length > 0 && !activeProfile) setActive(list.find(p => p.is_active) ?? list[0])
    } catch (e) {
      console.error('프로필 로드 실패:', e)
    }
  }

  const loadInstalledMods = async (profileId: string) => {
    const mods = await api.getInstalledMods(profileId)
    setInstalledMods(mods)
    return mods
  }

  const getInstallPath = () => activeProfile?.install_path || undefined

  const refreshJarScan = async () => {
    const res = await api.scanModJars(getInstallPath())
    if (res.ok) setScannedJars(res.mods)
    return res.ok ? res.mods : []
  }

  const loadRecommendations = async () => {
    if (!activeProfile) return
    setLoadingRecs(true)
    setError('')
    try {
      const res = await api.getRecommendations({
        profileId: String(activeProfile.id),
        loader: activeProfile.loader,
        gameVersion: activeProfile.game_version,
        limit: 12,
      })
      if (!res.ok) {
        setError(res.error ?? '추천 모드를 불러오지 못했습니다')
        setRecommendedMods([])
        return
      }
      setRecommendedMods(res.recommendations)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoadingRecs(false)
    }
  }

  const validateCurrentPlan = async (selectedMods: ModRow[]) => {
    if (!activeProfile) return { ok: true, conflicts: [], scannedJars: [] }

    const result = await api.validateInstallPlan({
      profileId: String(activeProfile.id),
      selectedMods,
      installPath: getInstallPath(),
      gameVersion: activeProfile.game_version,
      loader: activeProfile.loader,
    })

    setConflictDetails(result.conflicts ?? [])
    setScannedJars(result.scannedJars ?? [])
    setHasBlockingConflict((result.conflicts ?? []).some(c => c.severity === 'blocker'))
    return result
  }

  // 프로필 생성
  const handleCreateProfile = async () => {
    if (!newProfileName.trim()) return
    await api.createProfile({ name: newProfileName, gameVersion: newProfileVer, loader: newProfileLoader })
    setNewProfileName(''); setShowAddProfile(false)
    loadProfiles()
  }

  // 프로필 삭제
  const handleDeleteProfile = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('프로필을 삭제하시겠습니까?')) return
    await api.deleteProfile(String(id))
    const list = await api.getProfiles()
    setProfiles(list)
    // 삭제한 프로필이 선택 중이었다면 남은 프로필로 선택을 옮김
    if (activeProfile?.id === id) setActive(list.find(p => p.is_active) ?? list[0] ?? null)
  }

  // 프로필 활성화: 프로필 보관소를 게임 mods 폴더에 junction으로 연결
  const handleActivateProfile = async (p: any, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setActivating(true)
    setActivateStatus('')
    try {
      const res = await api.activateProfile(String(p.id))
      if (!res.ok) {
        setActivateStatus(res.error ?? '프로필 연결에 실패했습니다.')
        return
      }
      const parts = [`${p.name} 프로필을 게임 mods 폴더에 연결했습니다.`]
      if (res.adoptedFiles) parts.push(`기존 파일 ${res.adoptedFiles}개를 프로필 보관소로 가져왔습니다.`)
      if (res.backupPath) parts.push('기존 mods 폴더는 백업으로 보존했습니다.')
      setActivateStatus(parts.join(' '))

      const list = await api.getProfiles()
      setProfiles(list)
      setActive(list.find(x => String(x.id) === String(p.id)) ?? null)
    } catch (err: any) {
      setActivateStatus(err.message)
    } finally {
      setActivating(false)
    }
  }

  const handleDeactivateProfile = async (e?: React.MouseEvent) => {
    e?.stopPropagation()
    setActivating(true)
    setActivateStatus('')
    try {
      const res = await api.deactivateProfile()
      if (!res.ok) {
        setActivateStatus(res.error ?? '연결 해제에 실패했습니다.')
        return
      }
      setActivateStatus('게임 mods 폴더 연결을 해제했습니다.')
      const list = await api.getProfiles()
      setProfiles(list)
    } catch (err: any) {
      setActivateStatus(err.message)
    } finally {
      setActivating(false)
    }
  }

  const loadSyncStatus = async () => {
    try {
      setDbStatus(await api.syncStatus())
    } catch (e) {
      console.error('동기화 상태 로드 실패:', e)
    }
  }

  // Java 최대 메모리 변경 (슬라이더 step 단위라 호출 빈도 낮음 — 즉시 저장)
  const handleMemoryChange = (value: number) => {
    setMemoryMb(value)
    api.setLaunchSettings({ memoryMb: value }).catch(() => {})
  }

  // Modrinth 인기 모드를 로컬 DB로 동기화
  const handleSync = async () => {
    setSyncing(true)
    setSyncMessage('')
    setSyncProgress(null)
    try {
      const res = await api.syncModrinth({ limit: syncLimit })
      if (!res.success) {
        setSyncMessage(res.error ?? '동기화에 실패했습니다.')
        return
      }
      setSyncMessage(`${res.synced ?? 0}개 모드를 동기화했습니다.${res.errors ? ` (${res.errors}건 오류)` : ''}`)
      await loadSyncStatus()
    } catch (e: any) {
      setSyncMessage(e.message)
    } finally {
      setSyncing(false)
      setSyncProgress(null)
    }
  }

  // --- Microsoft 로그인 ---
  const handleLogin = async () => {
    setAuthBusy(true)
    setAuthMsg('')
    setAuthDeviceCode(null)
    try {
      const res = await api.authStart()
      if (!res.ok) {
        if (res.errorCode === 'NO_CLIENT_ID') {
          setShowClientIdInput(true)
          setAuthMsg('Azure 앱 Client ID를 먼저 입력해 주세요.')
        } else if (res.errorCode !== 'CANCELED') {
          setAuthMsg(res.error ?? '로그인에 실패했습니다.')
        } else {
          setAuthMsg('')
        }
        return
      }
      setAuthInfo(await api.authStatus())
      setAuthMsg(`${res.profile?.name}(으)로 로그인되었습니다.`)
    } catch (e: any) {
      setAuthMsg(e.message)
    } finally {
      setAuthBusy(false)
      setAuthDeviceCode(null)
    }
  }

  const handleAuthCancel = async () => {
    await api.authCancel()
    setAuthDeviceCode(null)
    setAuthMsg('')
  }

  const handleLogout = async () => {
    await api.authLogout()
    setAuthInfo(await api.authStatus())
    setAuthMsg('로그아웃되었습니다.')
  }

  const handleSaveClientId = async () => {
    if (!clientIdInput.trim()) return
    await api.authSetClientId(clientIdInput.trim())
    setShowClientIdInput(false)
    setAuthMsg('')
    await handleLogin()
  }

  // 오프라인 모드 (싱글플레이 전용, 로그인 없이 자체 실행)
  const handleEnableOffline = async () => {
    const res = await api.authSetOffline(true, offlineNameInput)
    if (!res.ok) {
      setAuthMsg(res.error ?? '오프라인 모드 설정에 실패했습니다.')
      return
    }
    setAuthInfo(res.status ?? await api.authStatus())
    setShowOfflineInput(false)
    setAuthMsg('오프라인 모드가 켜졌습니다. 싱글플레이만 가능합니다.')
  }

  const handleDisableOffline = async () => {
    const res = await api.authSetOffline(false)
    setAuthInfo(res.status ?? await api.authStatus())
    setAuthMsg('오프라인 모드를 해제했습니다.')
  }

  // 게임 파일 준비: 로더 확보 + 클라이언트/라이브러리/에셋 다운로드
  const handlePrepareGameFiles = async () => {
    if (!activeProfile) return
    setPreparingFiles(true)
    setPrepStatus('')
    setGameFilesProgress(null)
    try {
      const res = await api.prepareGameFiles(String(activeProfile.id))
      if (!res.ok) {
        setPrepStatus(res.error ?? '게임 파일 준비에 실패했습니다.')
        return
      }
      const parts = [`게임 파일 준비 완료 (버전 ${res.versionId}).`]
      if (res.loaderInstalled) parts.push('로더를 새로 설치했습니다.')
      if (res.clientDownloaded) parts.push('클라이언트를 내려받았습니다.')
      parts.push(`라이브러리 ${res.librariesDownloaded ?? 0}개 다운로드 (전체 ${res.librariesTotal ?? 0}개).`)
      parts.push(`에셋 ${res.assetsDownloaded ?? 0}개 다운로드 (전체 ${res.assetsTotal ?? 0}개).`)
      if (res.librariesMissing) parts.push(`주의: 라이브러리 ${res.librariesMissing}개를 확보하지 못했습니다.`)
      if (res.assetsFailed) parts.push(`주의: 에셋 ${res.assetsFailed}개 실패.`)
      setPrepStatus(parts.join(' '))
    } catch (e: any) {
      setPrepStatus(e.message)
    } finally {
      setPreparingFiles(false)
      setGameFilesProgress(null)
    }
  }

  // 공식 런처 위임 실행 (로그인 없이도 동작하는 폴백 경로)
  const launchViaOfficialLauncher = async (p: any) => {
    const res = await api.launchProfile(String(p.id))
    if (!res.ok) {
      setLaunchStatus(res.error ?? '실행에 실패했습니다.')
      if (res.helpUrl) setLaunchHelpUrl(res.helpUrl)
      return
    }
    const parts: string[] = []
    if (res.loaderInstalled) parts.push(`${p.loader} 로더(${res.versionId})를 새로 설치했습니다.`)
    parts.push(
      res.launcherOpened
        ? `공식 런처를 실행했습니다. "${res.registeredName}" 프로필로 바로 플레이하세요.`
        : (res.warning ?? '런처를 자동으로 열지 못했습니다. 직접 실행해 주세요.')
    )
    setLaunchStatus(parts.join(' '))
  }

  // 프로필 실행: 로그인 상태면 자체 실행, 아니면 공식 런처 위임
  const handleLaunchProfile = async (p: any, e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (!p) return
    setLaunchingId(p.id)
    setLaunchStatus('')
    setLaunchHelpUrl('')
    try {
      if (authInfo?.loggedIn || authInfo?.offlineEnabled) {
        const res = await api.launchGameDirect(String(p.id))
        if (res.ok) {
          setGameLogs([])
          setLogStickToBottom(true)
          setCrashInfo(null)
          setRunningPid(res.pid ?? null)
          setRunningProfileId(p.id)
          setLaunchStatus(`게임을 실행했습니다 (버전 ${res.versionId}, Java ${res.javaMajor ?? '?'}, PID ${res.pid})${res.offline ? ' — 오프라인 모드' : ''}.`)
        } else if (res.needsLogin) {
          setLaunchStatus(res.error ?? '로그인이 필요합니다.')
          return
        } else if (res.needsLoaderInstall) {
          setLaunchStatus(res.error ?? '로더 설치에 실패했습니다.')
          if (res.helpUrl) setLaunchHelpUrl(res.helpUrl)
          return
        } else {
          // 자체 실행 실패 → 공식 런처로 폴백
          setLaunchStatus(`자체 실행 실패(${res.error ?? '알 수 없는 오류'}) — 공식 런처로 대신 실행합니다.`)
          await launchViaOfficialLauncher(p)
        }
      } else {
        await launchViaOfficialLauncher(p)
      }

      // 실행 과정에서 프로필이 활성화되므로 연결 배지를 갱신
      const list = await api.getProfiles()
      setProfiles(list)
      setActive(list.find(x => String(x.id) === String(p.id)) ?? null)
    } catch (err: any) {
      setLaunchStatus(err.message)
    } finally {
      setLaunchingId(null)
    }
  }

  const handleStopGame = async () => {
    if (runningProfileId == null) return
    await api.stopGame(String(runningProfileId))
    setLaunchStatus('게임 종료를 요청했습니다.')
  }

  // 설치된 모드 삭제
  const handleUninstallMod = async (mod: any) => {
    if (!activeProfile) return
    const deleteFile = confirm(
      `${mod.name}을(를) 어떻게 삭제할까요?\n\n확인: 프로필에서 제거하고 jar 파일도 삭제\n취소: 프로필에서만 제거`
    )
    const proceed = deleteFile || confirm('파일은 남기고 이 프로필에서만 제거할까요?')
    if (!proceed) return

    const res = await api.uninstallMod(activeProfile.id, String(mod.id), { deleteFile })
    if (res.warning) {
      setUninstallStatus(`${mod.name}은(는) 프로필에서 제거됐지만 파일 삭제는 건너뜀: ${res.warning}`)
    } else if (res.deletedFile) {
      setUninstallStatus(`${mod.name}을(를) 프로필과 파일에서 삭제했습니다.`)
    } else {
      setUninstallStatus(`${mod.name}을(를) 프로필에서 제거했습니다.`)
    }
    loadInstalledMods(activeProfile.id)
  }

  const handleExportPack = async () => {
    if (!activeProfile) return
    setExporting(true)
    setExportStatus('')
    try {
      const res = await api.exportProfilePack(String(activeProfile.id))
      if (res.canceled) return
      if (!res.ok) {
        setExportStatus(res.error ?? '모드팩 내보내기에 실패했습니다.')
        return
      }
      setExportStatus(`${res.modCount ?? 0}개 모드와 수동 jar ${res.localJarCount ?? 0}개 정보를 내보냈습니다.`)
    } catch (e: any) {
      setExportStatus(e.message)
    } finally {
      setExporting(false)
    }
  }

  const handleImportPack = async () => {
    setImporting(true)
    setImportStatus('')
    try {
      const res = await api.importProfilePack()
      if (res.canceled) return
      if (!res.ok) {
        const failText = res.failed?.length ? ` (${res.failed.length}개 실패)` : ''
        setImportStatus(`${res.error ?? '모드팩 가져오기에 실패했습니다.'}${failText}`)
        return
      }
      if (res.backupPath) setLastBackupPath(res.backupPath)
      setImportStatus(`${res.profileName} 프로필로 ${res.imported ?? 0}개 모드를 가져오고 ${res.downloaded ?? 0}개 파일을 다운로드했습니다.`)
      await loadProfiles()
      if (res.profileId) {
        const list = await api.getProfiles()
        setProfiles(list)
        setActive(list.find(p => Number(p.id) === res.profileId) ?? null)
      }
    } catch (e: any) {
      setImportStatus(e.message)
    } finally {
      setImporting(false)
    }
  }

  // Modrinth 표준 모드팩(.mrpack) 가져오기
  const handleImportMrpack = async () => {
    setImporting(true)
    setImportStatus('')
    setMrpackProgress(null)
    try {
      const res = await api.importMrpack()
      if (res.canceled) return
      if (!res.ok && !res.profileId) {
        setImportStatus(res.error ?? '.mrpack 가져오기에 실패했습니다.')
        return
      }

      const parts = [`"${res.profileName}" 프로필을 만들고 파일 ${res.downloaded ?? 0}/${res.totalFiles ?? 0}개를 내려받았습니다.`]
      if (res.registered) parts.push(`모드 정보 ${res.registered}개 등록.`)
      if (res.overrides) parts.push(`설정 파일 ${res.overrides}개 적용.`)
      if (res.failed?.length) parts.push(`${res.failed.length}개 실패: ${res.failed[0].reason}`)
      parts.push('프로필을 "게임에 연결"하거나 "실행"하면 플레이 준비 완료입니다.')
      setImportStatus(parts.join(' '))

      const list = await api.getProfiles()
      setProfiles(list)
      if (res.profileId) setActive(list.find(p => Number(p.id) === res.profileId) ?? null)
    } catch (e: any) {
      setImportStatus(e.message)
    } finally {
      setImporting(false)
      setMrpackProgress(null)
    }
  }

  const handleChooseInstallPath = async () => {
    if (!activeProfile) return
    const picked = await api.selectInstallPath()
    if (!picked.ok || !picked.path) return
    await api.updateProfilePath(String(activeProfile.id), picked.path)
    const list = await api.getProfiles()
    setProfiles(list)
    setActive(list.find(p => Number(p.id) === Number(activeProfile.id)) ?? null)
    setBackupStatus(`설치 경로를 ${picked.path}로 설정했습니다.`)
  }

  const handleBackupMods = async () => {
    if (!activeProfile) return
    setBackingUp(true)
    setBackupStatus('')
    try {
      const res = await api.backupProfileMods(String(activeProfile.id))
      if (!res.ok) {
        setBackupStatus(res.error ?? '백업에 실패했습니다.')
        return
      }
      setLastBackupPath(res.backupPath ?? '')
      setBackupStatus('mods 폴더 백업을 만들었습니다.')
    } catch (e: any) {
      setBackupStatus(e.message)
    } finally {
      setBackingUp(false)
    }
  }

  const handleRestoreBackup = async () => {
    if (!activeProfile || !lastBackupPath) return
    if (!confirm('마지막 백업으로 mods 폴더를 복구할까요? 현재 mods 폴더는 별도 백업으로 보존됩니다.')) return
    const res = await api.restoreProfileBackup(String(activeProfile.id), lastBackupPath)
    if (!res.ok) {
      setBackupStatus(res.error ?? '복구에 실패했습니다.')
      return
    }
    setBackupStatus('마지막 백업으로 mods 폴더를 복구했습니다.')
    await loadInstalledMods(activeProfile.id)
  }

  const openModDetail = async (mod: ModRow, from: Page = page) => {
    if (!activeProfile) { alert('프로필을 먼저 선택해 주세요!'); return }
    setDetailFallback(mod)
    setDetailMod(null)
    setDetailFrom(from)
    setDetailLoading(true)
    setError('')
    setPage('modDetail')
    setDepResults([])
    setSelected(new Set())
    setInstSt('idle')
    setConflictDetails([])
    setHasBlockingConflict(false)
    setPinWarnings([])

    try {
      const res = await api.getModDetail(mod.modrinth_id, {
        gameVersion: activeProfile.game_version,
        loader: activeProfile.loader,
      })
      if (!res.ok || !res.detail) {
        setError(res.error ?? '상세 정보를 불러오지 못했습니다.')
        return
      }
      setDetailMod(res.detail)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setDetailLoading(false)
    }
  }

  const handleCheckUpdates = async () => {
    if (!activeProfile) return
    setCheckingUpdates(true)
    setUpdateStatus('')
    try {
      const res = await api.checkProfileUpdates(String(activeProfile.id), {
        gameVersion: activeProfile.game_version,
        loader: activeProfile.loader,
      })
      if (!res.ok) {
        setUpdateStatus(res.error ?? '업데이트 확인에 실패했습니다.')
        return
      }
      const next: Record<string, ModUpdateInfo> = {}
      for (const update of res.updates) next[update.modrinth_id] = update
      setUpdates(next)
      const count = res.updates.filter(u => u.update_available).length
      setUpdateStatus(count ? `${count}개 모드에 업데이트가 있습니다.` : '모든 모드가 최신입니다.')
    } catch (e: any) {
      setUpdateStatus(e.message)
    } finally {
      setCheckingUpdates(false)
    }
  }

  // 업데이트 적용 (modrinthIds 생략 시 배지가 붙은 모든 모드)
  const handleApplyUpdates = async (modrinthIds?: string[]) => {
    if (!activeProfile) return
    const ids = modrinthIds ?? Object.values(updates).filter(u => u.update_available).map(u => u.modrinth_id)
    if (ids.length === 0) return

    setApplyingUpdates(true)
    setUpdateStatus('')
    try {
      const res = await api.applyProfileUpdates(String(activeProfile.id), {
        gameVersion: activeProfile.game_version,
        loader: activeProfile.loader,
        modrinthIds: ids,
      })
      if (res.error) {
        setUpdateStatus(res.error)
        return
      }

      const parts: string[] = []
      if (res.applied.length) parts.push(`${res.applied.length}개 모드를 업데이트했습니다.`)
      if (res.failed.length) parts.push(`${res.failed.length}개 실패: ${res.failed[0].reason}`)
      if (!res.applied.length && !res.failed.length) parts.push('적용할 업데이트가 없습니다.')
      if (res.backupPath) {
        setLastBackupPath(res.backupPath)
        parts.push('적용 전 백업을 만들었습니다.')
      }
      setUpdateStatus(parts.join(' '))

      // 적용된 모드의 배지를 API 재조회 없이 로컬에서 최신 상태로 갱신
      setUpdates(prev => {
        const next = { ...prev }
        for (const item of res.applied) {
          const info = next[item.modrinth_id]
          if (info) {
            next[item.modrinth_id] = {
              ...info,
              update_available: false,
              status: 'up_to_date',
              installed_version_id: info.latest_version_id,
              installed_version_number: info.latest_version_number,
            }
          }
        }
        return next
      })

      await loadInstalledMods(activeProfile.id)
      await refreshJarScan()
    } catch (e: any) {
      setUpdateStatus(e.message)
    } finally {
      setApplyingUpdates(false)
    }
  }

  // --- 코어 엔진 로직: 검색 ---
  const handleSearch = async () => {
    if (!query.trim()) return
    if (!activeProfile) { alert('좌측에서 프로필을 먼저 생성/선택해 주세요!'); return; }

    setSearching(true); setError(''); setSearchResults([]); setViewMode('list')
    try {
      const res = await api.searchMod(query.trim(), {
        loader: activeProfile.loader,
        gameVersion: activeProfile.game_version,
      })
      if (res.error || !res.results?.length) {
        setError(res.error ?? '검색 결과가 없습니다'); return
      }
      setSearchResults(res.results)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSearching(false)
    }
  }

  // --- 코어 엔진 로직: 의존성 분석 ---
  const handleSelectMod = async (mod: ModRow) => {
    if (!activeProfile) { alert('프로필을 먼저 선택해 주세요!'); return; }
    
    setSearching(true); setError(''); setHasBlockingConflict(false); setConflictDetails([]); setDepResults([]); setSelected(new Set()); setInstSt('idle'); setPinWarnings([])
    try {
      // 설치된 모드 ID 추출
      const currentInstalled = await loadInstalledMods(activeProfile.id)
      const installedIds = currentInstalled.map(m => m.modrinth_id)

      const resolved = await api.resolveDeps(mod.modrinth_id, {
        gameVersion: activeProfile.game_version,
        loader: activeProfile.loader,
        selected: installedIds
      })

      if (resolved.error && !resolved.root) {
        setError(resolved.error); return
      }
      if (resolved.conflicts && resolved.conflicts.length > 0) {
        setHasBlockingConflict(true)
        setError(`[경고] 기존에 설치된 모드와 호환되지 않는 충돌이 감지되었습니다 (${resolved.conflicts.length}건)`)
      }
      if (resolved.pinConflicts && resolved.pinConflicts.length > 0) {
        setPinWarnings(resolved.pinConflicts.map(c => {
          const requests = c.requests
            .map(r => `${r.requested_by.join(', ')}는 v${r.version_number ?? r.version_id} 요구`)
            .join(' · ')
          return `${c.name}: ${requests} → v${c.chosen_version_number ?? '?'}이(가) 선택되었습니다.`
        }))
      }

      let flat: ModRow[] = []
      if (resolved.root) {
        const depsOnly = resolved.installOrder.filter(m => m.modrinth_id !== resolved.root!.modrinth_id)
        flat = [resolved.root, ...depsOnly]
      } else {
        flat = [{ ...mod, dep_type: 'required' as const, depth: 0, children: [] }]
      }

      setDepResults(flat)

      // 필수 모드 자동 체크 (이미 설치된 모드는 제외 가능하지만 여기선 일단 다 체크)
      const autoSelect = new Set(
        flat.filter(m => m.dep_type === 'required' || m.modrinth_id === resolved.root?.modrinth_id).map(m => m.modrinth_id)
      )

      const selectedMods = flat.filter(m => autoSelect.has(m.modrinth_id))
      const validation = await validateCurrentPlan(selectedMods)

      if (!validation.ok) {
        setError(`[경고] 모드 간 충돌이 발생했습니다 (${validation.conflicts.length}건)`)
      }

      setSelected(autoSelect)
      setViewMode('detail')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSearching(false)
    }
  }

  const toggleMod = async (id: string, required: boolean) => {
    if (required || !activeProfile) return
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelected(next)

    const selectedMods = depResults.filter(m => next.has(m.modrinth_id))
    const validation = await validateCurrentPlan(selectedMods)
    
    if (!validation.ok) {
      setError(`[경고] 모드 간 충돌이 발생했습니다 (${validation.conflicts.length}건)`)
    } else {
      setError('')
    }
  }

  // --- 코어 엔진 로직: 실제 설치 ---
  const handleInstall = async () => {
    if (!activeProfile) return
    if (hasBlockingConflict) {
      alert('충돌이 감지되어 설치를 중단했습니다. 선택한 모드 구성을 확인해 주세요.')
      return
    }

    const installedIdSet = new Set(installedMods.map(m => m.modrinth_id))
    const toInstall = depResults.filter(m => selected.has(m.modrinth_id) && !installedIdSet.has(m.modrinth_id))
    const validation = await validateCurrentPlan(toInstall)
    if (!validation.ok) {
      setError(`[경고] 설치 전에 충돌이 감지되었습니다 (${validation.conflicts.length}건)`)
      return
    }

    setInstSt('installing')
    try {
      // install_path가 없으면 undefined를 넘겨 메인 프로세스가 실제 게임 mods 폴더를 계산하게 한다
      const res = await api.downloadMods(toInstall, activeProfile.install_path || undefined)
      if (res.success) {
        setInstSt('done')
        if (res.backupPath) setLastBackupPath(res.backupPath)
        setInstMsg(`${res.files.length}개 모드 다운로드 완료${res.backupPath ? ' · 설치 전 백업 생성됨' : ''}`)
        
        // 다운로드 성공한 모드를 실제 DB 프로필에 등록
        try {
          const modsToSave = toInstall
            .filter(m => m.id !== undefined)
            .map(m => ({ id: m.id!, ver_id: m.ver_id }));
          if (modsToSave.length > 0) {
            await api.saveProfileMods(activeProfile.id, modsToSave);
            await loadInstalledMods(activeProfile.id)
          }
        } catch (dbErr) {
          console.error("DB 저장 실패:", dbErr)
        }
        
      } else {
        setInstSt('error')
        setInstMsg(`${res.failed.length}개 실패: ${res.failed[0]?.reason}`)
      }
    } catch (e: any) {
      setInstSt('error'); setInstMsg(e.message)
    }
  }

  // --- Render ---
  return (
    <div style={s.root}>
      {/* --- 사이드바 --- */}
      <aside style={s.sidebar}>
        <div style={s.logo}>
          <div style={s.logoMark}>
            <div style={s.logoCube}>
              <span style={s.logoCubeTop} />
              <span style={s.logoCubeSide} />
            </div>
          </div>
          <span style={s.logoText}>ModForge</span>
        </div>

        <div style={s.profileBlock}>
          <p style={s.label}>활성 프로필</p>
          <select 
            style={s.profileSelect}
            value={activeProfile?.id || ''}
            // 💡 타입 불일치 버그 수정 완료 (String 캐스팅)
            onChange={(e) => setActive(profiles.find(p => String(p.id) === e.target.value) || null)}
          >
            {profiles.length === 0 && <option value="">프로필 없음</option>}
            {profiles.map(p => <option key={p.id} value={p.id}>{p.name}{p.is_active ? ' (연결됨)' : ''}</option>)}
          </select>
          {activeProfile && (
            <div style={s.chips}>
              <span style={s.chip}>{activeProfile.loader}</span>
              <span style={s.chip}>{activeProfile.game_version}</span>
            </div>
          )}
          {activeProfile && runningPid == null && (
            <button
              style={s.playBtnWide}
              onClick={() => handleLaunchProfile(activeProfile)}
              disabled={launchingId !== null}
            >
              <Icon.Play /> {launchingId !== null ? '실행 준비 중...' : '게임 실행'}
            </button>
          )}
          {runningPid != null && (
            <button style={s.stopBtnWide} onClick={handleStopGame}>
              게임 종료 (PID {runningPid})
            </button>
          )}
          {launchStatus && <div style={s.sideNote}>{launchStatus}</div>}
        </div>

        <nav style={s.nav}>
          <button onClick={() => setPage('search')} style={{...s.navBtn, ...(page === 'search' ? s.navActive : {})}}><Icon.Search /> 모드 검색</button>
          <button onClick={() => setPage('recommended')} style={{...s.navBtn, ...(page === 'recommended' ? s.navActive : {})}}><Icon.Sparkles /> 추천 모드</button>
          <button onClick={() => setPage('installed')} style={{...s.navBtn, ...(page === 'installed' ? s.navActive : {})}}><Icon.Package /> 설치된 모드</button>
          <button onClick={() => setPage('profiles')} style={{...s.navBtn, ...(page === 'profiles' ? s.navActive : {})}}><Icon.User /> 프로필 관리</button>
          <button onClick={() => setPage('sync')} style={{...s.navBtn, ...(page === 'sync' ? s.navActive : {})}}><Icon.Database /> 데이터베이스</button>
        </nav>

        {/* --- 계정 --- */}
        <div style={s.accountBlock}>
          <p style={{ ...s.label, marginBottom: 8 }}>계정</p>

          {authInfo?.loggedIn ? (
            <>
              <div style={s.accountRow}>
                <span style={s.accountDot} />
                <span style={s.accountName}>{authInfo.name ?? 'Microsoft 계정'}</span>
              </div>
              <button style={{ ...s.ghostBtn, width: '100%', marginTop: 8, padding: '7px' }} onClick={handleLogout}>
                로그아웃
              </button>
            </>
          ) : authDeviceCode ? (
            <>
              <div style={s.accountHint}>브라우저에서 아래 코드를 입력하세요</div>
              <div style={s.accountCode}>{authDeviceCode.user_code}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={{ ...s.linkBtn, flex: 1 }} onClick={() => window.open(authDeviceCode.verification_uri)}>
                  브라우저 열기
                </button>
                <button style={{ ...s.ghostBtn, padding: '7px 10px' }} onClick={() => navigator.clipboard.writeText(authDeviceCode.user_code)}>
                  복사
                </button>
              </div>
              <button style={{ ...s.ghostBtn, width: '100%', marginTop: 6, padding: '6px' }} onClick={handleAuthCancel}>
                취소
              </button>
            </>
          ) : showClientIdInput ? (
            <>
              <div style={s.accountHint}>Azure 앱 Client ID 입력</div>
              <input
                style={{ ...s.input, marginBottom: 6, fontSize: 11 }}
                value={clientIdInput}
                onChange={(e) => setClientIdInput(e.target.value)}
                placeholder="00000000-0000-0000-0000-000000000000"
              />
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={{ ...s.linkBtn, flex: 1 }} onClick={handleSaveClientId}>저장 후 로그인</button>
                <button style={{ ...s.ghostBtn, padding: '7px 10px' }} onClick={() => setShowClientIdInput(false)}>취소</button>
              </div>
            </>
          ) : showOfflineInput ? (
            <>
              <div style={s.accountHint}>오프라인 닉네임 (영문/숫자/_ 3~16자)</div>
              <input
                style={{ ...s.input, marginBottom: 6 }}
                value={offlineNameInput}
                onChange={(e) => setOfflineNameInput(e.target.value)}
                placeholder="Steve"
                onKeyDown={(e) => e.key === 'Enter' && handleEnableOffline()}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={{ ...s.linkBtn, flex: 1 }} onClick={handleEnableOffline}>사용</button>
                <button style={{ ...s.ghostBtn, padding: '7px 10px' }} onClick={() => setShowOfflineInput(false)}>취소</button>
              </div>
            </>
          ) : authInfo?.offlineEnabled ? (
            <>
              <div style={s.accountRow}>
                <span style={{ ...s.accountDot, background: '#fbbf24', boxShadow: '0 0 8px rgba(251,191,36,0.5)' }} />
                <span style={s.accountName}>오프라인 · {authInfo.offlineUsername}</span>
              </div>
              <div style={s.accountHint}>싱글플레이 전용입니다. 온라인 서버는 로그인이 필요합니다.</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={{ ...s.linkBtn, flex: 1 }} onClick={handleLogin} disabled={authBusy}>
                  {authBusy ? '로그인 중...' : '로그인'}
                </button>
                <button style={{ ...s.ghostBtn, padding: '7px 10px' }} onClick={handleDisableOffline}>해제</button>
              </div>
            </>
          ) : (
            <>
              <button style={s.msLoginBtn} onClick={handleLogin} disabled={authBusy}>
                {authBusy ? '로그인 진행 중...' : 'Microsoft 로그인'}
              </button>
              <button
                style={s.offlineBtn}
                onClick={() => {
                  setOfflineNameInput(authInfo?.offlineUsername ?? '')
                  setShowOfflineInput(true)
                }}
              >
                오프라인 모드로 플레이
              </button>
            </>
          )}

          {authMsg && <div style={s.accountHint}>{authMsg}</div>}
        </div>
      </aside>

      {/* --- 메인 컨텐츠 --- */}
      <main style={s.main}>
        
        {/* 1. 모드 검색 페이지 */}
        {page === 'search' && (
          <div style={s.page}>
            <div style={s.pageHead}>
              <h1 style={s.pageTitle}>모드 검색</h1>
              <p style={s.pageDesc}>{activeProfile ? `${activeProfile.name} (${activeProfile.loader} ${activeProfile.game_version}) 프로필 기준` : '프로필을 먼저 생성해 주세요'}</p>
            </div>

            <div style={s.searchRow}>
              <div style={s.searchBox}>
                <Icon.Search />
                <input
                  style={s.searchInput}
                  placeholder="모드 이름 검색..."
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                />
              </div>
              <button style={s.primaryBtn} onClick={handleSearch} disabled={isSearching}>
                {isSearching ? '검색 중...' : '검색'}
              </button>
            </div>

            {error && <div className="banner" style={s.errorBanner}><Icon.Alert /><span>{error}</span></div>}
            {scannedJars.length > 0 && (
              <div className="banner" style={s.scanBanner}>
                <Icon.Package />
                <span>mods 폴더 jar {scannedJars.length}개를 함께 검사 중입니다.</span>
              </div>
            )}
            {conflictDetails.length > 0 && <ConflictPanel conflicts={conflictDetails} />}
            {pinWarnings.length > 0 && <PinWarningPanel warnings={pinWarnings} />}

            {viewMode === 'list' && searchResults.length > 0 && (
              <>
                <p style={s.label}>검색 결과</p>
                <div style={s.depList}>
                  {searchResults.map(mod => (
                    <ModCard key={mod.modrinth_id} mod={mod} required={false} checked={false} onToggle={() => openModDetail(mod, 'search')} isSelectableResult={true} />
                  ))}
                </div>
              </>
            )}

            {viewMode === 'detail' && depResults.length > 0 && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <p style={{ ...s.label, margin: 0 }}>선택한 메인 모드</p>
                  <button style={s.backBtn} onClick={() => setViewMode('list')}><Icon.ArrowLeft /> 목록으로 돌아가기</button>
                </div>

                <div style={{ marginBottom: 20 }}>
                  <ModCard mod={depResults[0]} required checked onToggle={() => {}} />
                </div>

                {depResults.length > 1 ? (
                  <>
                    <p style={s.label}>함께 설치되는 의존성 모드</p>
                    <div style={s.depList}>
                      {depResults.slice(1).map(mod => {
                        const isReq = mod.dep_type === 'required' || !mod.dep_type
                        return (
                          <ModCard key={mod.modrinth_id} mod={mod} required={isReq} checked={selected.has(mod.modrinth_id)} onToggle={() => toggleMod(mod.modrinth_id, isReq)} />
                        )
                      })}
                    </div>
                  </>
                ) : (
                  <p style={s.mutedTxt}>필요한 외부 의존성 모드가 없습니다.</p>
                )}

                {/* 사라졌던 예쁜 설치 푸터 복구! */}
                <div style={s.installFooter}>
                  <div>
                    {installStatus === 'done'       && <span style={s.successTxt}><Icon.Check /> {installMsg}</span>}
                    {installStatus === 'error'      && <span style={s.errorTxt}><Icon.Alert /> {installMsg}</span>}
                    {installStatus === 'installing' && <span style={s.mutedTxt}>설치 중...</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={s.mutedTxt}>{selected.size}개 선택됨</span>
                    <button style={s.installBtn} onClick={handleInstall} disabled={installStatus === 'installing' || selected.size === 0 || hasBlockingConflict}>
                      <Icon.Download /> {installStatus === 'installing' ? '설치 중...' : '프로필에 설치'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {page === 'modDetail' && (
          <div style={s.page}>
            <div style={s.detailHead}>
              <button style={s.backBtn} onClick={() => setPage(detailFrom)}><Icon.ArrowLeft /> 돌아가기</button>
              {detailLoading ? (
                <p style={s.mutedTxt}>상세 정보를 불러오는 중...</p>
              ) : (
                <>
                  <div style={s.detailHero}>
                    <ModIcon src={activeDetail?.icon_url} alt={activeDetail?.name ?? 'mod'} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h1 style={s.pageTitle}>{activeDetail?.name}</h1>
                      <p style={s.pageDesc}>{activeDetail?.description ?? '설명이 없습니다.'}</p>
                      <div style={s.detailMetaRow}>
                        <span style={s.chip}>{activeProfile?.loader}</span>
                        <span style={s.chip}>{activeProfile?.game_version}</span>
                        {detailMod?.downloads ? <span style={s.chip}>{detailMod.downloads.toLocaleString()} 다운로드</span> : null}
                        {detailMod?.license ? <span style={s.chip}>{detailMod.license}</span> : null}
                      </div>
                    </div>
                  </div>

                  {error && <div className="banner" style={s.errorBanner}><Icon.Alert /><span>{error}</span></div>}
                  {conflictDetails.length > 0 && <ConflictPanel conflicts={conflictDetails} />}
                  {pinWarnings.length > 0 && <PinWarningPanel warnings={pinWarnings} />}

                  <div style={s.detailGrid}>
                    <div style={s.detailPanel}>
                      <p style={s.label}>선택된 버전</p>
                      <div style={s.detailValue}>v{activeDetail?.version_number ?? '알 수 없음'}</div>
                      <div style={s.detailSmall}>{activeDetail?.file_name ?? '파일 정보 없음'}</div>
                    </div>
                    <div style={s.detailPanel}>
                      <p style={s.label}>카테고리</p>
                      <div style={s.tagWrap}>
                        {toStringArray(activeDetail?.categories).slice(0, 6).map(tag => <span key={tag} style={s.chip}>{tag}</span>)}
                      </div>
                    </div>
                  </div>

                  {detailMod?.dependencies?.length ? (
                    <>
                      <p style={s.label}>의존성 미리보기</p>
                      <div style={s.depList}>
                        {detailMod.dependencies.slice(0, 4).map(dep => (
                          <ModCard key={`${dep.modrinth_id}-${dep.dep_type}`} mod={dep} required={dep.dep_type === 'required'} checked={false} onToggle={() => {}} />
                        ))}
                      </div>
                    </>
                  ) : null}

                  {depResults.length === 0 ? (
                    <div style={s.installFooter}>
                      <span style={s.mutedTxt}>설치 전에 의존성과 충돌을 분석합니다.</span>
                      <button style={s.installBtn} onClick={() => handleSelectMod((detailMod ?? detailFallback)!)} disabled={!detailMod && !detailFallback}>
                        <Icon.Check /> 설치 구성 분석
                      </button>
                    </div>
                  ) : (
                    <>
                      <p style={s.label}>설치 구성</p>
                      <div style={s.depList}>
                        {depResults.map((mod, index) => {
                          const isReq = index === 0 || mod.dep_type === 'required' || !mod.dep_type
                          return (
                            <ModCard key={mod.modrinth_id} mod={mod} required={isReq} checked={selected.has(mod.modrinth_id)} onToggle={() => toggleMod(mod.modrinth_id, isReq)} />
                          )
                        })}
                      </div>
                      <div style={s.installFooter}>
                        <div>
                          {installStatus === 'done'       && <span style={s.successTxt}><Icon.Check /> {installMsg}</span>}
                          {installStatus === 'error'      && <span style={s.errorTxt}><Icon.Alert /> {installMsg}</span>}
                          {installStatus === 'installing' && <span style={s.mutedTxt}>설치 중...</span>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span style={s.mutedTxt}>{selected.size}개 선택됨</span>
                          <button style={s.installBtn} onClick={handleInstall} disabled={installStatus === 'installing' || selected.size === 0 || hasBlockingConflict}>
                            <Icon.Download /> {installStatus === 'installing' ? '설치 중...' : '프로필에 설치'}
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* 2. 추천 모드 페이지 */}
        {page === 'recommended' && (
          <div style={s.page}>
            <div style={s.pageHead}>
              <h1 style={s.pageTitle}>추천 모드</h1>
              <p style={s.pageDesc}>{activeProfile ? `${activeProfile.name}에 설치된 모드 성향을 기준으로 골랐습니다.` : '프로필을 먼저 선택해 주세요'}</p>
            </div>

            {error && <div className="banner" style={s.errorBanner}><Icon.Alert /><span>{error}</span></div>}

            <div style={s.recommendHero}>
              <div>
                <div style={s.heroKicker}><Icon.Sparkles /> Profile Match</div>
                <div style={s.heroTitle}>지금 구성과 잘 맞는 다음 모드</div>
                <div style={s.heroSub}>카테고리, 로더, 게임 버전, 다운로드 지표를 함께 봅니다.</div>
              </div>
              <button style={s.ghostBtn} onClick={loadRecommendations} disabled={isLoadingRecs}>
                {isLoadingRecs ? '분석 중...' : '다시 추천'}
              </button>
            </div>

            {isLoadingRecs ? (
              <p style={s.mutedTxt}>설치된 모드 구성을 분석하고 있습니다...</p>
            ) : recommendedMods.length === 0 ? (
              <div style={s.empty}>
                <Icon.Sparkles />
                <p style={{marginTop: 10}}>추천하려면 먼저 DB 동기화나 모드 설치가 필요합니다.</p>
              </div>
            ) : (
              <div style={s.recommendList}>
                {recommendedMods.map(mod => (
                  <div key={mod.modrinth_id} className="card" style={s.recommendCard} onClick={() => openModDetail(mod, 'recommended')}>
                    <div style={s.recommendCardTop}>
                      <ModIcon src={mod.icon_url} alt={mod.name} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={s.modName}>{mod.name}</div>
                        <div style={s.modDesc}>
                          {mod.description?.slice(0, 96) ?? '설명이 없습니다'}
                          {mod.description && mod.description.length > 96 ? '...' : ''}
                        </div>
                      </div>
                      <span style={s.recToggle}>상세 보기</span>
                    </div>
                    <div style={s.reasonBox}>{mod.recommendation_reason}</div>
                    <div style={s.modMeta}>
                      <span style={s.verTag}>v{mod.version_number ?? '알 수 없음'}</span>
                      {mod.downloads > 0 && (
                        <span style={{fontSize: 11, color: '#71717a'}}>{mod.downloads.toLocaleString()} 다운로드</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 2. 설치된 모드 페이지 */}
        {page === 'installed' && (
          <div style={s.page}>
            <div style={s.pageHeadRow}>
              <div>
                <h1 style={s.pageTitle}>설치된 모드</h1>
                <p style={s.pageDesc}>{activeProfile?.name} 프로필에 설치된 모드 목록입니다.</p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={s.ghostBtnTall} onClick={handleCheckUpdates} disabled={!activeProfile || isCheckingUpdates || isApplyingUpdates}>
                  <Icon.Check /> {isCheckingUpdates ? '확인 중...' : '업데이트 확인'}
                </button>
                {updateCount > 0 && (
                  <button style={s.primaryBtnTall} onClick={() => handleApplyUpdates()} disabled={isApplyingUpdates}>
                    <Icon.Download /> {isApplyingUpdates ? '적용 중...' : `모두 업데이트 (${updateCount})`}
                  </button>
                )}
                <button style={s.ghostBtnTall} onClick={handleExportPack} disabled={!activeProfile || isExporting}>
                  <Icon.Download /> {isExporting ? '내보내는 중...' : '모드팩 내보내기'}
                </button>
              </div>
            </div>
            {exportStatus && <div className="banner" style={s.scanBanner}><Icon.Check /><span>{exportStatus}</span></div>}
            {updateStatus && <div className="banner" style={s.scanBanner}><Icon.Package /><span>{updateStatus}</span></div>}
            {uninstallStatus && <div className="banner" style={s.scanBanner}><Icon.Trash /><span>{uninstallStatus}</span></div>}
            <div style={s.listWrap}>
              {installedMods.length === 0 ? (
                <div style={s.empty}>
                  <Icon.Package />
                  <p style={{marginTop: 10}}>설치된 모드가 없습니다.</p>
                </div>
              ) : (
                installedMods.map(mod => (
                  <div key={mod.id} className="card" style={s.installedItem}>
                    <div style={{flex: 1, cursor: 'pointer'}} onClick={() => openModDetail(mod, 'installed')}>
                      <div style={s.modName}>
                        {mod.name} <span style={s.verTag}>v{mod.version_number}</span>
                        {updates[mod.modrinth_id]?.update_available && <span style={s.updateBadge}>업데이트 있음</span>}
                        {updates[mod.modrinth_id]?.status === 'up_to_date' && <span style={s.okBadge}>최신</span>}
                      </div>
                      {updates[mod.modrinth_id]?.update_available && (
                        <div style={{fontSize: 12, color: '#c7d2fe'}}>최신 버전: v{updates[mod.modrinth_id].latest_version_number}</div>
                      )}
                      <div style={{fontSize: 12, color: '#71717a'}}>설치일: {formatDbDate(mod.installed_at, true)}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {updates[mod.modrinth_id]?.update_available && (
                        <button style={s.updateBtn} onClick={() => handleApplyUpdates([mod.modrinth_id])} disabled={isApplyingUpdates}>
                          <Icon.Download /> {isApplyingUpdates ? '적용 중...' : '업데이트'}
                        </button>
                      )}
                      <button style={s.delBtn} onClick={() => handleUninstallMod(mod)}><Icon.Trash /></button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* 3. 프로필 관리 페이지 */}
        {page === 'profiles' && (
          <div style={s.page}>
            <div style={s.pageHeadRow}>
              <div>
                <h1 style={s.pageTitle}>프로필 관리</h1>
                <p style={s.pageDesc}>게임 버전, 로더별로 모드 세트를 분리 관리합니다.</p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={s.primaryBtnTall} onClick={handleImportMrpack} disabled={isImporting}>
                  <Icon.Download /> {isImporting ? '가져오는 중...' : '.mrpack 가져오기'}
                </button>
                <button style={s.ghostBtnTall} onClick={handleImportPack} disabled={isImporting}>
                  <Icon.Package /> ModForge 팩 가져오기
                </button>
              </div>
            </div>
            {importStatus && <div className="banner" style={s.scanBanner}><Icon.Package /><span>{importStatus}</span></div>}
            {isImporting && mrpackProgress && (
              <div className="banner" style={s.progressWrap}>
                <div style={s.progressTop}>
                  <span>{mrpackProgress.done} / {mrpackProgress.total} 파일</span>
                  <span style={s.mutedTxt}>{mrpackProgress.name}</span>
                </div>
                <div style={s.progressTrack}>
                  <div style={{
                    ...s.progressFill,
                    width: `${mrpackProgress.total > 0 ? Math.round((mrpackProgress.done / mrpackProgress.total) * 100) : 0}%`,
                  }} />
                </div>
              </div>
            )}
            {backupStatus && <div className="banner" style={s.scanBanner}><Icon.Check /><span>{backupStatus}</span></div>}
            {activateStatus && <div className="banner" style={s.scanBanner}><Icon.Check /><span>{activateStatus}</span></div>}
            {launchStatus && (
              <div className="banner" style={s.scanBanner}>
                <Icon.Play />
                <span style={{ flex: 1 }}>{launchStatus}</span>
                {launchHelpUrl && (
                  <button style={s.ghostBtn} onClick={() => window.open(launchHelpUrl)}>다운로드 페이지 열기</button>
                )}
              </div>
            )}
            {crashInfo && (
              <div className="banner" style={s.crashBanner}>
                <div style={s.crashTitle}><Icon.Alert /> 게임 크래시 감지</div>
                <div style={s.crashSummary}>
                  {crashInfo.summary ?? '크래시 원인 요약을 찾지 못했습니다. 아래 게임 로그의 빨간 줄을 확인해 보세요.'}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  {crashInfo.path && (
                    <button style={s.ghostBtnTall} onClick={() => api.openFolder(crashInfo.path!)}>
                      크래시 리포트 열기
                    </button>
                  )}
                  <button style={s.ghostBtn} onClick={() => setCrashInfo(null)}>닫기</button>
                </div>
              </div>
            )}
            {prepStatus && <div className="banner" style={s.scanBanner}><Icon.Download /><span>{prepStatus}</span></div>}
            {isPreparingFiles && gameFilesProgress && (
              <div className="banner" style={s.progressWrap}>
                <div style={s.progressTop}>
                  <span>
                    {GAME_FILES_PHASE_LABEL[gameFilesProgress.phase] ?? gameFilesProgress.phase} {gameFilesProgress.done} / {gameFilesProgress.total}
                  </span>
                  <span style={{ ...s.mutedTxt, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>
                    {gameFilesProgress.name}
                  </span>
                </div>
                <div style={s.progressTrack}>
                  <div style={{
                    ...s.progressFill,
                    width: `${gameFilesProgress.total > 0 ? Math.round((gameFilesProgress.done / gameFilesProgress.total) * 100) : 0}%`,
                  }} />
                </div>
              </div>
            )}

            {activeProfile && (
              <div style={s.settingsPanel}>
                <div>
                  <p style={s.label}>설치 경로</p>
                  <div style={s.pathText}>{activeProfile.install_path || '기본 .minecraft/mods 폴더'}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button style={s.ghostBtnTall} onClick={handleChooseInstallPath}>경로 선택</button>
                  <button style={s.ghostBtnTall} onClick={handleBackupMods} disabled={isBackingUp}>
                    {isBackingUp ? '백업 중...' : '지금 백업'}
                  </button>
                  <button style={s.ghostBtnTall} onClick={handleRestoreBackup} disabled={!lastBackupPath}>
                    마지막 백업 복구
                  </button>
                  <button style={s.ghostBtnTall} onClick={handlePrepareGameFiles} disabled={isPreparingFiles}>
                    <Icon.Download /> {isPreparingFiles ? '준비 중...' : '게임 파일 준비'}
                  </button>
                </div>
              </div>
            )}

            <div style={s.profileGrid}>
              {profiles.map(p => (
                <div key={p.id} className="card" style={{...s.profileCard, ...(activeProfile?.id === p.id ? s.profileActive : {})}} onClick={() => setActive(p)}>
                  <div style={{display: 'flex', justifyContent: 'space-between'}}>
                    <span style={s.profileCardName}>
                      {p.name}
                      {Boolean(p.is_active) && <span style={s.linkedBadge}>게임에 연결됨</span>}
                    </span>
                    <button style={s.iconBtn} onClick={(e) => handleDeleteProfile(p.id, e)}><Icon.Trash /></button>
                  </div>
                  <div style={s.chips}>
                    <span style={s.chip}>{p.loader}</span>
                    <span style={s.chip}>{p.game_version}</span>
                  </div>
                  <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button style={s.playBtn} onClick={(e) => handleLaunchProfile(p, e)} disabled={launchingId !== null}>
                      <Icon.Play /> {launchingId === p.id ? '준비 중...' : '실행'}
                    </button>
                    {p.is_active ? (
                      <button style={s.ghostBtn} onClick={handleDeactivateProfile} disabled={isActivating}>
                        {isActivating ? '처리 중...' : '연결 해제'}
                      </button>
                    ) : (
                      <button style={s.linkBtn} onClick={(e) => handleActivateProfile(p, e)} disabled={isActivating}>
                        {isActivating ? '연결 중...' : '게임에 연결'}
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {!showAddProfile ? (
                <div className="card" style={{...s.profileCard, borderStyle: 'dashed', display: 'flex', alignItems: 'center', justifyContent: 'center'}} onClick={() => setShowAddProfile(true)}>
                  <p style={{color: '#71717a', margin: 0}}>+ 새 프로필 추가</p>
                </div>
              ) : (
                <div style={s.profileCard}>
                  <input style={s.input} placeholder="프로필 이름" value={newProfileName} onChange={e => setNewProfileName(e.target.value)} />
                  <select style={s.select} value={newProfileLoader} onChange={e => setNewProfileLoader(e.target.value)}>
                    <option value="Fabric">Fabric</option>
                    <option value="Forge">Forge</option>
                    <option value="NeoForge">NeoForge</option>
                    <option value="Quilt">Quilt</option>
                  </select>
                  <select style={{...s.select, marginTop: 5}} value={newProfileVer} onChange={e => setNewProfileVer(e.target.value)}>
                    <option value="1.20.1">1.20.1</option>
                    <option value="1.19.2">1.19.2</option>
                    <option value="1.18.2">1.18.2</option>
                  </select>
                  <div style={{display: 'flex', gap: 5, marginTop: 10}}>
                    <button style={{...s.primaryBtn, flex: 1, padding: '8px'}} onClick={handleCreateProfile}>저장</button>
                    <button style={{...s.ghostBtn, flex: 1, padding: '8px'}} onClick={() => setShowAddProfile(false)}>취소</button>
                  </div>
                </div>
              )}
            </div>

            {gameLogs.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <p style={{ ...s.label, margin: 0 }}>
                    게임 로그 {runningPid != null ? `(실행 중 · PID ${runningPid})` : '(종료됨)'}
                  </p>
                  <button style={s.ghostBtn} onClick={() => { setGameLogs([]); setLogStickToBottom(true) }}>지우기</button>
                </div>
                <div style={{ position: 'relative' }}>
                  <div ref={logBoxRef} onScroll={handleLogScroll} style={s.logBox}>
                    {gameLogs.map((line, i) => (
                      <div key={i} style={{ ...s.logLine, color: logLineColor(line) }}>{line}</div>
                    ))}
                  </div>
                  {!logStickToBottom && (
                    <button style={s.logJumpBtn} onClick={jumpToLogBottom}>
                      ↓ 맨 아래로
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 4. 데이터베이스 동기화 페이지 */}
        {page === 'sync' && (
          <div style={s.page}>
            <div style={s.pageHead}>
              <h1 style={s.pageTitle}>데이터베이스</h1>
              <p style={s.pageDesc}>Modrinth 인기 모드를 로컬 DB에 캐시해 오프라인 검색과 빠른 의존성 분석을 가능하게 합니다.</p>
            </div>

            {syncMessage && <div className="banner" style={s.scanBanner}><Icon.Check /><span>{syncMessage}</span></div>}

            <div style={s.statRow}>
              <div style={s.statCard}>
                <div style={s.statValue}>{dbStatus ? dbStatus.totalMods.toLocaleString() : '-'}</div>
                <div style={s.statLabel}>캐시된 모드</div>
              </div>
              <div style={s.statCard}>
                <div style={s.statValue}>{lastSyncLog ? formatDbDate(lastSyncLog.started_at) : '기록 없음'}</div>
                <div style={s.statLabel}>마지막 동기화</div>
              </div>
            </div>

            <div style={s.settingsPanel}>
              <div style={{ flex: 1 }}>
                <p style={s.label}>동기화 범위 (다운로드 순 상위)</p>
                <select
                  style={{ ...s.select, maxWidth: 260 }}
                  value={syncLimit}
                  onChange={e => setSyncLimit(Number(e.target.value))}
                  disabled={isSyncing}
                >
                  <option value={50}>50개 (빠름)</option>
                  <option value={100}>100개</option>
                  <option value={200}>200개</option>
                  <option value={500}>500개 (오래 걸림)</option>
                </select>
              </div>
              <button style={s.primaryBtnTall} onClick={handleSync} disabled={isSyncing}>
                <Icon.Database /> {isSyncing ? '동기화 중...' : '동기화 시작'}
              </button>
            </div>

            {isSyncing && (
              <div className="banner" style={s.progressWrap}>
                <div style={s.progressTop}>
                  <span>{syncProgress ? `${syncProgress.synced} / ${syncProgress.total} (${syncPct}%)` : '동기화 준비 중...'}</span>
                  <span style={s.mutedTxt}>{syncProgress?.name ?? ''}</span>
                </div>
                <div style={s.progressTrack}>
                  <div style={{ ...s.progressFill, width: `${syncPct}%` }} />
                </div>
                <p style={{ ...s.mutedTxt, margin: 0 }}>모드마다 상세 정보와 버전 목록을 받아오므로 수 분 정도 걸릴 수 있습니다. 앱을 닫지 마세요.</p>
              </div>
            )}

            <p style={s.label}>게임 실행 설정</p>
            <div style={{ ...s.settingsPanel, alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <p style={{ ...s.label, marginBottom: 6 }}>
                  Java 최대 메모리 — <span style={{ color: '#a5b4fc' }}>{(memoryMb / 1024).toFixed(1)}GB</span>
                  {totalMemoryMb ? ` · 시스템 ${Math.round(totalMemoryMb / 1024)}GB` : ''}
                </p>
                {(() => {
                  const sliderMax = Math.max(
                    2048,
                    Math.min(16384, totalMemoryMb ? Math.floor((totalMemoryMb * 0.75) / 512) * 512 : 16384)
                  )
                  return (
                    <input
                      type="range"
                      min={1024}
                      max={sliderMax}
                      step={512}
                      value={Math.min(memoryMb, sliderMax)}
                      onChange={(e) => handleMemoryChange(Number(e.target.value))}
                      style={{ width: '100%' }}
                      disabled={runningPid != null}
                    />
                  )
                })()}
                <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
                  {[2048, 4096, 8192].map((preset) => (
                    (!totalMemoryMb || preset <= totalMemoryMb * 0.75) && (
                      <button
                        key={preset}
                        style={{ ...s.chip, cursor: 'pointer', border: memoryMb === preset ? '1px solid #6366f1' : '1px solid transparent' }}
                        onClick={() => handleMemoryChange(preset)}
                        disabled={runningPid != null}
                      >
                        {preset / 1024}GB
                      </button>
                    )
                  ))}
                  <span style={{ ...s.mutedTxt, fontSize: 11, marginLeft: 'auto' }}>
                    {runningPid != null ? '게임 실행 중에는 변경할 수 없습니다.' : '다음 게임 실행부터 적용됩니다.'}
                  </span>
                </div>
              </div>
            </div>

            <p style={s.label}>최근 동기화 기록</p>
            {(dbStatus?.logs ?? []).length === 0 ? (
              <div style={s.empty}>
                <Icon.Database />
                <p style={{ marginTop: 10 }}>아직 동기화 기록이 없습니다. 첫 동기화를 시작해 보세요.</p>
              </div>
            ) : (
              <div style={s.listWrap}>
                {dbStatus!.logs.map(log => (
                  <div key={log.id} style={s.logRow}>
                    <span style={{
                      ...(log.status === 'done' ? s.okBadge : log.status === 'running' ? s.updateBadge : s.blockerBadge),
                      marginLeft: 0,
                    }}>
                      {log.status === 'done' ? '완료' : log.status === 'running' ? '진행 중' : '오류'}
                    </span>
                    <span style={{ fontWeight: 'bold' }}>{log.mods_synced}개 동기화</span>
                    <span style={s.mutedTxt}>{formatDbDate(log.started_at)}</span>
                    {log.errors && (
                      <span style={{ ...s.mutedTxt, color: '#f87171', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={log.errors}>
                        {log.errors.slice(0, 80)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  )
}

// --- 예쁜 체크박스가 달린 ModCard 컴포넌트 복구 ---
function ModCard({ mod, required, checked, onToggle, isSelectableResult }: {
  mod: ModRow; required: boolean; checked: boolean; onToggle: () => void; isSelectableResult?: boolean
}) {
  return (
    <div onClick={() => (!required || isSelectableResult) && onToggle()}
      className={(!required || isSelectableResult) ? 'card' : undefined}
      style={{ ...s.modCard, ...(checked ? s.modChecked : {}), cursor: (required && !isSelectableResult) ? 'default' : 'pointer' }}>
      <div style={s.modLeft}>
        {!isSelectableResult && (
          <div style={{ ...s.checkbox, ...(checked ? s.checkboxOn : {}) }}>{checked && <Icon.Check />}</div>
        )}
        <div>
          <div style={s.modName}>{mod.name}</div>
          {mod.description && <div style={s.modDesc}>{mod.description.slice(0, 80)}...</div>}
          <div style={s.modMeta}>
            <span style={s.verTag}>v{mod.version_number ?? '알 수 없음'}</span>
            {mod.pinned && <span style={s.pinBadge} title="상위 모드가 이 버전을 요구합니다">버전 고정</span>}
            {mod.downloads > 0 && <span style={{fontSize: 11, color: '#71717a'}}>{mod.downloads.toLocaleString()} 다운로드</span>}
          </div>
        </div>
      </div>
      {isSelectableResult ? <span style={s.optBadge}>선택하기</span> : <span style={required ? s.reqBadge : s.optBadge}>{required ? '필수' : '선택'}</span>}
    </div>
  )
}

function ModIcon({ src, alt }: { src?: string | null; alt: string }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) return <div style={s.modIconFallback}><Icon.Package /></div>
  return <img src={src} alt={alt} style={s.modIcon} onError={() => setFailed(true)} referrerPolicy="no-referrer" />
}

function PinWarningPanel({ warnings }: { warnings: string[] }) {
  return (
    <div className="banner" style={s.pinWarnPanel}>
      <div style={s.pinWarnTitle}><Icon.Alert /> 의존성 버전 요구 불일치</div>
      {warnings.map((warning) => (
        <div key={warning} style={s.pinWarnItem}>{warning}</div>
      ))}
      <div style={s.pinWarnHint}>보통은 선택된 버전으로 정상 작동하지만, 게임 실행 시 문제가 생기면 이 모드들을 확인해 보세요.</div>
    </div>
  )
}

function ConflictPanel({ conflicts }: { conflicts: ConflictDetail[] }) {
  return (
    <div className="banner" style={s.conflictPanel}>
      <div style={s.conflictTitle}><Icon.Alert /> 충돌 상세</div>
      {conflicts.map((conflict, index) => (
        <div key={`${conflict.source}-${index}`} style={s.conflictItem}>
          <div style={s.conflictTop}>
            <span style={conflict.severity === 'blocker' ? s.blockerBadge : s.warnBadge}>
              {conflict.severity === 'blocker' ? '설치 차단' : '주의'}
            </span>
            <span style={s.conflictNames}>{subjectName(conflict.a)} ↔ {subjectName(conflict.b)}</span>
          </div>
          <div style={s.conflictReason}>{conflict.reason}</div>
          <div style={s.conflictSource}>{conflict.type === 'modrinth' ? 'Modrinth 호환성 데이터' : `자체 규칙 DB · ${conflict.source}`}</div>
        </div>
      ))}
    </div>
  )
}

function subjectName(subject: ConflictDetail['a']) {
  const version = subject.version_number ? ` v${subject.version_number}` : ''
  return `${subject.name ?? subject.slug ?? subject.jar_mod_id ?? subject.modrinth_id ?? '알 수 없는 모드'}${version}`
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

// --- Styles ---
const s: Record<string, React.CSSProperties> = {
  root: { display: 'flex', height: '100vh', background: 'radial-gradient(circle at top left, #1d2433 0, #0f0f11 38%, #0a0a0b 100%)', color: '#e8e8ea', fontFamily: "'Segoe UI', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif" },
  sidebar: { width: 230, background: 'rgba(16, 16, 19, 0.92)', borderRight: '1px solid #2a2a2e', padding: '20px 12px', display: 'flex', flexDirection: 'column', boxShadow: '12px 0 40px rgba(0,0,0,0.22)' },
  logo: { display: 'flex', alignItems: 'center', gap: 11, padding: '0 10px 22px' },
  logoMark: { width: 34, height: 34, background: 'linear-gradient(135deg, #4f46e5, #14b8a6)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 12px 28px rgba(20,184,166,0.20), inset 0 1px 0 rgba(255,255,255,0.20)' },
  logoCube: { position: 'relative', width: 18, height: 18, border: '2px solid rgba(255,255,255,0.92)', borderRadius: 3, transform: 'rotate(45deg)', boxSizing: 'border-box' },
  logoCubeTop: { position: 'absolute', left: 2, top: 2, width: 5, height: 5, background: 'rgba(255,255,255,0.88)', borderRadius: 1 },
  logoCubeSide: { position: 'absolute', right: 2, bottom: 2, width: 5, height: 5, background: 'rgba(15,23,42,0.72)', borderRadius: 1 },
  logoText: { fontWeight: 'bold', fontSize: 17, letterSpacing: 0 },
  
  profileBlock: { background: 'linear-gradient(180deg, #202127, #18181b)', padding: 12, borderRadius: 8, marginBottom: 20, border: '1px solid #2d2d34' },
  profileSelect: { width: '100%', background: '#101014', color: '#fff', border: '1px solid #3f3f46', borderRadius: 6, padding: 7, marginBottom: 8, outline: 'none' },
  nav: { flex: 1, display: 'flex', flexDirection: 'column', gap: 4 },
  navBtn: { background: 'transparent', border: '1px solid transparent', color: '#8b8b95', padding: '10px', borderRadius: 8, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 },
  navActive: { background: '#27272a', color: '#fff', borderColor: '#353541' },

  main: { flex: 1, overflowY: 'auto' },
  page: { maxWidth: 900, margin: '0 auto', padding: 40 },
  pageHead: { marginBottom: 30 },
  pageHeadRow: { marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  pageTitle: { fontSize: 24, fontWeight: 'bold', margin: 0 },
  pageDesc: { color: '#71717a', marginTop: 5, fontSize: 14 },

  searchRow: { display: 'flex', gap: 10, marginBottom: 20 },
  searchBox: { flex: 1, background: 'rgba(24,24,27,0.86)', border: '1px solid #2f3037', borderRadius: 8, padding: '0 15px', display: 'flex', alignItems: 'center', gap: 10 },
  searchInput: { background: 'transparent', border: 'none', color: '#fff', width: '100%', padding: '12px 0', outline: 'none' },
  primaryBtn: { background: '#6366f1', color: '#fff', border: 'none', padding: '0 20px', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 10px 24px rgba(79,70,229,0.22)' },
  primaryBtnTall: { background: '#6366f1', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 10px 24px rgba(79,70,229,0.22)', display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' },
  ghostBtn: { background: 'transparent', border: '1px solid #2a2a2e', color: '#a1a1aa', padding: '8px 15px', borderRadius: 8, cursor: 'pointer' },
  ghostBtnTall: { background: 'rgba(24,24,27,0.72)', border: '1px solid #34343b', color: '#d4d4d8', padding: '10px 14px', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' },
  backBtn: { background: 'transparent', border: 'none', color: '#a1a1aa', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, padding: 0 },
  detailHead: { display: 'flex', flexDirection: 'column', gap: 16 },
  detailHero: { display: 'flex', gap: 16, alignItems: 'flex-start', background: 'linear-gradient(135deg, rgba(31,41,55,0.94), rgba(24,24,27,0.92))', border: '1px solid #30323b', borderRadius: 8, padding: 18, boxShadow: '0 18px 40px rgba(0,0,0,0.20)' },
  detailMetaRow: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 },
  detailGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  detailPanel: { background: 'rgba(24,24,27,0.88)', border: '1px solid #2d2d34', borderRadius: 8, padding: 14 },
  detailValue: { color: '#f4f4f5', fontSize: 16, fontWeight: 'bold' },
  detailSmall: { color: '#71717a', fontSize: 12, marginTop: 5 },
  tagWrap: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  settingsPanel: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, background: 'rgba(24,24,27,0.88)', border: '1px solid #2d2d34', borderRadius: 8, padding: 14, marginBottom: 18, boxShadow: '0 10px 24px rgba(0,0,0,0.14)' },
  pathText: { color: '#d4d4d8', fontSize: 13, overflowWrap: 'anywhere' },

  errorBanner: { background: '#1c0a0a', border: '1px solid #3f1515', color: '#f87171', padding: '10px 15px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10, marginBottom: 15, fontSize: 13 },
  scanBanner: { background: '#111827', border: '1px solid #263247', color: '#9ca3af', padding: '9px 14px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10, marginBottom: 15, fontSize: 12 },
  conflictPanel: { border: '1px solid #3f1515', background: '#140909', borderRadius: 8, padding: 12, marginBottom: 15 },
  conflictTitle: { color: '#fecaca', fontWeight: 'bold', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 },
  conflictItem: { borderTop: '1px solid #2f1717', paddingTop: 10, marginTop: 10 },
  conflictTop: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 },
  conflictNames: { color: '#f4f4f5', fontWeight: 'bold', fontSize: 13 },
  conflictReason: { color: '#d4d4d8', fontSize: 12, lineHeight: 1.45 },
  conflictSource: { color: '#71717a', fontSize: 11, marginTop: 6 },
  blockerBadge: { fontSize: 11, color: '#fee2e2', background: '#7f1d1d', padding: '2px 7px', borderRadius: 4 },
  warnBadge: { fontSize: 11, color: '#fef3c7', background: '#78350f', padding: '2px 7px', borderRadius: 4 },
  pinWarnPanel: { border: '1px solid #4a3410', background: '#1a1204', borderRadius: 8, padding: 12, marginBottom: 15 },
  pinWarnTitle: { color: '#fbbf24', fontWeight: 'bold', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
  pinWarnItem: { color: '#e7d3a1', fontSize: 12, lineHeight: 1.5, padding: '4px 0', borderTop: '1px solid #2e2208' },
  pinWarnHint: { color: '#8a7a55', fontSize: 11, marginTop: 8 },
  
  depList: { display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 20 },
  modCard: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 15px', borderRadius: 8, background: 'rgba(24,24,27,0.88)', border: '1px solid #2d2d34', boxShadow: '0 10px 26px rgba(0,0,0,0.16)' },
  modChecked: { borderColor: '#6366f1', background: 'rgba(37,37,48,0.94)' },
  modLeft: { display: 'flex', alignItems: 'flex-start', gap: 12 },
  checkbox: { width: 18, height: 18, borderRadius: 5, border: '2px solid #3f3f46', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  checkboxOn: { background: '#4f46e5', borderColor: '#4f46e5', color: '#fff' },
  modName: { fontWeight: 'bold', fontSize: 14, marginBottom: 3 },
  modDesc: { fontSize: 12, color: '#71717a', marginBottom: 5 },
  modMeta: { display: 'flex', gap: 10, alignItems: 'center' },
  reqBadge: { fontSize: 11, background: '#1a1040', color: '#818cf8', padding: '3px 8px', borderRadius: 20 },
  optBadge: { fontSize: 11, background: '#1a2a1a', color: '#4ade80', padding: '3px 8px', borderRadius: 20 },

  installFooter: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 0', borderTop: '1px solid #2a2a2e', marginTop: 10 },
  installBtn: { background: '#6366f1', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 'bold' },
  successTxt: { color: '#4ade80', fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 },
  errorTxt: { color: '#f87171', fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 },
  mutedTxt: { color: '#71717a', fontSize: 13 },

  listWrap: { display: 'flex', flexDirection: 'column', gap: 10 },
  installedItem: { background: 'rgba(24,24,27,0.88)', border: '1px solid #2d2d34', borderRadius: 8, padding: 15, display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 10px 24px rgba(0,0,0,0.14)' },
  delBtn: { background: '#2a1515', border: '1px solid #3f1515', color: '#f87171', borderRadius: 6, padding: '8px', cursor: 'pointer', display: 'flex' },
  updateBtn: { background: '#312e81', border: '1px solid #4338ca', color: '#c7d2fe', borderRadius: 6, padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 'bold', whiteSpace: 'nowrap' },

  profileGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15 },
  profileCard: { background: 'rgba(24,24,27,0.88)', border: '1px solid #2d2d34', borderRadius: 8, padding: 15, cursor: 'pointer', minHeight: 90, boxShadow: '0 10px 24px rgba(0,0,0,0.14)' },
  profileActive: { borderColor: '#4f46e5' },
  profileCardName: { fontWeight: 'bold', fontSize: 15 },
  iconBtn: { background: 'transparent', border: 'none', color: '#71717a', cursor: 'pointer' },
  
  chips: { display: 'flex', gap: 5, marginTop: 10 },
  chip: { fontSize: 11, background: '#27272a', color: '#a1a1aa', padding: '3px 8px', borderRadius: 5 },
  label: { fontSize: 12, color: '#71717a', fontWeight: 'bold', marginBottom: 10, display: 'block' },
  input: { width: '100%', background: '#0f0f11', border: '1px solid #2a2a2e', color: '#fff', padding: '8px 10px', borderRadius: 6, marginBottom: 8, outline: 'none' },
  select: { width: '100%', background: '#0f0f11', border: '1px solid #2a2a2e', color: '#fff', padding: '8px 10px', borderRadius: 6, outline: 'none' },
  empty: { textAlign: 'center', padding: '40px 0', color: '#71717a' },
  verTag: { fontSize: 11, background: '#27272a', padding: '2px 6px', borderRadius: 4, marginLeft: 5 },
  updateBadge: { fontSize: 11, background: '#312e81', color: '#c7d2fe', padding: '2px 6px', borderRadius: 4, marginLeft: 8 },
  linkedBadge: { fontSize: 11, background: '#12351f', color: '#86efac', padding: '2px 7px', borderRadius: 4, marginLeft: 8, fontWeight: 'normal' },
  pinBadge: { fontSize: 11, background: '#3b2f14', color: '#fbbf24', padding: '2px 6px', borderRadius: 4 },
  linkBtn: { background: '#14b8a6', color: '#04211d', border: 'none', padding: '7px 14px', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold', fontSize: 12 },
  playBtn: { background: '#16a34a', color: '#fff', border: 'none', padding: '7px 14px', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 },
  playBtnWide: { width: '100%', marginTop: 10, background: 'linear-gradient(135deg, #16a34a, #15803d)', color: '#fff', border: 'none', padding: '10px 12px', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 10px 24px rgba(22,163,74,0.25)' },
  stopBtnWide: { width: '100%', marginTop: 10, background: 'linear-gradient(135deg, #dc2626, #b91c1c)', color: '#fff', border: 'none', padding: '10px 12px', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 10px 24px rgba(220,38,38,0.25)' },
  logBox: { background: '#0a0a0c', border: '1px solid #26262c', borderRadius: 8, padding: '10px 12px', maxHeight: 260, overflowY: 'auto', fontFamily: 'Consolas, monospace', fontSize: 11, userSelect: 'text' },
  logLine: { whiteSpace: 'pre-wrap', color: '#9ca3af', lineHeight: 1.55, overflowWrap: 'anywhere' },
  logJumpBtn: { position: 'absolute', right: 12, bottom: 12, background: 'rgba(49,46,129,0.92)', border: '1px solid #4338ca', color: '#c7d2fe', borderRadius: 20, padding: '5px 12px', cursor: 'pointer', fontSize: 11, fontWeight: 'bold', boxShadow: '0 6px 16px rgba(0,0,0,0.35)' },
  crashBanner: { border: '1px solid #7f1d1d', background: '#180a0a', borderRadius: 8, padding: 14, marginBottom: 15 },
  crashTitle: { color: '#fca5a5', fontWeight: 'bold', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 },
  crashSummary: { color: '#e5c1c1', fontSize: 12, lineHeight: 1.55, userSelect: 'text', overflowWrap: 'anywhere' },
  sideNote: { fontSize: 11, color: '#8b8b95', marginTop: 8, lineHeight: 1.45, userSelect: 'text' },
  accountBlock: { background: 'linear-gradient(180deg, #202127, #18181b)', padding: 12, borderRadius: 8, marginTop: 12, border: '1px solid #2d2d34' },
  accountRow: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 },
  accountDot: { width: 8, height: 8, borderRadius: '50%', background: '#4ade80', flexShrink: 0, boxShadow: '0 0 8px rgba(74,222,128,0.6)' },
  accountName: { fontSize: 13, fontWeight: 'bold', color: '#e8e8ea', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  accountHint: { fontSize: 11, color: '#8b8b95', lineHeight: 1.45, marginTop: 6, marginBottom: 6, userSelect: 'text' },
  accountCode: { fontFamily: 'Consolas, monospace', fontSize: 20, fontWeight: 'bold', letterSpacing: 2, color: '#a5b4fc', background: '#101014', border: '1px solid #34343b', borderRadius: 6, padding: '8px 10px', textAlign: 'center', marginBottom: 8, userSelect: 'text' },
  msLoginBtn: { width: '100%', background: 'linear-gradient(135deg, #2563eb, #4f46e5)', color: '#fff', border: 'none', padding: '9px 12px', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', fontSize: 13, boxShadow: '0 10px 24px rgba(37,99,235,0.25)' },
  offlineBtn: { width: '100%', marginTop: 6, background: 'transparent', border: '1px dashed #3f3f46', color: '#8b8b95', padding: '7px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 12 },
  statRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 },
  statCard: { background: 'rgba(24,24,27,0.88)', border: '1px solid #2d2d34', borderRadius: 8, padding: 16, boxShadow: '0 10px 24px rgba(0,0,0,0.14)' },
  statValue: { fontSize: 20, fontWeight: 'bold', color: '#f4f4f5' },
  statLabel: { fontSize: 12, color: '#71717a', marginTop: 4 },
  progressWrap: { background: 'rgba(24,24,27,0.88)', border: '1px solid #2d2d34', borderRadius: 8, padding: 16, marginBottom: 18, display: 'flex', flexDirection: 'column', gap: 10 },
  progressTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, fontSize: 13, color: '#d4d4d8' },
  progressTrack: { height: 8, background: '#27272a', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', background: 'linear-gradient(90deg, #6366f1, #14b8a6)', transition: 'width 0.3s ease' },
  logRow: { display: 'flex', alignItems: 'center', gap: 14, padding: '11px 14px', background: 'rgba(24,24,27,0.88)', border: '1px solid #2d2d34', borderRadius: 8, fontSize: 13 },
  okBadge: { fontSize: 11, background: '#12351f', color: '#86efac', padding: '2px 6px', borderRadius: 4, marginLeft: 8 },
  recommendHero: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, background: 'linear-gradient(135deg, rgba(31,41,55,0.94), rgba(24,24,27,0.92))', border: '1px solid #30323b', borderRadius: 8, padding: 18, marginBottom: 18, boxShadow: '0 18px 40px rgba(0,0,0,0.20)' },
  heroKicker: { color: '#a5b4fc', fontSize: 12, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 },
  heroTitle: { color: '#f4f4f5', fontSize: 18, fontWeight: 'bold' },
  heroSub: { color: '#8b8b95', fontSize: 13, marginTop: 4 },
  recommendList: { display: 'flex', flexDirection: 'column', gap: 8 },
  recommendCard: { textAlign: 'left', color: '#e8e8ea', background: 'rgba(24,24,27,0.9)', border: '1px solid #2d2d34', borderRadius: 8, padding: 14, cursor: 'pointer', boxShadow: '0 14px 30px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', gap: 10 },
  recommendCardOpen: { borderColor: '#6366f1', background: 'rgba(37,37,55,0.95)' },
  recToggle: { fontSize: 11, padding: '3px 10px', borderRadius: 20, background: '#1a2a1a', color: '#4ade80', whiteSpace: 'nowrap', flexShrink: 0 },
  recToggleOpen: { fontSize: 11, padding: '3px 10px', borderRadius: 20, background: '#27272a', color: '#a1a1aa', whiteSpace: 'nowrap', flexShrink: 0 },
  recPanel: { background: 'rgba(15,15,20,0.96)', border: '1px solid #3a3a4a', borderTop: 'none', borderRadius: '0 0 8px 8px', padding: '16px 16px 12px', marginTop: -4 },
  recPanelLabel: { fontSize: 11, fontWeight: 'bold', color: '#52525b', letterSpacing: 0.8, textTransform: 'uppercase', margin: '0 0 8px' },
  recPanelFooter: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTop: '1px solid #2a2a2e', marginTop: 8 },
  recommendCardTop: { display: 'flex', gap: 12, alignItems: 'flex-start' },
  modIcon: { width: 42, height: 42, borderRadius: 8, objectFit: 'cover', flexShrink: 0, background: '#27272a', border: '1px solid #34343b' },
  modIconFallback: { width: 42, height: 42, borderRadius: 8, background: 'linear-gradient(135deg, #27272a, #1f2937)', color: '#a1a1aa', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid #34343b' },
  reasonBox: { color: '#c7d2fe', background: 'rgba(79,70,229,0.12)', border: '1px solid rgba(129,140,248,0.22)', borderRadius: 6, padding: '8px 9px', fontSize: 12, lineHeight: 1.4 },
}
