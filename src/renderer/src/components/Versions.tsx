import type { ModRow } from '../../../preload/index.d'

interface Props {
  mod: ModRow
  onSelect?: (mod: ModRow) => void
}

export function Versions({ mod, onSelect }: Props) {
  return (
    <div style={s.wrap} onClick={() => onSelect?.(mod)}>
      <div style={s.row}>
        <span style={s.name}>{mod.name}</span>
        <span style={s.ver}>v{mod.version_number}</span>
      </div>
      {mod.description && (
        <p style={s.desc}>{mod.description.slice(0, 100)}</p>
      )}
      <div style={s.meta}>
        {mod.loaders?.map(l => (
          <span key={l} style={s.chip}>{l}</span>
        ))}
        {mod.downloads > 0 && (
          <span style={s.dl}>{mod.downloads.toLocaleString()} 다운로드</span>
        )}
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  wrap: {
    padding: '12px 14px', borderRadius: 10,
    background: '#18181b', border: '1px solid #2a2a2e',
    cursor: 'pointer', transition: 'border-color 0.15s',
  },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  name: { fontSize: 14, fontWeight: 600, color: '#e8e8ea' },
  ver:  { fontSize: 11, padding: '2px 6px', borderRadius: 4, background: '#27272a', color: '#a1a1aa' },
  desc: { fontSize: 12, color: '#71717a', margin: '0 0 8px', lineHeight: 1.4 },
  meta: { display: 'flex', gap: 6, alignItems: 'center' },
  chip: { fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#1a1040', color: '#818cf8' },
  dl:   { fontSize: 11, color: '#52525b', marginLeft: 'auto' },
}