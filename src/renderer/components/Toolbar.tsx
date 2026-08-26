import { useCharacterStore } from '../stores/useCharacterStore'

interface ToolbarProps {
  onNewCharacter: () => void
  onLoadCharacter: () => void
  onImport: () => void
  onExport: () => void
  onRandomize: () => void
  onPresets: () => void
  onLighting: () => void
  onPlugins: () => void
}

export default function Toolbar({
  onNewCharacter,
  onLoadCharacter,
  onImport,
  onExport,
  onRandomize,
  onPresets,
  onLighting,
  onPlugins
}: ToolbarProps) {
  const canUndo = useCharacterStore((s) => s.canUndo)
  const canRedo = useCharacterStore((s) => s.canRedo)
  const loading = useCharacterStore((s) => s.loading)
  const name = useCharacterStore((s) => s.currentCharacterName)
  const save = useCharacterStore((s) => s.saveCharacter)
  const undo = useCharacterStore((s) => s.undo)
  const redo = useCharacterStore((s) => s.redo)

  return (
    <div style={barStyle}>
      <span style={{ fontWeight: 600, fontSize: 13, marginRight: 16, color: '#eee' }}>
        {name ?? 'CartoonGen'}
      </span>
      <button style={btnStyle} onClick={onNewCharacter} title="New Character (Ctrl+N)">
        New
      </button>
      <button style={btnStyle} onClick={save} disabled={loading || !name} title="Save (Ctrl+S)">
        Save
      </button>
      <button style={btnStyle} onClick={onLoadCharacter} title="Load Character">
        Load
      </button>
      <span style={sepStyle} />
      <button style={btnStyle} onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
        Undo
      </button>
      <button style={btnStyle} onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)">
        Redo
      </button>
      <span style={sepStyle} />
      <button style={btnStyle} onClick={onImport} title="Import Asset">
        Import
      </button>
      <button style={btnStyle} onClick={onExport} title="Export Character">
        Export
      </button>
      <button style={btnStyle} onClick={onLighting} title="Lighting Presets">
        Lighting
      </button>
      <button style={btnStyle} onClick={onPresets} title="Apply Preset">
        Presets
      </button>
      <button style={btnStyle} onClick={onRandomize} title="Randomize Character (Ctrl+R)">
        Random
      </button>
      <span style={sepStyle} />
      <button style={btnStyle} onClick={onPlugins} title="Manage Plugins">
        Plugins
      </button>
    </div>
  )
}

const barStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  height: 40,
  padding: '0 12px',
  background: '#1a1a1a',
  borderBottom: '1px solid #333',
  userSelect: 'none',
  flexShrink: 0
}

const btnStyle: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: 4,
  border: '1px solid #444',
  background: '#2a2a2a',
  color: '#ccc',
  fontSize: 12,
  cursor: 'pointer'
}

const sepStyle: React.CSSProperties = {
  width: 1,
  height: 20,
  background: '#333',
  margin: '0 4px'
}
