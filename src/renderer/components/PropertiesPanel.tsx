import { useCharacterStore } from '../stores/useCharacterStore'
import { PROPORTION_MORPHS } from '../three/ProportionManager'
import { DEFAULT_FACE_SHAPE, type FaceShape } from '../../shared/types/faceShape'
import ColorPicker from './ColorPicker'

const FACE_SLIDERS: Array<{
  key: keyof FaceShape
  label: string
  min: number
  max: number
}> = [
  { key: 'eyeScale', label: 'Eye Size', min: 0.6, max: 1.6 },
  { key: 'eyeSpacing', label: 'Eye Spacing', min: 0.7, max: 1.4 },
  { key: 'browTilt', label: 'Brow Tilt (sad \u2192 angry)', min: -1, max: 1 },
  { key: 'browHeight', label: 'Brow Height', min: 0.8, max: 1.25 },
  { key: 'mouthCurve', label: 'Mouth Curve (frown \u2192 smile)', min: -1, max: 1 },
  { key: 'mouthWidth', label: 'Mouth Width', min: 0.7, max: 1.4 },
  { key: 'noseSize', label: 'Nose Size', min: 0.6, max: 1.6 }
]

export default function PropertiesPanel() {
  const morphs = useCharacterStore((s) => s.present?.morphs)
  const setMorph = useCharacterStore((s) => s.setMorph)
  const face = useCharacterStore((s) => s.present?.face)
  const setFace = useCharacterStore((s) => s.setFace)

  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Colors</div>
        <ColorPicker />
      </div>

      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Face</div>
        <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {FACE_SLIDERS.map(({ key, label, min, max }) => {
            const value = face?.[key] ?? DEFAULT_FACE_SHAPE[key]
            const normalized = (value - min) / (max - min)
            return (
              <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ fontSize: 11, color: '#aaa' }}>{label}</div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={normalized}
                  onChange={(e) => {
                    const raw = min + parseFloat(e.target.value) * (max - min)
                    setFace({ [key]: Math.round(raw * 100) / 100 })
                  }}
                  style={{ width: '100%' }}
                />
              </div>
            )
          })}
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Body</div>
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
