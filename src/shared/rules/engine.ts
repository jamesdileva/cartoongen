import type { CharacterDNA } from '../types/dna'
import type { Rule, RuleResult } from '../types/rule'

type AssetTagResolver = (assetId: string) => string[] | undefined

function getAssetTags(assetId: string, resolver?: AssetTagResolver): string[] {
  if (!resolver) return []
  const tags = resolver(assetId)
  return tags ?? []
}

function ruleMatchesTrigger(rule: Rule, dna: CharacterDNA, resolver?: AssetTagResolver): boolean {
  const { slotId, assetId, tag } = rule.trigger

  if (slotId) {
    const equippedAsset = dna.slots[slotId]
    if (equippedAsset == null) return false

    if (assetId && equippedAsset !== assetId) return false

    if (tag) {
      const tags = getAssetTags(equippedAsset, resolver)
      if (!tags.includes(tag)) return false
    }
  }

  return true
}

function checkConditions(
  conditions: NonNullable<Rule['conditions']>,
  dna: CharacterDNA,
  resolver?: AssetTagResolver
): boolean {
  return conditions.every((cond) => {
    const slotValue = dna.slots[cond.slotId]

    if (cond.equipped === false) {
      if (slotValue != null) return false
    } else if (cond.equipped === true) {
      if (slotValue == null) return false
    }

    if (cond.assetId && slotValue !== cond.assetId) return false

    if (cond.tag && slotValue) {
      const tags = getAssetTags(slotValue, resolver)
      if (!tags.includes(cond.tag)) return false
    }

    return true
  })
}

function actionToResult(ruleId: string, action: Rule['actions'][0]): RuleResult {
  switch (action.type) {
    case 'hide_slot':
      return { ruleId, type: 'hide', slotId: action.target }
    case 'show_slot':
      return { ruleId, type: 'show', slotId: action.target }
    case 'disable_slot':
      return { ruleId, type: 'disable', slotId: action.target }
    case 'force_asset':
      return { ruleId, type: 'force_asset', slotId: action.target, assetId: action.assetId }
    case 'warn':
      return { ruleId, type: 'warn', message: action.message }
    default:
      return { ruleId, type: 'warn', message: 'Unknown rule action' }
  }
}

export function evaluateRules(
  dna: CharacterDNA,
  rules: Rule[],
  getAssetTags?: AssetTagResolver
): RuleResult[] {
  const results: RuleResult[] = []

  for (const rule of rules) {
    if (!ruleMatchesTrigger(rule, dna, getAssetTags)) continue

    if (rule.conditions && rule.conditions.length > 0) {
      if (!checkConditions(rule.conditions, dna, getAssetTags)) continue
    }

    for (const action of rule.actions) {
      results.push(actionToResult(rule.id, action))
    }
  }

  return results
}
