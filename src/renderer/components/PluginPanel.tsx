import { useEffect } from 'react'
import { usePluginStore } from '../stores/usePluginStore'

interface PluginPanelProps {
  onClose: () => void
}

export default function PluginPanel({ onClose }: PluginPanelProps) {
  const plugins = usePluginStore((s) => s.plugins)
  const loading = usePluginStore((s) => s.loading)
  const listPlugins = usePluginStore((s) => s.listPlugins)
  const togglePlugin = usePluginStore((s) => s.togglePlugin)

  useEffect(() => {
    listPlugins()
  }, [listPlugins])

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 12px', fontSize: 15, color: '#eee' }}>Plugins</h3>

        {loading && <p style={{ color: '#888', fontSize: 13 }}>Loading plugins...</p>}

        {!loading && plugins.length === 0 && (
          <p style={{ color: '#666', fontSize: 13 }}>
            No plugins found.
            <br />
            Drop a plugin folder into your project's <code style={{ color: '#888' }}>
              plugins/
            </code>{' '}
            directory and restart.
          </p>
        )}

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            maxHeight: 360,
            overflow: 'auto'
          }}
        >
          {plugins.map((p) => (
            <div
              key={p.id}
              style={{
                ...rowStyle,
                opacity: p.enabled ? 1 : 0.5,
                borderLeft: `3px solid ${statusColor(p.status)}`
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#ddd' }}>
                  {p.name}
                  <span style={{ fontSize: 11, color: '#888', fontWeight: 400, marginLeft: 8 }}>
                    v{p.version}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: '#888' }}>{p.description}</div>
                <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>by {p.author}</div>
                {p.status !== 'loaded' && p.error && (
                  <div style={{ fontSize: 11, color: '#e57373', marginTop: 4 }}>{p.error}</div>
                )}
              </div>
              <label style={toggleStyle}>
                <input
                  type="checkbox"
                  checked={p.enabled}
                  disabled={p.status !== 'loaded'}
                  onChange={(e) => togglePlugin(p.id, e.target.checked)}
                />
                <span style={{ fontSize: 11, color: '#888', marginLeft: 4 }}>
                  {p.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </label>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button style={cancelBtnStyle} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function statusColor(status: string): string {
  switch (status) {
    case 'loaded':
      return '#4caf50'
    case 'error':
      return '#f44336'
    case 'incompatible':
      return '#ff9800'
    default:
      return '#666'
  }
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000
}

const dialogStyle: React.CSSProperties = {
  background: '#1e1e1e',
  border: '1px solid #444',
  borderRadius: 8,
  padding: 20,
  minWidth: 460,
  maxWidth: 560
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 10px',
  borderRadius: 4,
  background: '#2a2a2a'
}

const toggleStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  flexShrink: 0
}

const cancelBtnStyle: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: 4,
  border: '1px solid #444',
  background: '#2a2a2a',
  color: '#ccc',
  fontSize: 12,
  cursor: 'pointer'
}
