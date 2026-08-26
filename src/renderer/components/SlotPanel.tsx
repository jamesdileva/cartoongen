import { useState, useEffect } from 'react'
import type { SlotDefinition } from '../../shared/types/slot'
import type { AssetEntry } from '../../shared/types/asset'
import { useSlotStore } from '../stores/useSlotStore'
import { useAssetStore } from '../stores/useAssetStore'
import { useCharacterStore } from '../stores/useCharacterStore'
import AssetCard from './AssetCard'

interface SlotPanelProps {
  activeSlot: string
  onActiveSlotChange: (slotId: string) => void
}

export default function SlotPanel({
  activeSlot,
  onActiveSlotChange: setActiveSlot
}: SlotPanelProps) {
  const slots = useSlotStore((s) => s.slots)
  const assets = useAssetStore((s) => s.assets)
  const queryAssets = useAssetStore((s) => s.queryAssets)
  const dna = useCharacterStore((s) => s.present)
  const setSlot = useCharacterStore((s) => s.setSlot)

  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [favorites, setFavorites] = useState<string[]>([])

  useEffect(() => {
    queryAssets()
  }, [queryAssets])

  useEffect(() => {
    ;(async () => {
      const favs = await window.electronAPI.project.getFavorites()
      setFavorites(favs)
    })()
  }, [])

  const handleToggleFavorite = async (assetId: string) => {
    const next = favorites.includes(assetId)
      ? favorites.filter((id) => id !== assetId)
      : [...favorites, assetId]
    setFavorites(next)
    await window.electronAPI.project.setFavorites(next)
  }

  let slotAssets = assets.filter((a) => a.slotId === activeSlot)
  if (favoritesOnly) {
    slotAssets = slotAssets.filter((a) => favorites.includes(a.id))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 2,
          padding: '8px 6px 4px',
          borderBottom: '1px solid #333',
          flexShrink: 0
        }}
      >
        <div
          onClick={() => setActiveSlot('none')}
          style={{
            ...tabStyle,
            background: activeSlot === 'none' ? '#4488ff' : '#2a2a2a'
          }}
        >
          None
        </div>
        {slots.map((s: SlotDefinition) => (
          <div
            key={s.id}
            onClick={() => setActiveSlot(s.id)}
            style={{
              ...tabStyle,
              background: activeSlot === s.id ? '#4488ff' : '#2a2a2a'
            }}
          >
            {s.label}
          </div>
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 8px',
          borderBottom: '1px solid #333',
          flexShrink: 0
        }}
      >
        <label
          style={{
            fontSize: 11,
            color: '#888',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            cursor: 'pointer'
          }}
        >
          <input
            type="checkbox"
            checked={favoritesOnly}
            onChange={(e) => setFavoritesOnly(e.target.checked)}
          />
          Favorites only
        </label>
      </div>

      {activeSlot === 'none' && (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            color: '#666',
            padding: 20,
            textAlign: 'center'
          }}
        >
          Select a slot above to browse its assets.
        </div>
      )}

      {activeSlot !== 'none' && slotAssets.length === 0 && (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            color: '#666',
            padding: 20,
            textAlign: 'center'
          }}
        >
          {favoritesOnly ? 'No favorites for this slot.' : `No assets for "${activeSlot}" slot.`}
          <br />
          Import some!
        </div>
      )}

      {activeSlot !== 'none' && slotAssets.length > 0 && (
        <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))',
              gap: 6
            }}
          >
            <AssetCard
              asset={{
                id: 'none',
                slotId: activeSlot,
                tags: [],
                path: '',
                version: 0,
                created: ''
              }}
              isSelected={!dna?.slots[activeSlot]}
              isFavorite={false}
              onClick={() => setSlot(activeSlot, null)}
              onToggleFavorite={() => {}}
            />
            {slotAssets.map((asset: AssetEntry) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                isSelected={dna?.slots[activeSlot] === asset.id}
                isFavorite={favorites.includes(asset.id)}
                onClick={() => setSlot(activeSlot, asset.id)}
                onToggleFavorite={() => handleToggleFavorite(asset.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const tabStyle: React.CSSProperties = {
  padding: '3px 10px',
  borderRadius: 4,
  fontSize: 11,
  fontWeight: 600,
  color: '#ccc',
  cursor: 'pointer',
  whiteSpace: 'nowrap'
}
