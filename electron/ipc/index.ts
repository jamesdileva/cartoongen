import { registerProjectIpc } from './projectIpc'
import { registerCharacterIpc } from './characterIpc'
import { registerAssetIpc } from './assetIpc'
import { registerSlotIpc } from './slotIpc'
import { registerRuleIpc } from './ruleIpc'
import { registerImportIpc } from './importIpc'
import { registerExportIpc } from './exportIpc'
import { registerWorkspaceIpc } from './workspaceIpc'
import { registerPluginIpc } from './pluginIpc'
import type { ProjectService } from '../services/ProjectService'

let currentService: ProjectService | null = null

export function setProjectService(svc: ProjectService): void {
  currentService = svc
}

export function getProjectRoot(): string {
  if (!currentService) throw new Error('No project service set')
  return currentService.root
}

export function getProjectService(): ProjectService {
  if (!currentService) throw new Error('No project service set')
  return currentService
}

export function registerAllIpcHandlers(): void {
  registerProjectIpc(getProjectService)
  registerCharacterIpc(getProjectRoot)
  registerAssetIpc(getProjectRoot)
  registerSlotIpc()
  registerRuleIpc()
  registerImportIpc(getProjectRoot)
  registerExportIpc()
  registerWorkspaceIpc()
  registerPluginIpc()
}
