import { useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Mod {
  id: string
  project_id: string
  version_number: string
  name?: string
  description?: string
  downloads?: number
  dep_type?: 'required' | 'optional'
}

interface Profile {
  id: string
  name: string
  gameVersion: string
  loader: 'Fabric' | 'Forge' | 'Quilt'
  modCount: number
}

type Page = 'search' | 'installed' | 'profiles' | 'settings'

// ─── Mock Profiles ────────────────────────────────────────────────────────────
const MOCK_PROFILES: Profile[] = [
  { id: '1', name: '생존 서버용', gameVersion: '1.20.1', loader: 'Fabric', modCount: 12 },
  { id: '2', name: '기술 모드팩', gameVersion: '1.19.2', loader: 'Forge', modCount: 34 },
]

// ─── Icons (inline SVG) ───────────────────────────────────────────────────────
const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
)
const PackageIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
  </svg>
)
const UserIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
  </svg>
)
const SettingsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
)
const DownloadIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
)
const CheckIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
)
const AlertIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
)

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState<Page>('search')
  const [activeProfile, setActiveProfile] = useState<Profile>(MOCK_PROFILES[0])
  const [profiles] = useState<Profile[]>(MOCK_PROFILES)

  // Search state
  const [query, setQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [results, setResults] = useState<Mod[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [installStatus, setInstallStatus] = useState<'idle' | 'installing' | 'done' | 'error'>('idle')
  const [installMsg, setInstallMsg] = useState('')
  const [filterLoader, setFilterLoader] = useState<string>('all')

  const handleSearch = async () => {
    if (!query.trim()) return
    setIsSearching(true)
    setError('')
    setResults([])
    setSelected(new Set())
    setInstallStatus('idle')
    try {
      const res = await (window as any).electron.ipcRenderer.invoke('search-mod', query.trim().toLowerCase())
      if (res.error) { setError(res.error) }
      else {
        setResults(res)
        const req = new Set<string>(res.filter((m: Mod) => m.dep_type === 'required' || !m.dep_type).map((m: Mod) => m.id || m.project_id))
        setSelected(req)
      }
    } catch (e: any) { setError(e.message) }
    finally { setIsSearching(false) }
  }

  const toggleMod = (id: string, required: boolean) => {
    if (required) return
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleInstall = async () => {
    const toInstall = results.filter(m => selected.has(m.id || m.project_id))
    setInstallStatus('installing')
    setInstallMsg('')
    try {
      const res = await (window as any).electron.ipcRenderer.invoke('download-mods', toInstall)
      if (res.success) {
        setInstallStatus('done')
        setInstallMsg(`${res.files?.length ?? toInstall.length}개 모드 설치 완료`)
      } else {
        setInstallStatus('error')
        setInstallMsg(res.error ?? '알 수 없는 오류')
      }
    } catch (e: any) {
      setInstallStatus('error')
      setInstallMsg(e.message)
    }
  }

  const loaders = ['all', 'Fabric', 'Forge', 'Quilt']
  const mainMod = results[0]
  const deps = results.slice(1)

  return (
    <div style={styles.root}>
      {/* ── Sidebar ── */}
      <aside style={styles.sidebar}>
        <div style={styles.logo}>
          <div style={styles.logoMark}>MF</div>
          <span style={styles.logoText}>ModForge</span>
        </div>

        {/* Profile selector */}
        <div style={styles.profileBlock}>
          <p style={styles.sectionLabel}>활성 프로필</p>
          <select
            style={styles.profileSelect}
            value={activeProfile.id}
            onChange={e => {
              const p = profiles.find(p => p.id === e.target.value)
              if (p) setActiveProfile(p)
            }}
          >
            {profiles.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <div style={styles.profileMeta}>
            <span style={styles.badge}>{activeProfile.loader}</span>
            <span style={styles.badge}>{activeProfile.gameVersion}</span>
            <span style={{ ...styles.badge, marginLeft: 'auto' }}>{activeProfile.modCount}개</span>
          </div>
        </div>

        {/* Nav */}
        <nav style={styles.nav}>
          {([
            ['search', '모드 검색', SearchIcon],
            ['installed', '설치된 모드', PackageIcon],
            ['profiles', '프로필 관리', UserIcon],
            ['settings', '설정', SettingsIcon],
          ] as [Page, string, () => JSX.Element][]).map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setPage(id)}
              style={{ ...styles.navBtn, ...(page === id ? styles.navBtnActive : {}) }}
            >
              <Icon />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div style={styles.sidebarFooter}>
          <span style={styles.footerText}>v0.1.0-alpha</span>
        </div>
      </aside>

      {/* ── Main ── */}
      <main style={styles.main}>

        {/* Search Page */}
        {page === 'search' && (
          <div style={styles.pageWrap}>
            <div style={styles.pageHeader}>
              <h1 style={styles.pageTitle}>모드 검색</h1>
              <p style={styles.pageDesc}>모드 이름을 검색하면 필수·추천 의존성을 자동으로 찾아드립니다</p>
            </div>

            {/* Search bar */}
            <div style={styles.searchRow}>
              <div style={styles.searchBox}>
                <span style={styles.searchIcon}><SearchIcon /></span>
                <input
                  style={styles.searchInput}
                  placeholder="모드 이름 검색 (예: worldedit, fabric api...)"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                />
              </div>
              <button style={styles.primaryBtn} onClick={handleSearch} disabled={isSearching}>
                {isSearching ? '검색 중...' : '검색'}
              </button>
            </div>

            {/* Loader filter */}
            <div style={styles.filterRow}>
              {loaders.map(l => (
                <button
                  key={l}
                  onClick={() => setFilterLoader(l)}
                  style={{ ...styles.filterChip, ...(filterLoader === l ? styles.filterChipActive : {}) }}
                >
                  {l === 'all' ? '전체' : l}
                </button>
              ))}
            </div>

            {/* Error */}
            {error && (
              <div style={styles.errorBanner}>
                <AlertIcon />
                <span>{error}</span>
              </div>
            )}

            {/* Results */}
            {results.length > 0 && (
              <div style={styles.resultsWrap}>
                {/* Main mod */}
                <div style={styles.section}>
                  <p style={styles.sectionLabel}>선택한 모드</p>
                  <ModCard
                    mod={mainMod}
                    required
                    checked={selected.has(mainMod.id || mainMod.project_id)}
                    onToggle={() => {}}
                  />
                </div>

                {/* Dependencies */}
                {deps.length > 0 && (
                  <div style={styles.section}>
                    <p style={styles.sectionLabel}>의존성 모드 ({deps.length}개)</p>
                    <div style={styles.depList}>
                      {deps.map(mod => {
                        const id = mod.id || mod.project_id
                        const isRequired = mod.dep_type === 'required' || !mod.dep_type
                        return (
                          <ModCard
                            key={id}
                            mod={mod}
                            required={isRequired}
                            checked={selected.has(id)}
                            onToggle={() => toggleMod(id, isRequired)}
                          />
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Install footer */}
                <div style={styles.installFooter}>
                  <div>
                    {installStatus === 'done' && (
                      <span style={styles.successText}><CheckIcon /> {installMsg}</span>
                    )}
                    {installStatus === 'error' && (
                      <span style={styles.errorText}><AlertIcon /> {installMsg}</span>
                    )}
                    {installStatus === 'installing' && (
                      <span style={styles.mutedText}>설치 중...</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={styles.mutedText}>{selected.size}개 선택됨</span>
                    <button
                      style={styles.installBtn}
                      onClick={handleInstall}
                      disabled={installStatus === 'installing' || selected.size === 0}
                    >
                      <DownloadIcon />
                      {installStatus === 'installing' ? '설치 중...' : `${activeProfile.name}에 설치`}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Empty state */}
            {results.length === 0 && !isSearching && !error && (
              <div style={styles.emptyState}>
                <div style={styles.emptyIcon}><PackageIcon /></div>
                <p style={styles.emptyTitle}>모드를 검색해 보세요</p>
                <p style={styles.emptyDesc}>모드 이름을 입력하면 의존성 목록을 자동으로 분석합니다</p>
              </div>
            )}
          </div>
        )}

        {/* Installed Page */}
        {page === 'installed' && (
          <div style={styles.pageWrap}>
            <div style={styles.pageHeader}>
              <h1 style={styles.pageTitle}>설치된 모드</h1>
              <p style={styles.pageDesc}>{activeProfile.name} · {activeProfile.modCount}개 설치됨</p>
            </div>
            <div style={styles.emptyState}>
              <div style={styles.emptyIcon}><PackageIcon /></div>
              <p style={styles.emptyTitle}>준비 중인 기능입니다</p>
              <p style={styles.emptyDesc}>설치된 모드 목록과 업데이트 관리 기능이 곧 추가됩니다</p>
            </div>
          </div>
        )}

        {/* Profiles Page */}
        {page === 'profiles' && (
          <div style={styles.pageWrap}>
            <div style={styles.pageHeader}>
              <h1 style={styles.pageTitle}>프로필 관리</h1>
              <p style={styles.pageDesc}>게임 버전·로더별로 모드 세트를 분리 관리합니다</p>
            </div>
            <div style={styles.profileGrid}>
              {profiles.map(p => (
                <div
                  key={p.id}
                  style={{ ...styles.profileCard, ...(p.id === activeProfile.id ? styles.profileCardActive : {}) }}
                  onClick={() => setActiveProfile(p)}
                >
                  <div style={styles.profileCardHeader}>
                    <span style={styles.profileCardName}>{p.name}</span>
                    {p.id === activeProfile.id && <span style={styles.activeDot} />}
                  </div>
                  <div style={styles.profileCardMeta}>
                    <span style={styles.badge}>{p.loader}</span>
                    <span style={styles.badge}>{p.gameVersion}</span>
                  </div>
                  <p style={styles.profileCardCount}>{p.modCount}개의 모드</p>
                </div>
              ))}
              <div style={{ ...styles.profileCard, ...styles.profileCardAdd }}>
                <span style={styles.addIcon}>+</span>
                <p style={styles.addText}>새 프로필 추가</p>
              </div>
            </div>
          </div>
        )}

        {/* Settings Page */}
        {page === 'settings' && (
          <div style={styles.pageWrap}>
            <div style={styles.pageHeader}>
              <h1 style={styles.pageTitle}>설정</h1>
              <p style={styles.pageDesc}>앱 환경과 설치 경로를 설정합니다</p>
            </div>
            <div style={styles.settingsGroup}>
              <p style={styles.sectionLabel}>Minecraft 설치 경로</p>
              <div style={styles.pathRow}>
                <input style={styles.pathInput} defaultValue="C:\Users\...\AppData\Roaming\.minecraft" readOnly />
                <button style={styles.ghostBtn}>변경</button>
              </div>
            </div>
            <div style={styles.settingsGroup}>
              <p style={styles.sectionLabel}>DB 동기화</p>
              <button style={styles.ghostBtn}>Modrinth에서 최신 데이터 가져오기</button>
            </div>
          </div>
        )}

      </main>
    </div>
  )
}

// ─── ModCard Component ────────────────────────────────────────────────────────
function ModCard({ mod, required, checked, onToggle }: {
  mod: Mod
  required: boolean
  checked: boolean
  onToggle: () => void
}) {
  return (
    <div
      style={{ ...styles.modCard, ...(checked ? styles.modCardChecked : {}), ...(required ? {} : { cursor: 'pointer' }) }}
      onClick={() => !required && onToggle()}
    >
      <div style={styles.modCardLeft}>
        <div style={{ ...styles.checkbox, ...(checked ? styles.checkboxChecked : {}) }}>
          {checked && <CheckIcon />}
        </div>
        <div>
          <div style={styles.modName}>{mod.name || mod.project_id}</div>
          {mod.description && <div style={styles.modDesc}>{mod.description.slice(0, 80)}...</div>}
          <div style={styles.modMeta}>
            <span style={styles.versionTag}>v{mod.version_number}</span>
            {mod.downloads && <span style={styles.mutedText}>{mod.downloads.toLocaleString()} 다운로드</span>}
          </div>
        </div>
      </div>
      <div>
        {required
          ? <span style={styles.requiredBadge}>필수</span>
          : <span style={styles.optionalBadge}>선택</span>
        }
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    height: '100vh',
    fontFamily: "'Pretendard', 'Apple SD Gothic Neo', sans-serif",
    background: '#0f0f11',
    color: '#e8e8ea',
    overflow: 'hidden',
  },

  // Sidebar
  sidebar: {
    width: 220,
    minWidth: 220,
    background: '#18181b',
    borderRight: '1px solid #2a2a2e',
    display: 'flex',
    flexDirection: 'column',
    padding: '20px 12px',
    gap: 0,
  },
  logo: { display: 'flex', alignItems: 'center', gap: 10, padding: '0 8px 20px' },
  logoMark: {
    width: 30, height: 30, borderRadius: 8,
    background: '#4f46e5', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, fontWeight: 700, letterSpacing: 0.5,
  },
  logoText: { fontSize: 15, fontWeight: 700, color: '#e8e8ea', letterSpacing: -0.3 },
  profileBlock: {
    background: '#1f1f23',
    borderRadius: 10,
    padding: '12px',
    marginBottom: 16,
    border: '1px solid #2a2a2e',
  },
  profileSelect: {
    width: '100%', background: '#18181b', color: '#e8e8ea',
    border: '1px solid #2a2a2e', borderRadius: 6,
    padding: '6px 8px', fontSize: 13, marginBottom: 8,
    outline: 'none',
  },
  profileMeta: { display: 'flex', gap: 4, flexWrap: 'wrap' },
  badge: {
    fontSize: 11, padding: '2px 6px', borderRadius: 4,
    background: '#2a2a2e', color: '#a1a1aa',
  },
  nav: { display: 'flex', flexDirection: 'column', gap: 2, flex: 1 },
  navBtn: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '9px 12px', borderRadius: 8,
    background: 'transparent', border: 'none',
    color: '#71717a', fontSize: 13, cursor: 'pointer',
    textAlign: 'left', transition: 'all 0.15s',
  },
  navBtnActive: { background: '#27272a', color: '#e8e8ea' },
  sidebarFooter: { paddingTop: 12, borderTop: '1px solid #2a2a2e' },
  footerText: { fontSize: 11, color: '#52525b' },

  // Main
  main: { flex: 1, overflow: 'auto', background: '#0f0f11' },
  pageWrap: { maxWidth: 760, margin: '0 auto', padding: '32px 32px' },
  pageHeader: { marginBottom: 28 },
  pageTitle: { fontSize: 22, fontWeight: 700, color: '#e8e8ea', margin: 0, letterSpacing: -0.5 },
  pageDesc: { fontSize: 14, color: '#71717a', marginTop: 4 },

  // Search
  searchRow: { display: 'flex', gap: 10, marginBottom: 14 },
  searchBox: {
    flex: 1, display: 'flex', alignItems: 'center', gap: 10,
    background: '#18181b', border: '1px solid #2a2a2e',
    borderRadius: 10, padding: '0 14px',
  },
  searchIcon: { color: '#52525b', display: 'flex' },
  searchInput: {
    flex: 1, background: 'transparent', border: 'none',
    color: '#e8e8ea', fontSize: 14, padding: '11px 0', outline: 'none',
  },
  primaryBtn: {
    padding: '0 20px', height: 42, borderRadius: 10,
    background: '#4f46e5', color: '#fff', border: 'none',
    fontSize: 14, fontWeight: 600, cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  filterRow: { display: 'flex', gap: 6, marginBottom: 24 },
  filterChip: {
    padding: '4px 12px', borderRadius: 20, fontSize: 12,
    background: '#18181b', border: '1px solid #2a2a2e',
    color: '#71717a', cursor: 'pointer',
  },
  filterChipActive: { background: '#27272a', color: '#e8e8ea', borderColor: '#3f3f46' },

  // Error / status
  errorBanner: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '10px 14px', borderRadius: 8,
    background: '#1c0a0a', border: '1px solid #3f1515',
    color: '#f87171', fontSize: 13, marginBottom: 16,
  },
  successText: { display: 'flex', alignItems: 'center', gap: 6, color: '#4ade80', fontSize: 13 },
  errorText: { display: 'flex', alignItems: 'center', gap: 6, color: '#f87171', fontSize: 13 },
  mutedText: { fontSize: 13, color: '#52525b' },

  // Results
  resultsWrap: { display: 'flex', flexDirection: 'column', gap: 0 },
  section: { marginBottom: 20 },
  sectionLabel: { fontSize: 11, fontWeight: 600, color: '#52525b', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 },
  depList: { display: 'flex', flexDirection: 'column', gap: 6 },

  // Mod card
  modCard: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 14px', borderRadius: 10,
    background: '#18181b', border: '1px solid #2a2a2e',
    transition: 'border-color 0.15s',
  },
  modCardChecked: { borderColor: '#4f46e5', background: '#18181b' },
  modCardLeft: { display: 'flex', alignItems: 'flex-start', gap: 12 },
  checkbox: {
    width: 18, height: 18, borderRadius: 5,
    border: '1.5px solid #3f3f46', background: 'transparent',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, marginTop: 2,
    transition: 'all 0.15s',
  },
  checkboxChecked: { background: '#4f46e5', borderColor: '#4f46e5', color: '#fff' },
  modName: { fontSize: 14, fontWeight: 600, color: '#e8e8ea', marginBottom: 2 },
  modDesc: { fontSize: 12, color: '#71717a', marginBottom: 4, lineHeight: 1.4 },
  modMeta: { display: 'flex', alignItems: 'center', gap: 8 },
  versionTag: { fontSize: 11, padding: '1px 6px', borderRadius: 4, background: '#27272a', color: '#a1a1aa' },
  requiredBadge: { fontSize: 11, padding: '3px 8px', borderRadius: 20, background: '#1a1040', color: '#818cf8' },
  optionalBadge: { fontSize: 11, padding: '3px 8px', borderRadius: 20, background: '#1a2a1a', color: '#4ade80' },

  // Install footer
  installFooter: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '16px 0', borderTop: '1px solid #2a2a2e', marginTop: 8,
  },
  installBtn: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '0 20px', height: 40, borderRadius: 10,
    background: '#4f46e5', color: '#fff', border: 'none',
    fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },

  // Empty state
  emptyState: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '64px 0', color: '#52525b',
  },
  emptyIcon: { marginBottom: 16, opacity: 0.4, fontSize: 32 },
  emptyTitle: { fontSize: 15, fontWeight: 600, color: '#71717a', margin: 0 },
  emptyDesc: { fontSize: 13, color: '#52525b', marginTop: 6 },

  // Profiles
  profileGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 },
  profileCard: {
    padding: '16px', borderRadius: 12,
    background: '#18181b', border: '1px solid #2a2a2e',
    cursor: 'pointer', transition: 'border-color 0.15s',
  },
  profileCardActive: { borderColor: '#4f46e5' },
  profileCardAdd: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', opacity: 0.5, borderStyle: 'dashed',
  },
  profileCardHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  profileCardName: { fontSize: 14, fontWeight: 600, color: '#e8e8ea' },
  activeDot: { width: 7, height: 7, borderRadius: '50%', background: '#4f46e5' },
  profileCardMeta: { display: 'flex', gap: 4, marginBottom: 8 },
  profileCardCount: { fontSize: 12, color: '#52525b', margin: 0 },
  addIcon: { fontSize: 24, color: '#71717a', marginBottom: 6 },
  addText: { fontSize: 13, color: '#71717a', margin: 0 },

  // Settings
  settingsGroup: { marginBottom: 28 },
  pathRow: { display: 'flex', gap: 8 },
  pathInput: {
    flex: 1, background: '#18181b', border: '1px solid #2a2a2e',
    borderRadius: 8, color: '#71717a', padding: '8px 12px', fontSize: 13, outline: 'none',
  },
  ghostBtn: {
    padding: '8px 16px', borderRadius: 8,
    background: 'transparent', border: '1px solid #2a2a2e',
    color: '#a1a1aa', fontSize: 13, cursor: 'pointer',
  },
}
