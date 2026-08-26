import { useState, useEffect } from 'react'
import type { AssetEntry } from '../../shared/types/asset'
import FavoriteToggle from './FavoriteToggle'

interface AssetCardProps {
  asset: AssetEntry
  isSelected: boolean
  isFavorite: boolean
  onClick: () => void
  onToggleFavorite: () => void
}

export default function AssetCard({
  asset,
  isSelected,
  isFavorite,
  onClick,
  onToggleFavorite
}: AssetCardProps) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null)
  const [hover, setHover] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const buffer = await window.electronAPI.asset.readThumbnail(asset.id)
      if (cancelled) return
      if (buffer) {
        const blob = new Blob([buffer], { type: 'image/png' })
        setThumbUrl(URL.createObjectURL(blob))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [asset.id])

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...cardStyle,
        outline: isSelected ? '2px solid #4488ff' : '2px solid transparent',
        background: thumbUrl ? 'transparent' : '#2a2a2a'
      }}
    >
      <FavoriteToggle isFavorite={isFavorite} onToggle={onToggleFavorite} />
      {thumbUrl ? (
        <img
          src={thumbUrl}
          alt={asset.id}
          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 4 }}
        />
      ) : (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            color: '#666'
          }}
        >
          no preview
        </div>
      )}
      {isSelected && <div style={checkStyle}>✓</div>}
      {hover && (
        <div style={tooltipStyle}>
          <div style={{ fontWeight: 600 }}>{asset.id}</div>
          <div style={{ fontSize: 10, color: '#999' }}>v{asset.version}</div>
          {asset.tags.length > 0 && (
            <div style={{ fontSize: 10, color: '#888' }}>{asset.tags.slice(0, 3).join(', ')}</div>
          )}
        </div>
      )}
    </div>
  )
}

const cardStyle: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  aspectRatio: '1',
  borderRadius: 6,
  cursor: 'pointer',
  overflow: 'hidden'
}

const checkStyle: React.CSSProperties = {
  position: 'absolute',
  top: 2,
  right: 2,
  background: '#4488ff',
  color: '#fff',
  borderRadius: '50%',
  width: 18,
  height: 18,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 12,
  fontWeight: 700
}

const tooltipStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 0,
  left: 0,
  right: 0,
  background: 'rgba(0,0,0,0.85)',
  padding: '4px 6px',
  fontSize: 11,
  color: '#ccc'
}
