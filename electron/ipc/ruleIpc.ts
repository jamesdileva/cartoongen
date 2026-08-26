import { ipcMain } from 'electron'
import { IPC } from '../../src/shared/types/ipc'

export function registerRuleIpc(): void {
  ipcMain.handle(IPC.RULE_LIST_ALL, async () => {
    const { getPluginService } = await import('./pluginIpc')
    const plugin = getPluginService()?.getPluginRules() ?? []
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const bundledPath = join(__dirname, '../../src/shared/data/rules.json')
    try {
      const bundled = JSON.parse(readFileSync(bundledPath, 'utf-8'))
      return [...bundled, ...plugin]
    } catch {
      return plugin
    }
  })
}
