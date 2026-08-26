import type { Template } from '../../shared/types/template'
import templatesData from '../../shared/data/templates.json'

const templates = templatesData as Template[]

interface TemplateDialogProps {
  onSelect: (template: Template) => void
  onClose: () => void
}

export default function TemplateDialog({ onSelect, onClose }: TemplateDialogProps) {
  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 4px', color: '#eee', fontSize: 14 }}>New Character</h3>
        <p style={{ margin: '0 0 12px', fontSize: 12, color: '#888' }}>
          Choose a starting template
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          {templates.map((t) => (
            <button key={t.id} onClick={() => onSelect(t)} style={cardStyle} title={t.description}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>{t.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#ddd' }}>{t.name}</div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{t.description}</div>
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
  background: '#1e1e1e',
  border: '1px solid #444',
  borderRadius: 8,
  padding: 20,
  minWidth: 480,
  maxWidth: 600
}

const cardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '14px 10px',
  borderRadius: 8,
  border: '1px solid #333',
  background: '#2a2a2a',
  color: '#ccc',
  cursor: 'pointer',
  textAlign: 'center',
  flex: '0 0 auto',
  width: 100,
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
