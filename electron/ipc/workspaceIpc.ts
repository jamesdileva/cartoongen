import { ipcMain } from 'electron'
import { IPC } from '../../src/shared/types/ipc'
import { WorkspaceService } from '../services/WorkspaceService'
import { getProjectRoot } from './index'

export function registerWorkspaceIpc(): void {
  ipcMain.handle(IPC.WORKSPACE_LOAD, async () => {
    return WorkspaceService.load(getProjectRoot())
  })

  ipcMain.handle(IPC.WORKSPACE_SAVE, async (_event, state) => {
    return WorkspaceService.save(getProjectRoot(), { ...state, projectRoot: getProjectRoot() })
  })
}
