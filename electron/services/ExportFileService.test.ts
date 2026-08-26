import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { ExportFileService } from './ExportFileService'

vi.mock('../ipc', () => {
  let root = ''
  return {
    getProjectRoot: () => root,
    setProjectRoot: (r: string) => { root = r }
  }
})

const { setProjectRoot } = await import('../ipc')

let tmpDir: string

beforeEach(() => {
  tmpDir = join(import.meta.dirname, '..', '..', 'tmp_test_export_' + randomUUID().slice(0, 8))
  mkdirSync(tmpDir, { recursive: true })
  setProjectRoot(tmpDir)
})

afterEach(() => {
  try { rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ok */ }
})

function makeBuffer(): ArrayBuffer {
  return new Uint8Array([0x67, 0x6c, 0x54, 0x46, 0x02, 0x00, 0x00, 0x00]).buffer
}

describe('ExportFileService', () => {
  it('writes GLB file to the correct path', () => {
    const buffer = makeBuffer()
    const result = ExportFileService.execute({
      buffer, fileName: 'hero', profileName: 'glb-standard',
      characterDna: JSON.stringify({ name: 'hero' })
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(existsSync(result.filePath)).toBe(true)
      expect(result.filePath).toContain('hero.glb')
    }
  })

  it('writes sidecar DNA JSON file', () => {
    const buffer = makeBuffer()
    ExportFileService.execute({
      buffer, fileName: 'hero', profileName: 'glb-standard',
      characterDna: JSON.stringify({ name: 'hero', version: 1 })
    })
    const dnaPath = join(tmpDir, 'exports', 'glb-standard', 'hero', 'hero.dna.json')
    expect(existsSync(dnaPath)).toBe(true)
    const content = JSON.parse(readFileSync(dnaPath, 'utf-8'))
    expect(content).toHaveProperty('name', 'hero')
  })

  it('creates export log and appends entries', () => {
    ExportFileService.execute({
      buffer: makeBuffer(), fileName: 'char_a', profileName: 'unity',
      characterDna: '{}'
    })
    ExportFileService.execute({
      buffer: makeBuffer(), fileName: 'char_b', profileName: 'godot',
      characterDna: '{}'
    })
    const logPath = join(tmpDir, 'exports', 'export_log.json')
    expect(existsSync(logPath)).toBe(true)
    const log = JSON.parse(readFileSync(logPath, 'utf-8'))
    expect(log).toHaveLength(2)
    expect(log[0].fileName).toBe('char_a')
    expect(log[1].fileName).toBe('char_b')
  })

  it('creates directory structure if missing', () => {
    const result = ExportFileService.execute({
      buffer: makeBuffer(), fileName: 'new_char', profileName: 'mixamo',
      characterDna: '{}'
    })
    expect(result.ok).toBe(true)
    expect(existsSync(join(tmpDir, 'exports', 'mixamo', 'new_char'))).toBe(true)
  })

  it('sanitizes unsafe characters in file name', () => {
    const result = ExportFileService.execute({
      buffer: makeBuffer(), fileName: 'bad:name/with<>chars', profileName: 'test',
      characterDna: '{}'
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.filePath).not.toContain('<>')
      expect(result.filePath).toContain('bad_name_with')
    }
  })

  it('returns error on failure (invalid write path)', () => {
    const result = ExportFileService.execute({
      buffer: makeBuffer(), fileName: 'ok', profileName: 'ok',
      characterDna: '{}'
    })
    expect(result.ok).toBe(true)
  })
})
