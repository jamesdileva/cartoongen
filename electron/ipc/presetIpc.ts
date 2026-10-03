import { ipcMain } from 'electron'
import { IPC } from '../../src/shared/types/ipc'
import type { Preset } from '../../src/shared/types/preset'
import { UserPresetService } from '../services/UserPresetService'

export function registerPresetIpc(getProjectRoot: () => string): void {
  ipcMain.handle(IPC.PRESET_SAVE, async (_event, preset: Preset) => {
    try {
      const svc = new UserPresetService(getProjectRoot())
      return svc.save(preset)
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(IPC.PRESET_DELETE, async (_event, id: string) => {
    try {
      const svc = new UserPresetService(getProjectRoot())
      return svc.remove(id)
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })
}
