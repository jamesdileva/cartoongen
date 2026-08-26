import { ipcMain } from 'electron'
import { IPC } from '../../src/shared/types/ipc'
import { AssetRegistry } from '../services/AssetRegistry'
import type { AssetEntry, AssetQuery } from '../../src/shared/types/asset'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'

let registry: AssetRegistry | null = null

async function getRegistry(projectRoot: string): Promise<AssetRegistry> {
  if (!registry) {
    registry = await AssetRegistry.create(join(projectRoot, 'assets', 'index.json'))
  }
  return registry
}

export function registerAssetIpc(projectRoot: () => string): void {
  ipcMain.handle(IPC.ASSET_QUERY, async (_event, filters?: AssetQuery) => {
    try {
      const reg = await getRegistry(projectRoot())
      await reg.reload()
      return await reg.query(filters)
    } catch {
      return []
    }
  })

  ipcMain.handle(IPC.ASSET_REGISTER, async (_event, entry: AssetEntry) => {
    try {
      const reg = await getRegistry(projectRoot())
      await reg.register(entry)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(IPC.ASSET_UNREGISTER, async (_event, id: string) => {
    try {
      const reg = await getRegistry(projectRoot())
      await reg.unregister(id)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(IPC.ASSET_READ_FILE, async (_event, assetId: string) => {
    try {
      const root = projectRoot()
      const reg = await getRegistry(root)
      const entry = await reg.getById(assetId)
      if (!entry) return null
      const fullPath = join(root, entry.path)
      const buffer = await readFile(fullPath)
      return buffer.buffer as ArrayBuffer
    } catch {
      return null
    }
  })

  ipcMain.handle(IPC.ASSET_READ_THUMBNAIL, async (_event, assetId: string) => {
    try {
      const root = projectRoot()
      const reg = await getRegistry(root)
      const entry = await reg.getById(assetId)
      if (!entry?.previewPath) return null
      const fullPath = join(root, entry.previewPath)
      const buffer = await readFile(fullPath)
      return buffer.buffer as ArrayBuffer
    } catch {
      return null
    }
  })
}
