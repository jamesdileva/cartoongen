import { useCharacterStore } from '../stores/useCharacterStore'
import { PROPORTION_MORPHS } from '../three/ProportionManager'
import {
  DEFAULT_FACE_SHAPE,
  NOSE_STYLES,
  EYE_STYLES,
  BROW_STYLES,
  EAR_STYLES
} from '../../shared/types/faceShape'
import ColorPicker from './ColorPicker'

type NumericFaceKey = 'eyeScale' | 'eyeSpacing' | 'browTilt' | 'browHeight' | 'mouthCurve' | 'mouthWidth' | 'noseSize'

const FACE_SLIDERS: Array<{
  key: NumericFaceKey
  label: string
  min: number
  max: number
}> = [
  { key: 'eyeScale', label: 'Eye Size', min: 0.6, max: 1.6 },
  { key: 'eyeSpacing', label: 'Eye Spacing', min: 0.7, max: 1.4 },
  { key: 'browTilt', label: 'Brow Tilt (sad → angry)', min: -1, max: 1 },
  { key: 'browHeight', label: 'Brow Height', min: 0.8, max: 1.25 },
  { key: 'mouthCurve', label: 'Mouth Curve (frown → smile)', min: -1, max: 1 },
  { key: 'mouthWidth', label: 'Mouth Width', min: 0.7, max: 1.4 },
  { key: 'noseSize', label: 'Nose Size', min: 0.6, max: 1.6 }
]

const FACE_STYLES: Array<{
  key: 'noseStyle' | 'eyeStyle' | 'browStyle' | 'earStyle'
  label: string
  options: string[]
}> = [
  { key: 'noseStyle', label: 'Nose', options: [...NOSE_STYLES] },
  { key: 'eyeStyle', label: 'Eyes', options: [...EYE_STYLES] },
  { key: 'browStyle', label: 'Brows', options: [...BROW_STYLES] },
  { key: 'earStyle', label: 'Ears', options: [...EAR_STYLES] }
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
          {FACE_STYLES.map(({ key, label, options }) => {
            const value = (face?.[key] ?? DEFAULT_FACE_SHAPE[key]) as string
            return (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ fontSize: 11, color: '#aaa', width: 44 }}>{label}</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {options.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => setFace({ [key]: opt })}
                      style={{
                        fontSize: 11,
                        padding: '2px 8px',
                        borderRadius: 10,
                        border: '1px solid #444',
                        background: value === opt ? '#4a7a9c' : '#2a2a2a',
                        color: value === opt ? '#fff' : '#ccc',
                        cursor: 'pointer',
                        textTransform: 'capitalize'
                      }}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
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
        <div style={sectionTitleStyle}>Clothes</div>
        <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ fontSize: 11, color: '#aaa' }}>Top Length (hip &#8594; crop)</div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={morphs?.topLength ?? 0}
              onChange={(e) => setMorph('topLength', parseFloat(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>
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
