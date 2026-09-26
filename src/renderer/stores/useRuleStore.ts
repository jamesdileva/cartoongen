import { create } from 'zustand'
import type { Rule, RuleResult } from '../../shared/types/rule'
import type { CharacterDNA } from '../../shared/types/dna'
import { evaluateRules } from '../../shared/rules/engine'
import { useCharacterStore } from './useCharacterStore'
import { useAssetStore } from './useAssetStore'

interface RuleState {
  rules: Rule[]
  results: RuleResult[]
  loading: boolean
  error: string | null
  loadRules: () => Promise<void>
  evaluate: (dna: CharacterDNA, getAssetTags?: (id: string) => string[] | undefined) => void
}

export const useRuleStore = create<RuleState>((set, get) => ({
  rules: [],
  results: [],
  loading: false,
  error: null,

  loadRules: async () => {
    set({ loading: true, error: null })
    try {
      const rules = await window.electronAPI.rule.listAll()
      set({ rules, loading: false })
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
    }
  },

  evaluate: (dna, getAssetTags) => {
    const { rules } = get()
    const results = evaluateRules(dna, rules, getAssetTags)
    set({ results })
  }
}))

// Tag-based triggers (full_face, hat, ...) need asset metadata. The asset
// store already merges procedural catalog entries (with tags), so resolve
// against it. Without this, tag rules silently never fire.
function resolveAssetTags(id: string): string[] | undefined {
  return useAssetStore.getState().assets.find((a) => a.id === id)?.tags
}

// Subscribe to character store changes to auto-evaluate rules
useCharacterStore.subscribe((state) => {
  if (state.present) {
    const ruleStore = useRuleStore.getState()
    if (ruleStore.rules.length > 0) {
      ruleStore.evaluate(state.present, resolveAssetTags)
    }
  }
})
