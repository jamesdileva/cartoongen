import { dialog } from 'electron'
import { readFile, copyFile, mkdir } from 'node:fs/promises'
import { join, extname, basename } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { ImportFileResult } from '../../src/shared/types/ipc'

const FILTERS: Electron.FileFilter[] = [{ name: 'GLB Files', extensions: ['glb'] }]

function validateGLBHeader(buffer: ArrayBuffer): { valid: boolean; version: number | null } {
  const view = new DataView(buffer)
  if (buffer.byteLength < 12) return { valid: false, version: null }

  const magic = view.getUint32(0, true)
  const version = view.getUint32(4, true)
  const glbMagic = 0x46546c67

  return { valid: magic === glbMagic && version >= 2, version: version >= 2 ? version : null }
}

export class FileImportService {
  constructor(private projectRoot: string) {}

  async pickFile(): Promise<ImportFileResult | null> {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: FILTERS,
      title: 'Import Asset'
    })

    if (result.canceled || result.filePaths.length === 0) return null

    const srcPath = result.filePaths[0]
    return this.importFile(srcPath)
  }

  async importFile(srcPath: string): Promise<ImportFileResult> {
    const assetId = randomUUID()
    const ext = extname(srcPath)
    const fileName = basename(srcPath)
    const destDir = join(this.projectRoot, 'assets', 'meshes')
    const destPath = join(destDir, `${assetId}${ext}`)

    await mkdir(destDir, { recursive: true })
    await copyFile(srcPath, destPath)

    const buffer = await readFile(destPath).then((b) => b.buffer as ArrayBuffer)
    const isGLTF = ext.toLowerCase() === '.gltf'
    const { valid, version } = isGLTF ? { valid: true, version: 2 } : validateGLBHeader(buffer)

    return {
      buffer,
      filePath: destPath,
      assetId,
      fileName,
      formatValid: valid,
      formatVersion: version
    }
  }
}
