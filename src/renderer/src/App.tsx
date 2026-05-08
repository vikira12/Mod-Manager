import { useState, useEffect } from 'react'
import type { ConflictDetail, ModRow, ScannedJarMod } from '../../preload/index.d'

// --- Types ---
type Page = 'search' | 'installed' | 'profiles' | 'settings'
type ViewMode = 'list' | 'detail'

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
  ArrowLeft: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>,
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

  // --- Search & UI States ---
  const [query, setQuery] = useState('')
  const [isSearching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<ModRow[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [depResults, setDepResults] = useState<ModRow[]>([])
  const [error, setError] = useState('')
  const [hasBlockingConflict, setHasBlockingConflict] = useState(false)
  const [conflictDetails, setConflictDetails] = useState<ConflictDetail[]>([])
  const [scannedJars, setScannedJars] = useState<ScannedJarMod[]>([])

  // --- Install States ---
  const [installStatus, setInstSt] = useState<'idle'|'installing'|'done'|'error'>('idle')
  const [installMsg, setInstMsg] = useState('')

  const api = (window as any).electron

  // 초기 프로필 로드
  useEffect(() => { loadProfiles() }, [])

  // 활성 프로필이 바뀌면 검색 화면에서도 충돌 검사용 설치 목록을 최신화
  useEffect(() => {
    if (activeProfile) loadInstalledMods(activeProfile.id)
  }, [activeProfile])

  useEffect(() => {
    if (activeProfile) refreshJarScan()
  }, [activeProfile])

  const loadProfiles = async () => {
    try {
      const list = await api.getProfiles()
      setProfiles(list)
      if (list.length > 0 && !activeProfile) setActive(list[0])
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
    await api.deleteProfile(id)
    if (activeProfile?.id === id) setActive(null)
    loadProfiles()
  }

  // 설치된 모드 삭제
  const handleUninstallMod = async (modId: string) => {
    if (!activeProfile || !confirm('이 프로필에서 모드를 제거하시겠습니까? (파일은 삭제되지 않고 프로필에서만 제외됩니다)')) return
    await api.uninstallMod(activeProfile.id, modId)
    loadInstalledMods(activeProfile.id)
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
    
    setSearching(true); setError(''); setHasBlockingConflict(false); setConflictDetails([]); setDepResults([]); setSelected(new Set()); setInstSt('idle')
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
      const res = await api.downloadMods(toInstall, activeProfile.install_path || '.minecraft/mods')
      if (res.success) {
        setInstSt('done')
        setInstMsg(`${res.files.length}개 모드 다운로드 완료`)
        
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
          <div style={s.logoMark}>MF</div>
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
        </nav>
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

            {error && <div style={s.errorBanner}><Icon.Alert /><span>{error}</span></div>}
            {scannedJars.length > 0 && (
              <div style={s.scanBanner}>
                <Icon.Package />
                <span>mods 폴더 jar {scannedJars.length}개를 함께 검사 중입니다.</span>
              </div>
            )}
            {conflictDetails.length > 0 && <ConflictPanel conflicts={conflictDetails} />}

            {viewMode === 'list' && searchResults.length > 0 && (
              <>
                <p style={s.label}>검색 결과</p>
                <div style={s.depList}>
                  {searchResults.map(mod => (
                    <ModCard key={mod.modrinth_id} mod={mod} required={false} checked={false} onToggle={() => handleSelectMod(mod)} isSelectableResult={true} />
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

        {/* 2. 설치된 모드 페이지 */}
        {page === 'installed' && (
          <div style={s.page}>
            <div style={s.pageHead}>
              <h1 style={s.pageTitle}>설치된 모드</h1>
              <p style={s.pageDesc}>{activeProfile?.name} 프로필에 설치된 모드 목록입니다.</p>
            </div>
            <div style={s.listWrap}>
              {installedMods.length === 0 ? (
                <div style={s.empty}>
                  <Icon.Package />
                  <p style={{marginTop: 10}}>설치된 모드가 없습니다.</p>
                </div>
              ) : (
                installedMods.map(mod => (
                  <div key={mod.id} style={s.installedItem}>
                    <div style={{flex: 1}}>
                      <div style={s.modName}>{mod.name} <span style={s.verTag}>v{mod.version_number}</span></div>
                      <div style={{fontSize: 12, color: '#71717a'}}>설치일: {new Date(mod.installed_at).toLocaleDateString()}</div>
                    </div>
                    <button style={s.delBtn} onClick={() => handleUninstallMod(mod.id)}><Icon.Trash /></button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* 3. 프로필 관리 페이지 */}
        {page === 'profiles' && (
          <div style={s.page}>
            <div style={s.pageHead}>
              <h1 style={s.pageTitle}>프로필 관리</h1>
              <p style={s.pageDesc}>게임 버전, 로더별로 모드 세트를 분리 관리합니다.</p>
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
                <div style={{...s.profileCard, borderStyle: 'dashed', display: 'flex', alignItems: 'center', justifyContent: 'center'}} onClick={() => setShowAddProfile(true)}>
                  <p style={{color: '#71717a', margin: 0}}>+ 새 프로필 추가</p>
                </div>
              ) : (
                <div style={s.profileCard}>
                  <input style={s.input} placeholder="프로필 이름" value={newProfileName} onChange={e => setNewProfileName(e.target.value)} />
                  <select style={s.select} value={newProfileLoader} onChange={e => setNewProfileLoader(e.target.value)}>
                    <option value="Fabric">Fabric</option>
                    <option value="Forge">Forge</option>
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
            {mod.downloads > 0 && <span style={{fontSize: 11, color: '#71717a'}}>{mod.downloads.toLocaleString()} 다운로드</span>}
          </div>
        </div>
      </div>
      {isSelectableResult ? <span style={s.optBadge}>선택하기</span> : <span style={required ? s.reqBadge : s.optBadge}>{required ? '필수' : '선택'}</span>}
    </div>
  )
}

function ConflictPanel({ conflicts }: { conflicts: ConflictDetail[] }) {
  return (
    <div style={s.conflictPanel}>
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

// --- Styles ---
const s: Record<string, React.CSSProperties> = {
  root: { display: 'flex', height: '100vh', background: '#0f0f11', color: '#e8e8ea', fontFamily: "'Apple SD Gothic Neo', sans-serif" },
  sidebar: { width: 220, background: '#18181b', borderRight: '1px solid #2a2a2e', padding: '20px 10px', display: 'flex', flexDirection: 'column' },
  logo: { display: 'flex', alignItems: 'center', gap: 10, padding: '0 10px 20px' },
  logoMark: { width: 30, height: 30, background: '#4f46e5', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' },
  logoText: { fontWeight: 'bold', fontSize: 16 },
  
  profileBlock: { background: '#1f1f23', padding: 12, borderRadius: 10, marginBottom: 20 },
  profileSelect: { width: '100%', background: '#18181b', color: '#fff', border: '1px solid #3f3f46', borderRadius: 6, padding: 5, marginBottom: 8, outline: 'none' },
  nav: { flex: 1, display: 'flex', flexDirection: 'column', gap: 4 },
  navBtn: { background: 'transparent', border: 'none', color: '#71717a', padding: '10px', borderRadius: 8, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 },
  navActive: { background: '#27272a', color: '#fff' },

  main: { flex: 1, overflowY: 'auto' },
  page: { maxWidth: 800, margin: '0 auto', padding: 40 },
  pageHead: { marginBottom: 30 },
  pageTitle: { fontSize: 24, fontWeight: 'bold', margin: 0 },
  pageDesc: { color: '#71717a', marginTop: 5, fontSize: 14 },

  searchRow: { display: 'flex', gap: 10, marginBottom: 20 },
  searchBox: { flex: 1, background: '#18181b', border: '1px solid #2a2a2e', borderRadius: 10, padding: '0 15px', display: 'flex', alignItems: 'center', gap: 10 },
  searchInput: { background: 'transparent', border: 'none', color: '#fff', width: '100%', padding: '12px 0', outline: 'none' },
  primaryBtn: { background: '#4f46e5', color: '#fff', border: 'none', padding: '0 20px', borderRadius: 10, cursor: 'pointer', fontWeight: 'bold' },
  ghostBtn: { background: 'transparent', border: '1px solid #2a2a2e', color: '#a1a1aa', padding: '8px 15px', borderRadius: 8, cursor: 'pointer' },
  backBtn: { background: 'transparent', border: 'none', color: '#a1a1aa', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, padding: 0 },

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
  
  depList: { display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 20 },
  modCard: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 15px', borderRadius: 10, background: '#18181b', border: '1px solid #2a2a2e' },
  modChecked: { borderColor: '#4f46e5' },
  modLeft: { display: 'flex', alignItems: 'flex-start', gap: 12 },
  checkbox: { width: 18, height: 18, borderRadius: 5, border: '2px solid #3f3f46', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  checkboxOn: { background: '#4f46e5', borderColor: '#4f46e5', color: '#fff' },
  modName: { fontWeight: 'bold', fontSize: 14, marginBottom: 3 },
  modDesc: { fontSize: 12, color: '#71717a', marginBottom: 5 },
  modMeta: { display: 'flex', gap: 10, alignItems: 'center' },
  reqBadge: { fontSize: 11, background: '#1a1040', color: '#818cf8', padding: '3px 8px', borderRadius: 20 },
  optBadge: { fontSize: 11, background: '#1a2a1a', color: '#4ade80', padding: '3px 8px', borderRadius: 20 },

  installFooter: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 0', borderTop: '1px solid #2a2a2e', marginTop: 10 },
  installBtn: { background: '#4f46e5', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 'bold' },
  successTxt: { color: '#4ade80', fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 },
  errorTxt: { color: '#f87171', fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 },
  mutedTxt: { color: '#71717a', fontSize: 13 },

  listWrap: { display: 'flex', flexDirection: 'column', gap: 10 },
  installedItem: { background: '#18181b', border: '1px solid #2a2a2e', borderRadius: 10, padding: 15, display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  delBtn: { background: '#2a1515', border: '1px solid #3f1515', color: '#f87171', borderRadius: 6, padding: '8px', cursor: 'pointer', display: 'flex' },

  profileGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15 },
  profileCard: { background: '#18181b', border: '1px solid #2a2a2e', borderRadius: 12, padding: 15, cursor: 'pointer', minHeight: 90 },
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
}
