import React from 'react'

interface State {
  error: Error | null
}

export default class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[Renderer ErrorBoundary]', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div style={styles.root}>
        <div style={styles.panel}>
          <div style={styles.kicker}>ModForge</div>
          <h1 style={styles.title}>화면을 복구할 수 없습니다</h1>
          <p style={styles.message}>
            렌더링 중 문제가 발생했습니다. 앱은 닫히지 않았고, 새로고침하면 다시 시도할 수 있습니다.
          </p>
          <pre style={styles.error}>{this.state.error.message}</pre>
          <button style={styles.button} onClick={() => location.reload()}>
            화면 새로고침
          </button>
        </div>
      </div>
    )
  }
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0f0f11',
    color: '#e8e8ea',
    fontFamily: "'Apple SD Gothic Neo', sans-serif",
    padding: 24,
  },
  panel: {
    width: 'min(520px, 100%)',
    background: '#18181b',
    border: '1px solid #2d2d34',
    borderRadius: 8,
    padding: 24,
    boxShadow: '0 24px 60px rgba(0,0,0,0.32)',
  },
  kicker: { color: '#a5b4fc', fontSize: 12, fontWeight: 'bold', marginBottom: 8 },
  title: { margin: 0, fontSize: 22 },
  message: { color: '#a1a1aa', fontSize: 14, lineHeight: 1.5 },
  error: {
    color: '#fecaca',
    background: '#1c0a0a',
    border: '1px solid #3f1515',
    borderRadius: 6,
    padding: 12,
    whiteSpace: 'pre-wrap',
    fontSize: 12,
  },
  button: {
    marginTop: 12,
    background: '#6366f1',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '10px 16px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
}
