import { useState } from 'react'
import type { Preset } from '../../shared/types/preset'
import { useDataStore } from '../stores/useDataStore'

interface PresetPanelProps {
  onApply: (preset: Preset) => void
  onClose: () => void
}

export default function PresetPanel({ onApply, onClose }: PresetPanelProps) {
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const presets = useDataStore((s) => s.presets)
  const loading = useDataStore((s) => s.loading)

  const handleClick = (preset: Preset) => {
    if (confirmId === preset.id) {
      onApply(preset)
      onClose()
    } else {
      setConfirmId(preset.id)
    }
  }

  if (loading) {
    return (
      <div style={overlayStyle} onClick={onClose}>
        <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
          <p style={{ color: '#888', fontSize: 13 }}>Loading presets...</p>
        </div>
      </div>
    )
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 12px', color: '#eee', fontSize: 14 }}>Character Presets</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {presets.map((p) => (
            <button
              key={p.id}
              onClick={() => handleClick(p)}
              style={{
                ...cardStyle,
                borderColor: confirmId === p.id ? '#ff9800' : '#333'
              }}
              title={confirmId === p.id ? 'Click again to confirm' : p.description}
            >
              <div style={{ fontSize: 24, marginBottom: 4 }}>{p.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#ddd' }}>{p.name}</div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{p.description}</div>
              {confirmId === p.id && (
                <div style={{ fontSize: 11, color: '#ff9800', marginTop: 4 }}>
                  Click again to apply
                </div>
              )}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button style={cancelBtnStyle} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
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
  minWidth: 420,
  maxWidth: 500
}

const cardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '12px 8px',
  borderRadius: 8,
  border: '1px solid #333',
  background: '#2a2a2a',
  color: '#ccc',
  cursor: 'pointer',
  textAlign: 'center',
  transition: 'border-color 0.15s'
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
