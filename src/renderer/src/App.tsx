import { useState, useEffect } from 'react'
import type { ModRow, SyncProgress, InstallProgress, SyncStatus } from '../../preload/index.d'

// ─── Types ────────────────────────────────────────────────────────────────────
type Page = 'search' | 'installed' | 'profiles' | 'settings'
type ViewMode = 'list' | 'detail'
type JunctionStatus = 'idle' | 'loading' | 'ok' | 'error'

interface Profile {
  id: string
  name: string
  gameVersion: string
  loader: 'Fabric' | 'Forge' | 'Quilt'
  modCount: number
  installPath?: string
}

const DEFAULT_PROFILES: Profile[] = [
  { id: '1', name: '생존 서버용', gameVersion: '1.20.1', loader: 'Fabric', modCount: 12 },
  { id: '2', name: '기술 모드팩', gameVersion: '1.19.2', loader: 'Forge',  modCount: 34 },
]

// ─── Inline SVG Icons ─────────────────────────────────────────────────────────
const Icon = {
  Search:    () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  Package:   () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>,
  User:      () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  Settings:  () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  Download:  () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  Check:     () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  Alert:     () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
  ArrowLeft: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>,
  Link:      () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage]            = useState<Page>('search')
  const [profiles]                 = useState<Profile[]>(DEFAULT_PROFILES)
  const [activeProfile, setActive] = useState<Profile>(DEFAULT_PROFILES[0])

  // Search & Navigation
  const [viewMode, setViewMode]     = useState<ViewMode>('list')
  const [query, setQuery]           = useState('')
  const [loader, setLoader]         = useState<string>('all')
  const [isSearching, setSearching] = useState(false)
  const [isAnalyzing, setAnalyzing] = useState(false)

  // Results
  const [searchResults, setSearchResults] = useState<ModRow[]>([])
  const [depResults, setDepResults]       = useState<ModRow[]>([])
  const [selected, setSelected]           = useState<Set<string>>(new Set())
  const [error, setError]                 = useState('')
  const [conflicts, setConflicts]         = useState<{ mod: any; conflictWith: string }[]>([])

  // Install
  const [installStatus, setInstSt] = useState<'idle' | 'installing' | 'done' | 'error'>('idle')
  const [installMsg, setInstMsg]   = useState('')

  // Settings / Sync
  const [syncStatus, setSyncSt]     = useState<SyncStatus | null>(null)
  const [syncProgress, setSyncProg] = useState<SyncProgress | null>(null)
  const [isSyncing, setIsSyncing]   = useState(false)
  const [syncLimit, setSyncLimit]   = useState(200)

  // Junction
  const [installPath, setInstPath]         = useState('.minecraft/mods')
  const [centralPath, setCentralPath]      = useState('ModForge/CentralMods')
  const [junctionStatus, setJunctionStatus] = useState<JunctionStatus>('idle')
  const [junctionMsg, setJunctionMsg]      = useState('')

  const api = window.electron

  useEffect(() => {
    const unsubSync    = api.onSyncProgress((d: SyncProgress) => setSyncProg(d))
    const unsubInstall = api.onInstallProgress((d: InstallProgress) => {
      setInstMsg(d.status === 'done' ? `${d.fileName} 설치됨` : `오류: ${d.reason}`)
    })
    return () => { unsubSync(); unsubInstall() }
  }, [])

  useEffect(() => { if (page === 'settings') loadSyncStatus() }, [page])

  const loadSyncStatus = async () => setSyncSt(await api.syncStatus())

  // ── 1. 검색 ───────────────────────────────────────────────────────────────────
  const handleSearch = async () => {
    if (!query.trim()) return
    setSearching(true)
    setError('')
    setSearchResults([])
    setDepResults([])
    setViewMode('list')
    setInstSt('idle')
    try {
      const res = await api.searchMod(query.trim(), {
        loader: loader === 'all' ? undefined : loader,
        gameVersion: activeProfile.gameVersion,
      })
      if (res.error || !res.results.length) {
        setError(res.error ?? '검색 결과가 없습니다')
        return
      }
      setSearchResults(res.results)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSearching(false)
    }
  }

  // ── 2. 모드 선택 → 의존성 분석 ──────────────────────────────────────────────
  const handleSelectMod = async (mod: ModRow) => {
    setAnalyzing(true)
    setError('')
    setDepResults([])
    setSelected(new Set())
    setConflicts([])
    setInstSt('idle')
    setViewMode('detail')
    try {
      const resolved = await api.resolveDeps(mod.modrinth_id, {
        gameVersion: activeProfile.gameVersion,
        loader: loader === 'all' ? undefined : loader,
      })

      if (resolved.error && !resolved.root) {
        setError(resolved.error)
        return
      }

      const flat = resolved.installOrder.length > 0
        ? resolved.installOrder
        : [{ ...mod, dep_type: 'required' as const, depth: 0, children: [] }]

      setDepResults(flat)
      setConflicts(resolved.conflicts ?? [])

      setSelected(new Set(
        flat.filter(m => m.dep_type === 'required').map(m => m.modrinth_id)
      ))

      if ((resolved.conflicts ?? []).length > 0) {
        setError(`${resolved.conflicts.length}개의 충돌이 감지됐습니다`)
      }
    } catch (e: any) {
      setError(e.message)
      setViewMode('list')
    } finally {
      setAnalyzing(false)
    }
  }

  // ── 의존성 토글 ───────────────────────────────────────────────────────────────
  const toggleMod = async (id: string, required: boolean) => {
    if (required) return
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelected(next)

    const validation = await api.validateSelection(Array.from(next), {
      gameVersion: activeProfile.gameVersion,
      loader: loader === 'all' ? undefined : loader,
    })
    setError(
      validation.ok ? '' : `선택한 모드 간 충돌이 있습니다 (${validation.conflicts.length}건)`
    )
  }

  // ── 설치 ─────────────────────────────────────────────────────────────────────
  const handleInstall = async () => {
    const toInstall = depResults.filter(m => selected.has(m.modrinth_id))
    setInstSt('installing')
    try {
      const res = await api.downloadMods(toInstall, activeProfile.installPath)
      setInstSt(res.success ? 'done' : 'error')
      setInstMsg(
        res.success
          ? `${res.files.length}개 모드 설치 완료`
          : `${res.failed.length}개 실패: ${res.failed[0]?.reason}`
      )
    } catch (e: any) {
      setInstSt('error')
      setInstMsg(e.message)
    }
  }

  // ── Junction ──────────────────────────────────────────────────────────────────
  const handleCreateJunction = async () => {
    if (!centralPath.trim() || !installPath.trim()) {
      setJunctionStatus('error')
      setJunctionMsg('경로를 모두 입력해주세요.')
      return
    }
    setJunctionStatus('loading')
    setJunctionMsg('연결 중...')
    try {
      const res = await api.createJunction(centralPath, installPath)
      setJunctionStatus(res.ok ? 'ok' : 'error')
      setJunctionMsg(res.ok ? '중앙 보관소와 Minecraft 폴더가 성공적으로 연결되었습니다.' : `오류: ${res.error}`)
    } catch (e: any) {
      setJunctionStatus('error')
      setJunctionMsg(`서버 오류: ${e.message}`)
    }
  }

  const handleRemoveJunction = async () => {
    if (!installPath.trim()) {
      setJunctionStatus('error')
      setJunctionMsg('Minecraft 경로를 입력해주세요.')
      return
    }
    setJunctionStatus('loading')
    setJunctionMsg('해제 중...')
    try {
      const res = await api.removeJunction(installPath)
      setJunctionStatus(res.ok ? 'ok' : 'error')
      setJunctionMsg(res.ok ? '폴더 연결이 성공적으로 해제되었습니다.' : `오류: ${res.error}`)
    } catch (e: any) {
      setJunctionStatus('error')
      setJunctionMsg(`서버 오류: ${e.message}`)
    }
  }

  // ── 동기화 ───────────────────────────────────────────────────────────────────
  const handleSync = async () => {
    setIsSyncing(true)
    setSyncProg({ total: 0, synced: 0, name: '준비 중...' })
    await api.syncModrinth({ limit: syncLimit })
    setIsSyncing(false)
    setSyncProg(null)
    await loadSyncStatus()
  }

  const pct = syncProgress?.total
    ? Math.round((syncProgress.synced / syncProgress.total) * 100) : 0

  const loaders = ['all', 'Fabric', 'Forge', 'Quilt']

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={s.root}>

      {/* 사이드바 */}
      <aside style={s.sidebar}>
        <div style={s.logo}>
          <div style={s.logoMark}>MF</div>
          <span style={s.logoText}>ModForge</span>
        </div>

        <div style={s.profileBlock}>
          <p style={s.label}>활성 프로필</p>
          <select
            style={s.profileSelect}
            value={activeProfile.id}
            onChange={e => setActive(profiles.find(p => p.id === e.target.value) ?? profiles[0])}
          >
            {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div style={s.chips}>
            <span style={s.chip}>{activeProfile.loader}</span>
            <span style={s.chip}>{activeProfile.gameVersion}</span>
            <span style={{ ...s.chip, marginLeft: 'auto' }}>{activeProfile.modCount}개</span>
          </div>
        </div>

        <nav style={s.nav}>
          {([
            ['search',    '모드 검색',   Icon.Search],
            ['installed', '설치된 모드', Icon.Package],
            ['profiles',  '프로필 관리', Icon.User],
            ['settings',  '설정',        Icon.Settings],
          ] as [Page, string, () => JSX.Element][]).map(([id, label, Ic]) => (
            <button key={id} onClick={() => setPage(id)}
              style={{ ...s.navBtn, ...(page === id ? s.navActive : {}) }}>
              <Ic /><span>{label}</span>
            </button>
          ))}
        </nav>

        <div style={s.footer}><span style={s.footerTxt}>v0.1.0-alpha</span></div>
      </aside>

      {/* 메인 */}
      <main style={s.main}>

        {/* 검색 페이지 */}
        {page === 'search' && (
          <div style={s.page}>
            <div style={s.pageHead}>
              <h1 style={s.pageTitle}>모드 검색</h1>
              <p style={s.pageDesc}>모드를 검색하면 필수·추천 의존성을 자동으로 분석합니다</p>
            </div>

            <div style={s.searchRow}>
              <div style={s.searchBox}>
                <Icon.Search />
                <input
                  style={s.searchInput}
                  placeholder="모드 이름 검색 (예: worldedit, fabric api...)"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                />
              </div>
              <button style={s.primaryBtn} onClick={handleSearch} disabled={isSearching}>
                {isSearching ? '검색 중...' : '검색'}
              </button>
            </div>

            <div style={s.filterRow}>
              {loaders.map(l => (
                <button key={l} onClick={() => setLoader(l)}
                  style={{ ...s.filterChip, ...(loader === l ? s.filterActive : {}) }}>
                  {l === 'all' ? '전체' : l}
                </button>
              ))}
            </div>

            {error && (
              <div style={s.errorBanner}><Icon.Alert /><span>{error}</span></div>
            )}

            {/* 검색 결과 목록 */}
            {viewMode === 'list' && searchResults.length > 0 && (
              <>
                <p style={s.label}>검색 결과 ({searchResults.length}건)</p>
                <div style={s.listWrap}>
                  {searchResults.map(mod => (
                    <ModCard
                      key={mod.modrinth_id} mod={mod}
                      required={false} checked={false}
                      onToggle={() => handleSelectMod(mod)}
                      isSelectableResult
                    />
                  ))}
                </div>
              </>
            )}

            {/* 의존성 분석 화면 */}
            {viewMode === 'detail' && (
              <>
                <div style={s.detailHeader}>
                  <p style={{ ...s.label, margin: 0 }}>선택한 모드</p>
                  <button style={s.backBtn} onClick={() => setViewMode('list')}>
                    <Icon.ArrowLeft /> 목록으로 돌아가기
                  </button>
                </div>

                {isAnalyzing ? (
                  <div style={s.analyzingBox}>
                    <span style={s.mutedTxt}>의존성 모드 분석 중...</span>
                  </div>
                ) : depResults.length > 0 ? (
                  <>
                    {conflicts.length > 0 && (
                      <div style={s.conflictBanner}>
                        <Icon.Alert />
                        <div>
                          <div style={{ fontWeight: 600, marginBottom: 4 }}>모드 충돌 감지됨</div>
                          {conflicts.map((c, i) => (
                            <div key={i} style={s.conflictRow}>
                              <span style={s.conflictMod}>{c.mod.name}</span>
                              <span style={s.conflictArrow}>↔</span>
                              <span style={s.conflictMod}>{c.conflictWith}</span>
                              <span style={s.conflictLabel}>incompatible</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 위상 정렬 결과: 마지막 항목이 루트(선택한 모드) */}
                    <div style={{ marginBottom: 20 }}>
                      <ModCard mod={depResults[depResults.length - 1]} required checked onToggle={() => {}} />
                    </div>

                    {depResults.length > 1 ? (
                      <>
                        <p style={s.label}>의존성 모드 ({depResults.length - 1}개)</p>
                        <div style={s.depList}>
                          {depResults.slice(0, -1).map(mod => {
                            const isReq = mod.dep_type === 'required' || !mod.dep_type
                            return (
                              <ModCard
                                key={mod.modrinth_id} mod={mod}
                                required={isReq}
                                checked={selected.has(mod.modrinth_id)}
                                onToggle={() => toggleMod(mod.modrinth_id, isReq)}
                              />
                            )
                          })}
                        </div>
                      </>
                    ) : (
                      <p style={s.mutedTxt}>필요한 의존성 모드가 없습니다.</p>
                    )}

                    <div style={s.installFooter}>
                      <div>
                        {installStatus === 'done'       && <span style={s.successTxt}><Icon.Check /> {installMsg}</span>}
                        {installStatus === 'error'      && <span style={s.errorTxt}><Icon.Alert /> {installMsg}</span>}
                        {installStatus === 'installing' && <span style={s.mutedTxt}>설치 중...</span>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={s.mutedTxt}>{selected.size}개 선택됨</span>
                        <button
                          style={{ ...s.installBtn, opacity: installStatus === 'installing' || selected.size === 0 ? 0.5 : 1 }}
                          onClick={handleInstall}
                          disabled={installStatus === 'installing' || selected.size === 0}
                        >
                          <Icon.Download />
                          {installStatus === 'installing' ? '설치 중...' : `${activeProfile.name}에 설치`}
                        </button>
                      </div>
                    </div>
                  </>
                ) : null}
              </>
            )}

            {/* 빈 상태 */}
            {viewMode === 'list' && searchResults.length === 0 && !isSearching && !error && (
              <div style={s.empty}>
                <div style={s.emptyIcon}><Icon.Package /></div>
                <p style={s.emptyTitle}>모드를 검색해 보세요</p>
                <p style={s.emptyDesc}>모드 이름을 입력하면 의존성 목록을 자동으로 분석합니다</p>
              </div>
            )}
          </div>
        )}

        {/* 설치된 모드 */}
        {page === 'installed' && (
          <div style={s.page}>
            <div style={s.pageHead}>
              <h1 style={s.pageTitle}>설치된 모드</h1>
              <p style={s.pageDesc}>{activeProfile.name} · {activeProfile.modCount}개 설치됨</p>
            </div>
            <div style={s.empty}>
              <div style={s.emptyIcon}><Icon.Package /></div>
              <p style={s.emptyTitle}>준비 중인 기능입니다</p>
              <p style={s.emptyDesc}>설치 목록 및 업데이트 관리 기능이 곧 추가됩니다</p>
            </div>
          </div>
        )}

        {/* 프로필 관리 */}
        {page === 'profiles' && (
          <div style={s.page}>
            <div style={s.pageHead}>
              <h1 style={s.pageTitle}>프로필 관리</h1>
              <p style={s.pageDesc}>게임 버전·로더별로 모드 세트를 분리 관리합니다</p>
            </div>
            <div style={s.profileGrid}>
              {profiles.map(p => (
                <div key={p.id} onClick={() => setActive(p)}
                  style={{ ...s.profileCard, ...(p.id === activeProfile.id ? s.profileActive : {}) }}>
                  <div style={s.profileCardHead}>
                    <span style={s.profileCardName}>{p.name}</span>
                    {p.id === activeProfile.id && <span style={s.dot} />}
                  </div>
                  <div style={s.chips}>
                    <span style={s.chip}>{p.loader}</span>
                    <span style={s.chip}>{p.gameVersion}</span>
                  </div>
                  <p style={s.profileCount}>{p.modCount}개의 모드</p>
                </div>
              ))}
              <div style={{ ...s.profileCard, ...s.profileAdd }}>
                <span style={s.addIcon}>+</span>
                <p style={s.addText}>새 프로필 추가</p>
              </div>
            </div>
          </div>
        )}

        {/* 설정 */}
        {page === 'settings' && (
          <div style={s.page}>
            <div style={s.pageHead}>
              <h1 style={s.pageTitle}>설정</h1>
              <p style={s.pageDesc}>앱 환경과 데이터베이스를 관리합니다</p>
            </div>

            <section style={s.section}>
              <p style={s.label}>Minecraft Mods 폴더 (설치 타겟)</p>
              <div style={s.row}>
                <input style={s.input} value={installPath} onChange={e => setInstPath(e.target.value)} />
                <button style={s.ghostBtn} onClick={() => api.openFolder(installPath)}>폴더 열기</button>
              </div>

              <p style={{ ...s.label, marginTop: 16 }}>중앙 모드 보관소 (실제 저장소)</p>
              <div style={s.row}>
                <input style={s.input} value={centralPath} onChange={e => setCentralPath(e.target.value)} />
                <button style={s.ghostBtn} onClick={() => api.openFolder(centralPath)}>폴더 열기</button>
              </div>
              <p style={s.hint}>
                모드를 중앙 보관소에 통합 저장하고 게임 폴더에는 바로가기(Junction)만 생성하여 용량을 절약합니다.
              </p>

              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button
                  style={{ ...s.primaryBtn, opacity: junctionStatus === 'loading' ? 0.6 : 1 }}
                  onClick={handleCreateJunction}
                  disabled={junctionStatus === 'loading'}
                >
                  <Icon.Link /> Junction 연결
                </button>
                <button
                  style={{ ...s.ghostBtn, color: '#f87171', borderColor: '#3f1515', padding: '0 18px', height: 40, borderRadius: 9, opacity: junctionStatus === 'loading' ? 0.6 : 1 }}
                  onClick={handleRemoveJunction}
                  disabled={junctionStatus === 'loading'}
                >
                  Junction 해제
                </button>
              </div>

              {junctionMsg && (
                <p style={{
                  ...s.hint, marginTop: 10,
                  color: junctionStatus === 'ok' ? '#4ade80' : junctionStatus === 'error' ? '#f87171' : '#fb923c',
                }}>
                  {junctionMsg}
                </p>
              )}
            </section>

            <section style={s.section}>
              <p style={s.label}>Modrinth DB 동기화</p>
              <div style={s.statsGrid}>
                <div style={s.statCard}>
                  <span style={s.statLabel}>저장된 모드</span>
                  <span style={s.statVal}>{syncStatus?.totalMods?.toLocaleString() ?? '—'}</span>
                </div>
                <div style={s.statCard}>
                  <span style={s.statLabel}>마지막 동기화</span>
                  <span style={s.statVal}>
                    {syncStatus?.logs?.[0]?.finished_at
                      ? new Date(syncStatus.logs[0].finished_at).toLocaleDateString('ko-KR')
                      : '없음'}
                  </span>
                </div>
                <div style={s.statCard}>
                  <span style={s.statLabel}>상태</span>
                  <span style={{
                    ...s.statVal,
                    color: syncStatus?.logs?.[0]?.status === 'done'  ? '#4ade80'
                         : syncStatus?.logs?.[0]?.status === 'error' ? '#f87171'
                         : '#e8e8ea',
                  }}>
                    {syncStatus?.logs?.[0]?.status === 'done'    ? '완료'
                   : syncStatus?.logs?.[0]?.status === 'error'   ? '오류'
                   : syncStatus?.logs?.[0]?.status === 'running' ? '진행 중'
                   : '없음'}
                  </span>
                </div>
              </div>

              {isSyncing && syncProgress && (
                <div style={s.progWrap}>
                  <div style={s.progHead}>
                    <span style={s.mutedTxt}>{syncProgress.name}</span>
                    <span style={s.mutedTxt}>{syncProgress.synced.toLocaleString()} / {syncProgress.total.toLocaleString()}</span>
                  </div>
                  <div style={s.progTrack}><div style={{ ...s.progBar, width: `${pct}%` }} /></div>
                  <span style={s.mutedTxt}>{pct}%</span>
                </div>
              )}

              <div style={s.syncRow}>
                <select style={s.select} value={syncLimit}
                  onChange={e => setSyncLimit(Number(e.target.value))} disabled={isSyncing}>
                  <option value={100}>100개 (빠름 ~5분)</option>
                  <option value={200}>200개 (기본 ~10분)</option>
                  <option value={500}>500개 (~25분)</option>
                  <option value={2000}>전체 (~2시간)</option>
                </select>
                <button
                  style={{ ...s.primaryBtn, opacity: isSyncing ? 0.6 : 1 }}
                  onClick={handleSync} disabled={isSyncing}
                >
                  {isSyncing ? '동기화 중...' : 'Modrinth에서 데이터 가져오기'}
                </button>
              </div>
            </section>

            {(syncStatus?.logs?.length ?? 0) > 0 && (
              <section style={s.section}>
                <p style={s.label}>동기화 기록</p>
                {syncStatus!.logs.map(log => (
                  <div key={log.id} style={s.logRow}>
                    <span style={{
                      ...s.logDot,
                      background: log.status === 'done'  ? '#4ade80'
                               : log.status === 'error'  ? '#f87171'
                               : '#facc15',
                    }} />
                    <span style={s.mutedTxt}>{new Date(log.started_at).toLocaleString('ko-KR')}</span>
                    <span style={{ ...s.mutedTxt, marginLeft: 'auto' }}>{log.mods_synced.toLocaleString()}개</span>
                  </div>
                ))}
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

// ─── ModCard ──────────────────────────────────────────────────────────────────
function ModCard({ mod, required, checked, onToggle, isSelectableResult }: {
  mod: ModRow
  required: boolean
  checked: boolean
  onToggle: () => void
  isSelectableResult?: boolean
}) {
  const desc = mod.description
    ? mod.description.length > 80 ? mod.description.slice(0, 80) + '...' : mod.description
    : null

  return (
    <div
      onClick={() => (!required || isSelectableResult) && onToggle()}
      style={{
        ...s.modCard,
        ...(checked ? s.modChecked : {}),
        cursor: (required && !isSelectableResult) ? 'default' : 'pointer',
      }}
    >
      <div style={s.modLeft}>
        {!isSelectableResult && (
          <div style={{ ...s.checkbox, ...(checked ? s.checkboxOn : {}) }}>
            {checked && <Icon.Check />}
          </div>
        )}
        <div>
          <div style={s.modName}>{mod.name}</div>
          {desc && <div style={s.modDesc}>{desc}</div>}
          <div style={s.modMeta}>
            <span style={s.verTag}>v{mod.version_number ?? '알 수 없음'}</span>
            {mod.downloads > 0 && (
              <span style={s.mutedTxt}>{mod.downloads.toLocaleString()} 다운로드</span>
            )}
          </div>
        </div>
      </div>
      {isSelectableResult
        ? <span style={s.selectBadge}>선택하기</span>
        : <span style={required ? s.reqBadge : s.optBadge}>{required ? '필수' : '선택'}</span>
      }
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  root: { display: 'flex', height: '100vh', fontFamily: "'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif", background: '#0f0f11', color: '#e8e8ea', overflow: 'hidden' },

  sidebar: { width: 210, minWidth: 210, background: '#18181b', borderRight: '1px solid #2a2a2e', display: 'flex', flexDirection: 'column', padding: '18px 10px' },
  logo: { display: 'flex', alignItems: 'center', gap: 8, padding: '0 6px 16px' },
  logoMark: { width: 28, height: 28, borderRadius: 7, background: '#4f46e5', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 },
  logoText: { fontSize: 14, fontWeight: 700, color: '#e8e8ea', letterSpacing: -0.3 },

  profileBlock: { background: '#1f1f23', borderRadius: 9, padding: '10px', marginBottom: 14, border: '1px solid #2a2a2e' },
  profileSelect: { width: '100%', background: '#18181b', color: '#e8e8ea', border: '1px solid #2a2a2e', borderRadius: 6, padding: '5px 7px', fontSize: 12, marginBottom: 7, outline: 'none' },

  nav: { display: 'flex', flexDirection: 'column', gap: 2, flex: 1 },
  navBtn: { display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 7, background: 'transparent', border: 'none', color: '#71717a', fontSize: 12, cursor: 'pointer', textAlign: 'left' },
  navActive: { background: '#27272a', color: '#e8e8ea' },
  footer: { paddingTop: 10, borderTop: '1px solid #2a2a2e' },
  footerTxt: { fontSize: 10, color: '#52525b' },

  main: { flex: 1, overflow: 'auto', background: '#0f0f11' },
  page: { maxWidth: 740, margin: '0 auto', padding: '28px' },
  pageHead: { marginBottom: 24 },
  pageTitle: { fontSize: 20, fontWeight: 700, color: '#e8e8ea', margin: 0, letterSpacing: -0.4 },
  pageDesc: { fontSize: 13, color: '#71717a', marginTop: 4 },

  searchRow: { display: 'flex', gap: 8, marginBottom: 12 },
  searchBox: { flex: 1, display: 'flex', alignItems: 'center', gap: 9, background: '#18181b', border: '1px solid #2a2a2e', borderRadius: 9, padding: '0 12px', color: '#52525b' },
  searchInput: { flex: 1, background: 'transparent', border: 'none', color: '#e8e8ea', fontSize: 13, padding: '10px 0', outline: 'none' },
  primaryBtn: { display: 'flex', alignItems: 'center', gap: 6, padding: '0 18px', height: 40, borderRadius: 9, background: '#4f46e5', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },

  filterRow: { display: 'flex', gap: 5, marginBottom: 22 },
  filterChip: { padding: '3px 10px', borderRadius: 20, fontSize: 11, background: '#18181b', border: '1px solid #2a2a2e', color: '#71717a', cursor: 'pointer' },
  filterActive: { background: '#27272a', color: '#e8e8ea', borderColor: '#3f3f46' },

  label: { fontSize: 10, fontWeight: 600, color: '#52525b', letterSpacing: 0.8, textTransform: 'uppercase', margin: '0 0 8px' },

  errorBanner: { display: 'flex', alignItems: 'center', gap: 7, padding: '9px 12px', borderRadius: 7, background: '#1c0a0a', border: '1px solid #3f1515', color: '#f87171', fontSize: 12, marginBottom: 14 },

  listWrap: { display: 'flex', flexDirection: 'column', gap: 6 },

  detailHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  backBtn: { display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: '#a1a1aa', fontSize: 13, cursor: 'pointer', padding: 0 },

  analyzingBox: { padding: '24px', borderRadius: 9, background: '#18181b', border: '1px solid #2a2a2e', marginBottom: 16, textAlign: 'center' },

  conflictBanner: { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', borderRadius: 9, background: '#1c0f0a', border: '1px solid #5c2a10', color: '#fb923c', fontSize: 12, marginBottom: 16 },
  conflictRow: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 },
  conflictMod: { background: '#2a1a0a', padding: '1px 6px', borderRadius: 4, color: '#fdba74', fontSize: 11 },
  conflictArrow: { color: '#f87171', fontSize: 11 },
  conflictLabel: { fontSize: 10, padding: '1px 5px', borderRadius: 3, background: '#3f1515', color: '#f87171', marginLeft: 4 },

  depList: { display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 4 },

  modCard: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 13px', borderRadius: 9, background: '#18181b', border: '1px solid #2a2a2e', marginBottom: 5 },
  modChecked: { borderColor: '#4f46e5' },
  modLeft: { display: 'flex', alignItems: 'flex-start', gap: 10 },
  checkbox: { width: 16, height: 16, borderRadius: 4, border: '1.5px solid #3f3f46', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 },
  checkboxOn: { background: '#4f46e5', borderColor: '#4f46e5', color: '#fff' },
  modName: { fontSize: 13, fontWeight: 600, color: '#e8e8ea', marginBottom: 2 },
  modDesc: { fontSize: 11, color: '#71717a', marginBottom: 4, lineHeight: 1.4 },
  modMeta: { display: 'flex', alignItems: 'center', gap: 7 },
  verTag: { fontSize: 10, padding: '1px 5px', borderRadius: 3, background: '#27272a', color: '#a1a1aa' },
  reqBadge: { fontSize: 10, padding: '2px 7px', borderRadius: 20, background: '#1a1040', color: '#818cf8', whiteSpace: 'nowrap' },
  optBadge: { fontSize: 10, padding: '2px 7px', borderRadius: 20, background: '#1a2a1a', color: '#4ade80', whiteSpace: 'nowrap' },
  selectBadge: { fontSize: 10, padding: '2px 7px', borderRadius: 20, background: '#27272a', color: '#a1a1aa', whiteSpace: 'nowrap' },

  installFooter: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderTop: '1px solid #2a2a2e', marginTop: 6 },
  installBtn: { display: 'flex', alignItems: 'center', gap: 7, padding: '0 18px', height: 38, borderRadius: 8, background: '#4f46e5', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  successTxt: { display: 'flex', alignItems: 'center', gap: 5, color: '#4ade80', fontSize: 12 },
  errorTxt: { display: 'flex', alignItems: 'center', gap: 5, color: '#f87171', fontSize: 12 },
  mutedTxt: { fontSize: 12, color: '#52525b' },

  empty: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 0', color: '#52525b' },
  emptyIcon: { marginBottom: 14, opacity: 0.4 },
  emptyTitle: { fontSize: 14, fontWeight: 600, color: '#71717a', margin: 0 },
  emptyDesc: { fontSize: 12, color: '#52525b', marginTop: 5 },

  profileGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 },
  profileCard: { padding: '14px', borderRadius: 11, background: '#18181b', border: '1px solid #2a2a2e', cursor: 'pointer' },
  profileActive: { borderColor: '#4f46e5' },
  profileCardHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 },
  profileCardName: { fontSize: 13, fontWeight: 600, color: '#e8e8ea' },
  dot: { width: 6, height: 6, borderRadius: '50%', background: '#4f46e5' },
  profileCount: { fontSize: 11, color: '#52525b', margin: '6px 0 0' },
  profileAdd: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.45, borderStyle: 'dashed' },
  addIcon: { fontSize: 22, color: '#71717a', marginBottom: 4 },
  addText: { fontSize: 12, color: '#71717a', margin: 0 },

  chips: { display: 'flex', gap: 4, flexWrap: 'wrap' },
  chip: { fontSize: 10, padding: '2px 5px', borderRadius: 4, background: '#2a2a2e', color: '#a1a1aa' },

  section: { marginBottom: 32, paddingBottom: 24, borderBottom: '1px solid #2a2a2e' },
  row: { display: 'flex', gap: 8, marginBottom: 5 },
  input: { flex: 1, background: '#18181b', border: '1px solid #2a2a2e', borderRadius: 7, color: '#a1a1aa', padding: '7px 10px', fontSize: 12, outline: 'none' },
  hint: { fontSize: 11, color: '#52525b', margin: '4px 0 0' },
  ghostBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '7px 12px', borderRadius: 7, background: 'transparent', border: '1px solid #2a2a2e', color: '#a1a1aa', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' },

  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 9, marginBottom: 14 },
  statCard: { background: '#18181b', border: '1px solid #2a2a2e', borderRadius: 9, padding: '11px 12px', display: 'flex', flexDirection: 'column', gap: 4 },
  statLabel: { fontSize: 10, color: '#52525b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 },
  statVal: { fontSize: 17, fontWeight: 700, color: '#e8e8ea' },

  progWrap: { background: '#18181b', border: '1px solid #2a2a2e', borderRadius: 9, padding: '12px', marginBottom: 12 },
  progHead: { display: 'flex', justifyContent: 'space-between', marginBottom: 7 },
  progTrack: { background: '#27272a', borderRadius: 3, height: 5, marginBottom: 5 },
  progBar: { background: '#4f46e5', borderRadius: 3, height: 5, transition: 'width 0.3s ease' },

  syncRow: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 },
  select: { background: '#18181b', border: '1px solid #2a2a2e', borderRadius: 7, color: '#e8e8ea', padding: '6px 9px', fontSize: 12, outline: 'none' },

  logRow: { display: 'flex', alignItems: 'center', gap: 9, padding: '7px 0', borderBottom: '1px solid #1f1f23' },
  logDot: { width: 6, height: 6, borderRadius: '50%', flexShrink: 0 },
}