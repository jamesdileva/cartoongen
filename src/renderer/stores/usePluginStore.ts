import { create } from 'zustand'
import type { PluginState } from '../../shared/types/plugin'

interface PluginStoreState {
  plugins: PluginState[]
  loading: boolean
  error: string | null
  listPlugins: () => Promise<void>
  togglePlugin: (pluginId: string, enabled: boolean) => Promise<void>
}

export const usePluginStore = create<PluginStoreState>((set) => ({
  plugins: [],
  loading: false,
  error: null,

  listPlugins: async () => {
    set({ loading: true, error: null })
    try {
      const plugins = await window.electronAPI.plugin.list()
      set({ plugins, loading: false })
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
    }
  },

  togglePlugin: async (pluginId, enabled) => {
    const result = await window.electronAPI.plugin.toggle(pluginId, enabled)
    if (result.ok) {
      set((s) => ({
        plugins: s.plugins.map((p) => (p.id === pluginId ? { ...p, enabled } : p))
      }))
    } else {
      set({ error: result.error })
    }
  }
}))
