import { useState, useEffect } from 'react'
import { useProjectStore } from '../stores/useProjectStore'
import { useCharacterStore } from '../stores/useCharacterStore'

interface CharacterBrowserProps {
  onClose: () => void
}

type SortKey = 'name'

export default function CharacterBrowser({ onClose }: CharacterBrowserProps) {
  const characterNames = useProjectStore((s) => s.characterNames)
  const refresh = useProjectStore((s) => s.refreshCharacterList)
  const loadCharacter = useCharacterStore((s) => s.loadCharacter)
  const loading = useCharacterStore((s) => s.loading)
  const [loadingName, setLoadingName] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('name')

  useEffect(() => {
    refresh()
  }, [refresh])

  const filtered = characterNames
    .filter((n) => n.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.localeCompare(b))

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
        <h3 style={{ margin: '0 0 4px', fontSize: 15, color: '#eee' }}>Load Character</h3>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12, marginTop: 8 }}>
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={inputStyle}
          />
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            style={selectStyle}
          >
            <option value="name">Name</option>
          </select>
        </div>

        {filtered.length === 0 && (
          <p style={{ color: '#666', fontSize: 13 }}>
            {search ? 'No characters match your search.' : 'No saved characters yet.'}
          </p>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: 8,
            maxHeight: 360,
            overflow: 'auto'
          }}
        >
          {filtered.map((name) => (
            <button
              key={name}
              onClick={() => handleLoad(name)}
              disabled={loading}
              style={{
                ...cardStyle,
                opacity: loading && loadingName !== name ? 0.6 : 1
              }}
            >
              <div
                style={{
                  width: '100%',
                  aspectRatio: '1',
                  borderRadius: 6,
                  background: '#333',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 28,
                  color: '#555',
                  marginBottom: 6
                }}
              >
                {'\uD83E\uDDD1\u200D\uD83C\uDFA8'}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: '#ccc',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  width: '100%'
                }}
              >
                {name}
              </div>
              {loadingName === name && (
                <span style={{ fontSize: 10, color: '#888' }}>loading...</span>
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
  background: '#2a2a2a',
  color: '#ddd',
  borderRadius: 10,
  padding: 20,
  minWidth: 460,
  maxWidth: 580,
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  fontFamily: 'system-ui, sans-serif',
  fontSize: 14
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: '6px 10px',
  borderRadius: 4,
  border: '1px solid #555',
  background: '#1a1a1a',
  color: '#ddd',
  fontSize: 13
}

const selectStyle: React.CSSProperties = {
  padding: '6px 8px',
  borderRadius: 4,
  border: '1px solid #555',
  background: '#1a1a1a',
  color: '#ddd',
  fontSize: 12
}

const cardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '8px',
  borderRadius: 8,
  border: '1px solid #444',
  background: '#2a2a2a',
  cursor: 'pointer',
  textAlign: 'center'
}

const cancelBtnStyle: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: 4,
  border: '1px solid #444',
  background: '#555',
  color: '#ccc',
  fontSize: 12,
  cursor: 'pointer'
}
