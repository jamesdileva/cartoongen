import { ipcMain } from 'electron'
import { IPC } from '../../src/shared/types/ipc'
import { SlotService } from '../services/SlotService'

export function registerSlotIpc(): void {
  ipcMain.handle(IPC.SLOT_LIST_ALL, async () => {
    return SlotService.getAll()
  })

  ipcMain.handle(IPC.SLOT_GET_BY_ID, async (_event, id: string) => {
    return SlotService.getById(id) ?? null
  })
}
