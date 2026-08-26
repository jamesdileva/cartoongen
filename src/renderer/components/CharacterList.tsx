import { useEffect, useState } from 'react'
import { useProjectStore } from '../stores/useProjectStore'
import { useCharacterStore } from '../stores/useCharacterStore'

interface CharacterListProps {
  onClose: () => void
}

export default function CharacterList({ onClose }: CharacterListProps) {
  const characterNames = useProjectStore((s) => s.characterNames)
  const refresh = useProjectStore((s) => s.refreshCharacterList)
  const loadCharacter = useCharacterStore((s) => s.loadCharacter)
  const loading = useCharacterStore((s) => s.loading)
  const [loadingName, setLoadingName] = useState<string | null>(null)

  useEffect(() => {
    refresh()
  }, [refresh])

  async function handleLoad(name: string) {
    setLoadingName(name)
    await loadCharacter(name)
    if (!useCharacterStore.getState().error) {
      onClose()
    }
    setLoadingName(null)
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 12px', fontSize: 15, color: '#eee' }}>Load Character</h3>
        <p style={{ fontSize: 11, color: '#666', marginBottom: 10, fontStyle: 'italic' }}>
          Use the Character Browser for search and thumbnails (accessible from toolbar).
        </p>

        {characterNames.length === 0 && (
          <p style={{ color: '#666', fontSize: 13 }}>No saved characters yet.</p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {characterNames.map((name) => (
            <button
              key={name}
              onClick={() => handleLoad(name)}
              disabled={loading}
              style={{
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid #444',
                background: loadingName === name ? '#333' : '#2a2a2a',
                color: '#ccc',
                fontSize: 13,
                cursor: loading ? 'default' : 'pointer',
                textAlign: 'left'
              }}
            >
              {name}
              {loadingName === name && (
                <span style={{ float: 'right', fontSize: 11, color: '#888' }}>loading...</span>
              )}
            </button>
          ))}
        </div>

        <button
          onClick={onClose}
          style={{
            marginTop: 12,
            padding: '6px 14px',
            borderRadius: 4,
            border: 'none',
            background: '#555',
            color: '#ccc',
            fontSize: 12,
            cursor: 'pointer'
          }}
        >
          Cancel
        </button>
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
  background: '#2a2a2a',
  color: '#ddd',
  borderRadius: 10,
  padding: 20,
  minWidth: 300,
  maxWidth: 400,
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  fontFamily: 'system-ui, sans-serif',
  fontSize: 14
}
