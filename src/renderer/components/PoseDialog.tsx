import { useState } from 'react'
import posesData from '../../shared/data/poses.json'
import type { Pose } from '../../shared/types/pose'

const poses = posesData as Pose[]

interface PoseDialogProps {
  currentPose: string | null
  onSelect: (pose: Pose) => void
  onReset: () => void
  onClose: () => void
}

export default function PoseDialog({ currentPose, onSelect, onReset, onClose }: PoseDialogProps) {
  const [selected, setSelected] = useState<string | null>(currentPose)

  const handleClick = (pose: Pose) => {
    setSelected(pose.id)
    onSelect(pose)
  }

  const handleReset = () => {
    setSelected(null)
    onReset()
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 12px', color: '#eee', fontSize: 14 }}>Poses</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {poses.map((p) => (
            <button
              key={p.id}
              onClick={() => handleClick(p)}
              style={{
                ...cardStyle,
                borderColor: selected === p.id ? '#ff9800' : '#333',
                background: selected === p.id ? '#333' : '#2a2a2a'
              }}
              title={p.description}
            >
              <div style={{ fontSize: 24, marginBottom: 4 }}>{p.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#ddd' }}>{p.name}</div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{p.description}</div>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
          <button style={cancelBtnStyle} onClick={handleReset}>
            Reset Pose
          </button>
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
