import { create } from 'zustand'
import type { AssetEntry, AssetQuery } from '../../shared/types/asset'
import { getProceduralAssetEntries } from '../three/procedural/Garments'

interface AssetState {
  assets: AssetEntry[]
  loading: boolean
  error: string | null

  queryAssets: (filters?: AssetQuery) => Promise<void>
  getBySlot: (slotId: string) => AssetEntry[]
}

function matchesQuery(asset: AssetEntry, filters?: AssetQuery): boolean {
  if (!filters) return true
  if (filters.slotId && asset.slotId !== filters.slotId) return false
  if (filters.ids && !filters.ids.includes(asset.id)) return false
  if (filters.tags && !filters.tags.every((t) => asset.tags.includes(t))) return false
  return true
}

export const useAssetStore = create<AssetState>((set, get) => ({
  assets: [],
  loading: false,
  error: null,

  queryAssets: async (filters) => {
    set({ loading: true, error: null })
    try {
      const results = await window.electronAPI.asset.query(filters)
      const procedural = getProceduralAssetEntries().filter((a) => matchesQuery(a, filters))
      set({ assets: [...results, ...procedural], loading: false })
    } catch (err) {
      const procedural = getProceduralAssetEntries().filter((a) => matchesQuery(a, filters))
      set({
        assets: procedural,
        error: (err as Error).message,
        loading: false
      })
    }
  },

  getBySlot: (slotId) => {
    return get().assets.filter((a) => a.slotId === slotId)
  }
}))
