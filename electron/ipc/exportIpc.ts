import { ipcMain } from 'electron'
import { IPC } from '../../src/shared/types/ipc'
import { ExportFileService } from '../services/ExportFileService'

export function registerExportIpc(): void {
  ipcMain.handle(
    IPC.EXPORT_EXECUTE,
    async (
      _event,
      params: {
        buffer: ArrayBuffer
        fileName: string
        profileName: string
        characterDna: string
      }
    ) => {
      return ExportFileService.execute(params)
    }
  )
}
