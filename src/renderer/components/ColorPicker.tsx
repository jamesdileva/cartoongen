import { useState } from 'react'
import { useDataStore } from '../stores/useDataStore'
import { useCharacterStore } from '../stores/useCharacterStore'

export default function ColorPicker() {
  const [category, setCategory] = useState('skin')
  const storeSetColor = useCharacterStore((s) => s.setColor)
  const palettes = useDataStore((s) => s.palettes)
  const loading = useDataStore((s) => s.loading)

  const CATEGORIES = Object.keys(palettes)
  const palette = CATEGORIES.length > 0 ? palettes[category] : null

  if (loading || !palette) {
    return (
      <div style={{ padding: '8px 10px', fontSize: 12, color: '#666' }}>
        {loading ? 'Loading palettes...' : 'No palettes loaded.'}
      </div>
    )
  }

  return (
    <div style={{ padding: '8px 10px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginBottom: 8 }}>
        {CATEGORIES.map((cat) => (
          <div
            key={cat}
            onClick={() => setCategory(cat)}
            style={{
              padding: '3px 10px',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 600,
              color: '#ccc',
              cursor: 'pointer',
              background: category === cat ? '#4488ff' : '#2a2a2a'
            }}
          >
            {cat}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 6 }}>
        <div style={{ fontSize: 11, color: '#888' }}>Default</div>
        <button
          onClick={() => storeSetColor(category, palette.default)}
          style={{ ...swatchStyle, background: palette.default }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ fontSize: 11, color: '#888' }}>Palette</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 3 }}>
          {palette.colors.map((hex) => (
            <button
              key={hex}
              onClick={() => storeSetColor(category, hex)}
              style={{ ...swatchStyle, background: hex }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

const swatchStyle: React.CSSProperties = {
  width: '100%',
  aspectRatio: '1',
  borderRadius: 4,
  border: '1px solid #444',
  cursor: 'pointer',
  padding: 0
}
