import { ipcMain } from 'electron'
import { IPC } from '../../src/shared/types/ipc'
import type { ImportConfirmParams } from '../../src/shared/types/ipc'
import type { AssetEntry } from '../../src/shared/types/asset'
import { FileImportService } from '../services/FileImportService'
import { AssetRegistry } from '../services/AssetRegistry'
import { join } from 'node:path'
import { writeFile, mkdir } from 'node:fs/promises'

let importService: FileImportService | null = null
let registry: AssetRegistry | null = null

async function getImportService(projectRoot: string): Promise<FileImportService> {
  if (!importService) {
    importService = new FileImportService(projectRoot)
  }
  return importService
}

async function getRegistry(projectRoot: string): Promise<AssetRegistry> {
  if (!registry) {
    registry = await AssetRegistry.create(join(projectRoot, 'assets', 'index.json'))
  }
  return registry
}

function base64ToBuffer(dataUrl: string): Buffer {
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '')
  return Buffer.from(base64, 'base64')
}

export function registerImportIpc(projectRoot: () => string): void {
  ipcMain.handle(IPC.IMPORT_PICK_FILE, async () => {
    try {
      const svc = await getImportService(projectRoot())
      return await svc.pickFile()
    } catch {
      return null
    }
  })

  ipcMain.handle(IPC.IMPORT_CONFIRM, async (_event, params: ImportConfirmParams) => {
    try {
      const root = projectRoot()
      const reg = await getRegistry(root)
      const now = new Date().toISOString()

      const thumbnailDir = join(root, 'assets', 'thumbnails')
      await mkdir(thumbnailDir, { recursive: true })

      let previewPath: string | undefined
      if (params.thumbnailDataUrl) {
        previewPath = join('assets', 'thumbnails', `${params.assetId}.png`)
        const pngPath = join(root, previewPath)
        const pngBuffer = base64ToBuffer(params.thumbnailDataUrl)
        await writeFile(pngPath, pngBuffer)
      }

      const ext = params.extension || '.glb'

      if (params.fileBuffer) {
        const meshDir = join(root, 'assets', 'meshes')
        await mkdir(meshDir, { recursive: true })
        const meshPath = join(meshDir, `${params.assetId}${ext}`)
        await writeFile(meshPath, Buffer.from(params.fileBuffer))
      }

      const entry: AssetEntry = {
        id: params.assetId,
        slotId: params.slotId,
        path: join('assets', 'meshes', `${params.assetId}${ext}`),
        tags: params.tags,
        previewPath,
        version: params.version,
        created: now
      }

      await reg.register(entry)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })
}
