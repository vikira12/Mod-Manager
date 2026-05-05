import { useState, useEffect } from 'react'
import type { ModRow, SyncProgress, InstallProgress, SyncStatus } from '../../preload/index.d'

// --- Types ---
type Page = 'search' | 'installed' | 'profiles' | 'settings'
type ViewMode = 'list' | 'detail'

interface Profile {
  id: string
  name: string
  game_version: string
  loader: string
  install_path?: string
}

// --- Inline Icons ---
const Icon = {
  Search:    () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  Package:   () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>,
  User:      () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  Settings:  () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  Trash:     () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>,
  Check:     () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  Download:  () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  Alert:     () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
}

export default function App() {
  const [page, setPage] = useState<Page>('search')
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [activeProfile, setActive] = useState<Profile | null>(null)
  const [installedMods, setInstalledMods] = useState<any[]>([])

  // UI States
  const [showAddProfile, setShowAddProfile] = useState(false)
  const [newProfileName, setNewProfileName] = useState('')
  const [newProfileVer, setNewProfileVer] = useState('1.20.1')
  const [newProfileLoader, setNewProfileLoader] = useState('Fabric')

  // Search States
  const [query, setQuery] = useState('')
  const [isSearching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<ModRow[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [depResults, setDepResults] = useState<ModRow[]>([])

  const api = (window as any).electron

  // 1. 초기 프로필 로드
  useEffect(() => {
    loadProfiles()
  }, [])

  // 2. 페이지 전환 시 데이터 갱신
  useEffect(() => {
    if (page === 'installed' && activeProfile) {
      loadInstalledMods(activeProfile.id)
    }
  }, [page, activeProfile])

  const loadProfiles = async () => {
    const list = await api.getProfiles()
    setProfiles(list)
    if (list.length > 0 && !activeProfile) setActive(list[0])
  }

  const loadInstalledMods = async (profileId: string) => {
    const mods = await api.getInstalledMods(profileId)
    setInstalledMods(mods)
  }

  const handleCreateProfile = async () => {
    if (!newProfileName.trim()) return
    await api.createProfile({ name: newProfileName, gameVersion: newProfileVer, loader: newProfileLoader })
    setNewProfileName(''); setShowAddProfile(false)
    loadProfiles()
  }

  const handleDeleteProfile = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('프로필을 삭제하시겠습니까?')) return
    await api.deleteProfile(id)
    if (activeProfile?.id === id) setActive(null)
    loadProfiles()
  }

  const handleUninstallMod = async (modId: string) => {
    if (!activeProfile || !confirm('이 프로필에서 모드를 제거하시겠습니까?')) return
    await api.uninstallMod(activeProfile.id, modId)
    loadInstalledMods(activeProfile.id)
  }

  const handleSearch = async () => {
    if (!query.trim() || !activeProfile) return
    setSearching(true); setViewMode('list')
    const res = await api.searchMod(query.trim(), {
      loader: activeProfile.loader,
      gameVersion: activeProfile.game_version
    })
    setSearchResults(res.results || [])
    setSearching(false)
  }

  const handleSelectMod = async (mod: ModRow) => {
    if (!activeProfile) return
    setSearching(true)
    const resolved = await api.resolveDeps(mod.modrinth_id, {
      gameVersion: activeProfile.game_version,
      loader: activeProfile.loader
    })
    setDepResults(resolved.installOrder || [])
    setSelected(new Set(resolved.installOrder?.map(m => m.modrinth_id)))
    setViewMode('detail')
    setSearching(false)
  }

  return (
    <div style={s.root}>
      {/* --- Sidebar --- */}
      <aside style={s.sidebar}>
        <div style={s.logo}>
          <div style={s.logoMark}>MF</div>
          <span style={s.logoText}>ModForge</span>
        </div>

        <div style={s.profileBlock}>
          <p style={s.label}>활성 프로필</p>
          <select 
            style={s.profileSelect}
            value={activeProfile?.id || ''}
            onChange={(e) => setActive(profiles.find(p => p.id === e.target.value) || null)}
          >
            {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {activeProfile && (
            <div style={s.chips}>
              <span style={s.chip}>{activeProfile.loader}</span>
              <span style={s.chip}>{activeProfile.game_version}</span>
            </div>
          )}
        </div>

        <nav style={s.nav}>
          <button onClick={() => setPage('search')} style={{...s.navBtn, ...(page === 'search' ? s.navActive : {})}}><Icon.Search /> 모드 검색</button>
          <button onClick={() => setPage('installed')} style={{...s.navBtn, ...(page === 'installed' ? s.navActive : {})}}><Icon.Package /> 설치된 모드</button>
          <button onClick={() => setPage('profiles')} style={{...s.navBtn, ...(page === 'profiles' ? s.navActive : {})}}><Icon.User /> 프로필 관리</button>
          <button onClick={() => setPage('settings')} style={{...s.navBtn, ...(page === 'settings' ? s.navActive : {})}}><Icon.Settings /> 설정</button>
        </nav>
      </aside>

      {/* --- Main Content --- */}
      <main style={s.main}>
        <div style={s.page}>

          {/* 1. 모드 검색 페이지 */}
          {page === 'search' && (
            <>
              <div style={s.pageHead}>
                <h1 style={s.pageTitle}>모드 검색</h1>
                <p style={s.pageDesc}>{activeProfile?.name || '프로필 선택 필요'} 기반으로 검색합니다</p>
              </div>
              <div style={s.searchRow}>
                <div style={s.searchBox}>
                  <Icon.Search />
                  <input style={s.searchInput} placeholder="모드 이름 입력..." value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} />
                </div>
                <button style={s.primaryBtn} onClick={handleSearch} disabled={isSearching}>{isSearching ? '...' : '검색'}</button>
              </div>

              {viewMode === 'list' ? (
                <div style={s.listWrap}>
                  {searchResults.map(mod => (
                    <div key={mod.modrinth_id} style={s.modItem} onClick={() => handleSelectMod(mod)}>
                      <div style={s.modName}>{mod.name}</div>
                      <div style={s.modDesc}>{mod.description}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div>
                  <button onClick={() => setViewMode('list')} style={s.ghostBtn}>뒤로가기</button>
                  <p style={s.label}>함께 설치될 의존성 목록</p>
                  {depResults.map(m => <div key={m.modrinth_id} style={s.modItem}>{m.name}</div>)}
                </div>
              )}
            </>
          )}

          {/* 2. 설치된 모드 페이지 */}
          {page === 'installed' && (
            <>
              <div style={s.pageHead}>
                <h1 style={s.pageTitle}>설치된 모드</h1>
                <p style={s.pageDesc}>{activeProfile?.name}에 {installedMods.length}개의 모드가 있습니다.</p>
              </div>
              <div style={s.listWrap}>
                {installedMods.length === 0 ? (
                  <p style={s.mutedTxt}>설치된 모드가 없습니다.</p>
                ) : (
                  installedMods.map(mod => (
                    <div key={mod.id} style={s.modItem}>
                      <div style={{flex: 1}}>
                        <div style={s.modName}>{mod.name} <span style={s.verTag}>v{mod.version_number}</span></div>
                        <div style={s.mutedTxt}>설치일: {new Date(mod.installed_at).toLocaleDateString()}</div>
                      </div>
                      <button style={s.delBtn} onClick={() => handleUninstallMod(mod.id)}><Icon.Trash /></button>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          {/* 3. 프로필 관리 페이지 */}
          {page === 'profiles' && (
            <>
              <div style={s.pageHead}>
                <h1 style={s.pageTitle}>프로필 관리</h1>
                <p style={s.pageDesc}>버전별, 용도별 모드 세트를 관리합니다.</p>
              </div>

              <div style={s.profileGrid}>
                {profiles.map(p => (
                  <div key={p.id} style={{...s.profileCard, ...(activeProfile?.id === p.id ? s.profileActive : {})}} onClick={() => setActive(p)}>
                    <div style={{display: 'flex', justifyContent: 'space-between'}}>
                      <span style={s.profileCardName}>{p.name}</span>
                      <button style={s.iconBtn} onClick={(e) => handleDeleteProfile(p.id, e)}><Icon.Trash /></button>
                    </div>
                    <div style={s.chips}>
                      <span style={s.chip}>{p.loader}</span>
                      <span style={s.chip}>{p.game_version}</span>
                    </div>
                  </div>
                ))}

                {!showAddProfile ? (
                  <div style={{...s.profileCard, borderStyle: 'dashed'}} onClick={() => setShowAddProfile(true)}>
                    <p style={{textAlign: 'center', color: '#71717a'}}>+ 새 프로필 추가</p>
                  </div>
                ) : (
                  <div style={s.profileCard}>
                    <input style={s.input} placeholder="프로필 이름" value={newProfileName} onChange={e => setNewProfileName(e.target.value)} />
                    <select style={s.select} value={newProfileVer} onChange={e => setNewProfileVer(e.target.value)}>
                      <option value="1.20.1">1.20.1</option>
                      <option value="1.19.2">1.19.2</option>
                      <option value="1.18.2">1.18.2</option>
                    </select>
                    <div style={{display: 'flex', gap: 5, marginTop: 8}}>
                      <button style={{...s.primaryBtn, flex: 1}} onClick={handleCreateProfile}>저장</button>
                      <button style={{...s.ghostBtn, flex: 1}} onClick={() => setShowAddProfile(false)}>취소</button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

        </div>
      </main>
    </div>
  )
}

// --- Styles ---
const s: Record<string, React.CSSProperties> = {
  root: { display: 'flex', height: '100vh', background: '#0f0f11', color: '#e8e8ea', fontFamily: 'sans-serif' },
  sidebar: { width: 220, background: '#18181b', borderRight: '1px solid #2a2a2e', padding: '20px 10px', display: 'flex', flexDirection: 'column' },
  logo: { display: 'flex', alignItems: 'center', gap: 10, padding: '0 10px 20px' },
  logoMark: { width: 30, height: 30, background: '#4f46e5', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' },
  logoText: { fontWeight: 'bold', fontSize: 16 },
  
  profileBlock: { background: '#1f1f23', padding: 12, borderRadius: 10, marginBottom: 20 },
  profileSelect: { width: '100%', background: '#18181b', color: '#fff', border: '1px solid #3f3f46', borderRadius: 6, padding: 5, marginBottom: 8 },
  nav: { flex: 1, display: 'flex', flexDirection: 'column', gap: 4 },
  navBtn: { background: 'transparent', border: 'none', color: '#71717a', padding: '10px', borderRadius: 8, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 },
  navActive: { background: '#27272a', color: '#fff' },

  main: { flex: 1, overflowY: 'auto' },
  page: { maxWidth: 800, margin: '0 auto', padding: 40 },
  pageHead: { marginBottom: 30 },
  pageTitle: { fontSize: 24, fontWeight: 'bold', margin: 0 },
  pageDesc: { color: '#71717a', marginTop: 5 },

  searchRow: { display: 'flex', gap: 10, marginBottom: 20 },
  searchBox: { flex: 1, background: '#18181b', border: '1px solid #2a2a2e', borderRadius: 10, padding: '0 15px', display: 'flex', alignItems: 'center', gap: 10 },
  searchInput: { background: 'transparent', border: 'none', color: '#fff', width: '100%', padding: '12px 0', outline: 'none' },
  primaryBtn: { background: '#4f46e5', color: '#fff', border: 'none', padding: '0 20px', borderRadius: 10, cursor: 'pointer', fontWeight: 'bold' },
  ghostBtn: { background: 'transparent', border: '1px solid #2a2a2e', color: '#71717a', padding: '8px 15px', borderRadius: 8, cursor: 'pointer' },

  listWrap: { display: 'flex', flexDirection: 'column', gap: 10 },
  modItem: { background: '#18181b', border: '1px solid #2a2a2e', borderRadius: 10, padding: 15, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' },
  modName: { fontWeight: 'bold', marginBottom: 4 },
  modDesc: { fontSize: 13, color: '#71717a' },
  verTag: { fontSize: 11, background: '#27272a', padding: '2px 6px', borderRadius: 4, marginLeft: 5 },
  delBtn: { background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 5 },

  profileGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15 },
  profileCard: { background: '#18181b', border: '1px solid #2a2a2e', borderRadius: 12, padding: 15, cursor: 'pointer' },
  profileActive: { borderColor: '#4f46e5' },
  profileCardName: { fontWeight: 'bold' },
  iconBtn: { background: 'transparent', border: 'none', color: '#71717a', cursor: 'pointer' },
  
  chips: { display: 'flex', gap: 5, marginTop: 10 },
  chip: { fontSize: 10, background: '#27272a', color: '#a1a1aa', padding: '2px 6px', borderRadius: 4 },
  label: { fontSize: 11, color: '#52525b', fontWeight: 'bold', marginBottom: 10, display: 'block' },
  mutedTxt: { color: '#52525b', fontSize: 13 },
  input: { width: '100%', background: '#0f0f11', border: '1px solid #2a2a2e', color: '#fff', padding: 8, borderRadius: 6, marginBottom: 8 },
  select: { width: '100%', background: '#0f0f11', border: '1px solid #2a2a2e', color: '#fff', padding: 8, borderRadius: 6 },
}