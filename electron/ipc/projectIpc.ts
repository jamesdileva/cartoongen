import { ipcMain } from 'electron'
import { IPC } from '../../src/shared/types/ipc'
import { ProjectService } from '../services/ProjectService'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export function registerProjectIpc(getService: () => ProjectService): void {
  ipcMain.handle(IPC.PROJECT_CREATE, async (_event, root: string, name: string) => {
    try {
      await ProjectService.create(root, name)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(IPC.PROJECT_OPEN, async (_event, root: string) => {
    try {
      const svc = await ProjectService.open(root)
      const m = svc.getManifest()
      return { ok: true, projectName: m.name, favorites: m.favorites ?? [] }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(IPC.PROJECT_LIST_CHARACTERS, async () => {
    try {
      const names = await getService().listCharacterNames()
      return names
    } catch {
      return []
    }
  })

  ipcMain.handle(IPC.PROJECT_LIST_ASSETS, async () => {
    try {
      return await getService().listAssets()
    } catch {
      return []
    }
  })

  ipcMain.handle(IPC.PROJECT_GET_FAVORITES, async () => {
    try {
      const m = getService().getManifest()
      return m.favorites ?? []
    } catch {
      return []
    }
  })

  ipcMain.handle(IPC.PROJECT_SET_FAVORITES, async (_event, favorites: string[]) => {
    try {
      const svc = getService()
      const m = svc.getManifest()
      m.favorites = favorites
      m.modified = new Date().toISOString()
      const manifestPath = join(svc.root, 'project.json')
      await writeFile(manifestPath, JSON.stringify(m, null, 2))
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })
}
