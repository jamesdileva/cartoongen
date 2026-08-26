import { useState } from 'react'
import presetsData from '../../shared/data/lighting-presets.json'
import type { LightingPreset } from '../three/LightingManager'

const presets = presetsData as LightingPreset[]

interface LightingDialogProps {
  currentPreset: string
  onSelect: (presetId: string) => void
  onClose: () => void
}

export default function LightingDialog({ currentPreset, onSelect, onClose }: LightingDialogProps) {
  const [selected, setSelected] = useState(currentPreset)

  const handleClick = (id: string) => {
    setSelected(id)
    onSelect(id)
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 12px', color: '#eee', fontSize: 14 }}>Lighting Presets</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {presets.map((p) => (
            <button
              key={p.id}
              onClick={() => handleClick(p.id)}
              style={{
                ...cardStyle,
                borderColor: selected === p.id ? '#ff9800' : '#333',
                background: selected === p.id ? '#333' : '#2a2a2a'
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: '#ddd' }}>{p.name}</div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{p.description}</div>
            </button>
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
  minWidth: 380,
  maxWidth: 460
}

const cardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '12px 8px',
  borderRadius: 8,
  border: '1px solid #333',
  cursor: 'pointer',
  textAlign: 'center'
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
