import { useToastStore } from '../stores/useToastStore'
import type { ToastItem } from '../stores/useToastStore'

export default function ToastProvider() {
  const toasts = useToastStore((s) => s.toasts)
  const remove = useToastStore((s) => s.removeToast)

  if (toasts.length === 0) return null

  return (
    <div style={containerStyle}>
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => remove(t.id)}
          style={{ ...toastStyle, background: bgColor(t.type) }}
        >
          <span style={iconStyle}>{icon(t.type)}</span>
          {t.message}
        </div>
      ))}
    </div>
  )
}

function bgColor(type: ToastItem['type']): string {
  switch (type) {
    case 'success':
      return '#2e7d32'
    case 'error':
      return '#c62828'
    case 'info':
      return '#1565c0'
  }
}

function icon(type: ToastItem['type']): string {
  switch (type) {
    case 'success':
      return '\u2713'
    case 'error':
      return '\u2717'
    case 'info':
      return '\u2139'
  }
}

const containerStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 12,
  right: 12,
  zIndex: 2000,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  pointerEvents: 'none'
}

const toastStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 16px',
  borderRadius: 6,
  color: '#fff',
  fontSize: 13,
  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
  pointerEvents: 'auto',
  cursor: 'pointer',
  whiteSpace: 'nowrap'
}

const iconStyle: React.CSSProperties = {
  fontWeight: 700,
  fontSize: 14
}
