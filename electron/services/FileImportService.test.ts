import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { FileImportService } from './FileImportService'

let tmpDir: string
let srcDir: string

beforeEach(() => {
  const id = randomUUID().slice(0, 8)
  tmpDir = join(import.meta.dirname, '..', '..', 'tmp_test_import_' + id)
  srcDir = join(import.meta.dirname, '..', '..', 'tmp_test_src_' + id)
  mkdirSync(tmpDir, { recursive: true })
  mkdirSync(srcDir, { recursive: true })
})

afterEach(() => {
  try { rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ok */ }
  try { rmSync(srcDir, { recursive: true, force: true }) } catch { /* ok */ }
})

function writeGLB(path: string): void {
  const buffer = new Uint8Array(12)
  const view = new DataView(buffer.buffer)
  view.setUint32(0, 0x46546c67, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, 12, true)
  writeFileSync(path, Buffer.from(buffer))
}

function writeInvalidGLB(path: string): void {
  const buffer = new Uint8Array(12)
  const view = new DataView(buffer.buffer)
  view.setUint32(0, 0xdeadbeef, true)
  view.setUint32(4, 1, true)
  writeFileSync(path, Buffer.from(buffer))
}

describe('FileImportService', () => {
  it('copies file to project assets and returns metadata', async () => {
    const srcPath = join(srcDir, 'test_asset.glb')
    writeGLB(srcPath)
    const svc = new FileImportService(tmpDir)
    const result = await svc.importFile(srcPath)
    expect(result.fileName).toBe('test_asset.glb')
    expect(result.formatValid).toBe(true)
    expect(result.formatVersion).toBe(2)
    expect(result.filePath).toContain(tmpDir)
    expect(existsSync(result.filePath)).toBe(true)
  })

  it('sets formatValid false for invalid GLB header', async () => {
    const srcPath = join(srcDir, 'bad_asset.glb')
    writeInvalidGLB(srcPath)
    const svc = new FileImportService(tmpDir)
    const result = await svc.importFile(srcPath)
    expect(result.formatValid).toBe(false)
    expect(result.formatVersion).toBeNull()
  })

  it('uses correct file extension', async () => {
    const srcPath = join(srcDir, 'model.gltf')
    writeGLB(srcPath)
    const svc = new FileImportService(tmpDir)
    const result = await svc.importFile(srcPath)
    expect(result.filePath.endsWith('.gltf')).toBe(true)
  })
})
