import { useCharacterStore } from '../stores/useCharacterStore'
import { PROPORTION_MORPHS } from '../three/ProportionManager'
import ColorPicker from './ColorPicker'

export default function PropertiesPanel() {
  const morphs = useCharacterStore((s) => s.present?.morphs)
  const setMorph = useCharacterStore((s) => s.setMorph)

  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Colors</div>
        <ColorPicker />
      </div>

      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Morphs</div>
        <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {PROPORTION_MORPHS.map(({ name, label }) => {
            const value = morphs?.[name] ?? 0.5
            return (
              <div key={name} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ fontSize: 11, color: '#aaa' }}>{label}</div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={value}
                  onChange={(e) => setMorph(name, parseFloat(e.target.value))}
                  style={{ width: '100%' }}
                />
                <div style={{ fontSize: 10, color: '#666', textAlign: 'right' }}>
                  {Math.round(value * 100)}%
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

const sectionStyle: React.CSSProperties = {
  borderBottom: '1px solid #333'
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: '#aaa',
  padding: '8px 10px 4px'
}
