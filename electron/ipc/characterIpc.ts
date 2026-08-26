import { ipcMain } from 'electron'
import { IPC } from '../../src/shared/types/ipc'
import { CharacterService } from '../services/CharacterService'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

export function registerCharacterIpc(projectRoot: () => string): void {
  const getService = () => new CharacterService(projectRoot())

  ipcMain.handle(IPC.CHARACTER_SAVE, async (_event, dna) => {
    try {
      await getService().save(dna)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(IPC.CHARACTER_LOAD, async (_event, name: string) => {
    try {
      const dna = await getService().load(name)
      return { ok: true, dna }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(IPC.CHARACTER_DELETE, async (_event, name: string) => {
    try {
      await getService().delete(name)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(IPC.CHARACTER_LIST, async () => {
    try {
      return await getService().listNames()
    } catch {
      return []
    }
  })

  ipcMain.handle(
    IPC.CHARACTER_SAVE_THUMBNAIL,
    async (_event, name: string, buffer: ArrayBuffer) => {
      try {
        const root = projectRoot()
        const dir = join(root, 'thumbnails', 'characters')
        await mkdir(dir, { recursive: true })
        const filePath = join(dir, `${name.replace(/[<>:"/\\|?*]/g, '_')}.png`)
        await writeFile(filePath, Buffer.from(buffer))
        return { ok: true }
      } catch (err) {
        return { ok: false, error: (err as Error).message }
      }
    }
  )

  ipcMain.handle(IPC.CHARACTER_READ_THUMBNAIL, async (_event, name: string) => {
    try {
      const root = projectRoot()
      const filePath = join(
        root,
        'thumbnails',
        'characters',
        `${name.replace(/[<>:"/\\|?*]/g, '_')}.png`
      )
      const buffer = await readFile(filePath)
      return buffer.buffer as ArrayBuffer
    } catch {
      return null
    }
  })
}
