import { useState } from 'react'

function App() {
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [modResults, setModResults] = useState<any[]>([]) // 진짜 데이터를 담을 그릇
  const [errorMessage, setErrorMessage] = useState('')

  // 🚀 진짜 백엔드(API)로 검색 요청을 보내는 함수
  // 🚀 안전하게 강화된 검색 요청 함수
  const handleSearch = async () => {
    if (!searchQuery.trim()) return; 
    
    setIsSearching(true)
    setErrorMessage('')
    setModResults([])

    try {
      // API 다리를 건널 때 에러가 나더라도 앱이 멈추지 않게 보호막(try)을 씌움
      const result = await (window as any).electron.ipcRenderer.invoke('search-mod', searchQuery.trim().toLowerCase())
      
      if (result.error) {
        setErrorMessage(result.error)
      } else {
        setModResults(result) 
      }
    } catch (err: any) {
      // 예상치 못한 통신 에러가 나면 여기에 빨간 글씨로 띄워줌
      setErrorMessage("통신 에러 발생: " + err.message)
    } finally {
      // 성공하든 실패하든, 마지막에는 무조건 로딩 상태를 꺼줌! (무한 로딩 방지)
      setIsSearching(false)
    }
  }

  return (
    <div style={{ padding: '30px', fontFamily: 'sans-serif', color: '#333' }}>
      <h2>📦 Minecraft Mod Manager</h2>
      <p style={{ color: '#666' }}>원하는 모드를 검색하고 안전하게 설치하세요.</p>

      {/* 검색창 영역 */}
      <div style={{ marginBottom: '30px', display: 'flex', gap: '10px' }}>
        <input
          type="text"
          placeholder="모드 이름을 입력하세요 (예: worldedit)"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()} // 엔터키로도 검색 가능하게!
          style={{ padding: '10px', width: '300px', borderRadius: '6px', border: '1px solid #ccc' }}
        />
        <button 
          onClick={handleSearch} 
          disabled={isSearching}
          style={{ padding: '10px 20px', borderRadius: '6px', backgroundColor: '#007BFF', color: 'white', border: 'none', cursor: 'pointer' }}
        >
          {isSearching ? '검색 중...' : '검색'}
        </button>
      </div>

      {/* 에러 메시지 표시 */}
      {errorMessage && <p style={{ color: 'red' }}>⚠️ {errorMessage}</p>}

      {/* 실제 데이터를 바탕으로 모달창(리스트) 그리기 */}
      {modResults.length > 0 && (
        <div style={{ border: '1px solid #e0e0e0', padding: '20px', borderRadius: '8px', backgroundColor: '#f9f9f9' }}>
          <h3>설치 전 의존성 확인</h3>
          <p style={{ fontSize: '14px', color: '#555' }}>
            이 모드를 완벽하게 구동하려면 아래 모드들이 함께 필요합니다. (총 {modResults.length}개)
          </p>

          <ul style={{ listStyle: 'none', padding: 0, marginTop: '20px' }}>
            {modResults.map((mod, index) => {
              // 첫 번째 요소는 무조건 사용자가 검색한 본체!
              const isMainMod = index === 0; 
              return (
                <li key={mod.id} style={{ marginBottom: '15px' }}>
                  <label style={{ color: isMainMod ? 'black' : 'gray', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input type="checkbox" checked readOnly disabled={!isMainMod} />
                    <span>
                      <strong>{mod.project_id}</strong> (버전: {mod.version_number}) <br/>
                      <small>{isMainMod ? '선택한 모드 (본체)' : '필수 의존성 모드 (해제 불가)'}</small>
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>

          <div style={{ marginTop: '20px', borderTop: '1px solid #ddd', paddingTop: '15px' }}>
            <button style={{ padding: '12px 24px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
              동의하고 설치하기
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default App