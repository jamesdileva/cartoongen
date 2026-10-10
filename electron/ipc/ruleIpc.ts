import { ipcMain } from 'electron'
import { IPC } from '../../src/shared/types/ipc'
// Static import: bundled into out/main at build time, works packed (asar).
// (fs reads of src/ break once packed.)
import bundledRulesData from '../../src/shared/data/rules.json'
import type { Rule } from '../../src/shared/types/rule'

export function registerRuleIpc(): void {
  ipcMain.handle(IPC.RULE_LIST_ALL, async () => {
    const { getPluginService } = await import('./pluginIpc')
    let plugin: Rule[] = []
    try {
      plugin = getPluginService()?.getPluginRules() ?? []
    } catch {
      // plugin service unavailable; bundled rules still served
    }
    return [...(bundledRulesData as Rule[]), ...plugin]
  })
}
