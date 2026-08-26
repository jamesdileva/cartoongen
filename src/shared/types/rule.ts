export interface Rule {
  id: string
  description?: string
  trigger: {
    slotId?: string
    assetId?: string
    tag?: string
  }
  conditions?: Array<{
    slotId: string
    equipped?: boolean
    assetId?: string
    tag?: string
  }>
  actions: RuleAction[]
}

export type RuleActionType = 'hide_slot' | 'show_slot' | 'disable_slot' | 'force_asset' | 'warn'

export interface RuleAction {
  type: RuleActionType
  target?: string
  assetId?: string
  message?: string
}

export type RuleResultType = 'hide' | 'show' | 'disable' | 'force_asset' | 'warn'

export interface RuleResult {
  ruleId: string
  type: RuleResultType
  slotId?: string
  assetId?: string
  message?: string
}
