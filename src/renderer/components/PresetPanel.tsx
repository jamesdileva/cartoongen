import { useState } from 'react'
import type { Preset } from '../../shared/types/preset'
import { useDataStore } from '../stores/useDataStore'

interface PresetPanelProps {
  onApply: (preset: Preset) => void
  onClose: () => void
  onSavePreset: (name: string) => void
  onDeletePreset: (id: string) => void
}

export default function PresetPanel({ onApply, onClose, onSavePreset, onDeletePreset }: PresetPanelProps) {
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
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

  const handleDelete = (preset: Preset) => {
    if (deleteId === preset.id) {
      onDeletePreset(preset.id)
      setDeleteId(null)
    } else {
      setDeleteId(preset.id)
    }
  }

  const handleSave = () => {
    const name = newName.trim()
    if (name.length === 0) return
    onSavePreset(name)
    setNewName('')
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
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Save current look as…"
            maxLength={40}
            style={{
              flex: 1,
              padding: '6px 10px',
              borderRadius: 4,
              border: '1px solid #444',
              background: '#2a2a2a',
              color: '#eee',
              fontSize: 12
            }}
          />
          <button
            style={{ ...cancelBtnStyle, opacity: newName.trim() ? 1 : 0.5 }}
            onClick={handleSave}
            disabled={!newName.trim()}
          >
            Save
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {presets.map((p) => (
            <button
              key={p.id}
              onClick={() => handleClick(p)}
              style={{
                ...cardStyle,
                borderColor: confirmId === p.id ? '#ff9800' : '#333',
                position: 'relative'
              }}
              title={confirmId === p.id ? 'Click again to confirm' : p.description}
            >
              {p.custom && (
                <span
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDelete(p)
                  }}
                  title={deleteId === p.id ? 'Click again to delete' : 'Delete preset'}                  style={{
                    position: 'absolute',
                    top: 4,
                    right: 6,
                    fontSize: 12,
                    color: deleteId === p.id ? '#ff5252' : '#888',
                    cursor: 'pointer',
                    fontWeight: 700
                  }}
                >
                  ×
                </span>
              )}
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
