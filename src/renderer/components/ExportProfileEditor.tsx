import { useState } from 'react'
import type { ExportProfile } from '../../shared/types/export'
import { getExportProfiles, updateExportProfiles } from '../stores/useExportProfileStore'
import profilesData from '../../shared/data/export-profiles.json'

const defaults = profilesData as ExportProfile[]

interface ExportProfileEditorProps {
  onClose: () => void
}

export default function ExportProfileEditor({ onClose }: ExportProfileEditorProps) {
  const [profiles, setProfiles] = useState<ExportProfile[]>(getExportProfiles)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const syncProfiles = (next: ExportProfile[]) => {
    setProfiles(next)
    updateExportProfiles(next)
  }

  const handleRename = (id: string) => {
    setEditingId(id)
    setEditName(profiles.find((p) => p.id === id)?.name ?? '')
  }

  const confirmRename = () => {
    if (!editingId || !editName.trim()) return
    syncProfiles(
      profiles.map((p) => (p.id === editingId ? { ...p, name: editName.trim() } : p))
    )
    setEditingId(null)
  }

  const handleDuplicate = (profile: ExportProfile) => {
    const newId = `${profile.id}-copy-${Date.now().toString(36)}`
    const copy: ExportProfile = { ...profile, id: newId, name: `${profile.name} (Copy)` }
    syncProfiles([...profiles, copy])
  }

  const handleDelete = (id: string) => {
    const isDefault = defaults.some((d) => d.id === id)
    if (isDefault) return
    syncProfiles(profiles.filter((p) => p.id !== id))
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 12px', color: '#eee', fontSize: 14 }}>Export Profiles</h3>

        <div style={{ maxHeight: 300, overflow: 'auto', marginBottom: 12 }}>
          {profiles.map((p) => {
            const isDefault = defaults.some((d) => d.id === p.id)
            return (
              <div key={p.id} style={rowStyle}>
                {editingId === p.id ? (
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={confirmRename}
                    onKeyDown={(e) => e.key === 'Enter' && confirmRename()}
                    style={editInputStyle}
                    autoFocus
                  />
                ) : (
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: '#ddd' }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: '#888' }}>
                      {p.binary ? 'GLB' : 'GLTF'} &middot;{' '}
                      {p.embedImages ? 'Embedded textures' : 'External textures'}
                    </div>
                  </div>
                )}
                {editingId !== p.id && (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      style={actionBtnStyle}
                      onClick={() => handleRename(p.id)}
                      title="Rename"
                    >
                      {'\u270F'}
                    </button>
                    <button
                      style={actionBtnStyle}
                      onClick={() => handleDuplicate(p)}
                      title="Duplicate"
                    >
                      {'\uD83D\uDCCB'}
                    </button>
                    {!isDefault && (
                      <button
                        style={actionBtnStyle}
                        onClick={() => handleDelete(p.id)}
                        title="Delete"
                      >
                        {'\u2716'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
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

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 8px',
  borderRadius: 4,
  borderBottom: '1px solid #333'
}

const editInputStyle: React.CSSProperties = {
  flex: 1,
  padding: '4px 8px',
  borderRadius: 4,
  border: '1px solid #555',
  background: '#1a1a1a',
  color: '#ddd',
  fontSize: 13
}

const actionBtnStyle: React.CSSProperties = {
  padding: '2px 6px',
  borderRadius: 4,
  border: '1px solid #555',
  background: '#2a2a2a',
  color: '#aaa',
  fontSize: 12,
  cursor: 'pointer',
  lineHeight: 1
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
