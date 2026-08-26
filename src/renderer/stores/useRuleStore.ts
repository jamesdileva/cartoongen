import { create } from 'zustand'
import type { Rule, RuleResult } from '../../shared/types/rule'
import type { CharacterDNA } from '../../shared/types/dna'
import { evaluateRules } from '../../shared/rules/engine'
import { useCharacterStore } from './useCharacterStore'

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

// Subscribe to character store changes to auto-evaluate rules
useCharacterStore.subscribe((state) => {
  if (state.present) {
    const ruleStore = useRuleStore.getState()
    if (ruleStore.rules.length > 0) {
      ruleStore.evaluate(state.present)
    }
  }
})
