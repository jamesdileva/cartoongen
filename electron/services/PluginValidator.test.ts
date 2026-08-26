import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { PluginValidator } from './PluginValidator'

let tmpDir: string

beforeEach(() => {
  tmpDir = join(import.meta.dirname, '..', '..', 'tmp_test_plugin_' + randomUUID().slice(0, 8))
  mkdirSync(tmpDir, { recursive: true })
})

afterEach(() => {
  try { rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ok */ }
})

const validManifest = {
  id: 'test-pack',
  name: 'Test Asset Pack',
  version: '1.0.0',
  author: 'Test Author',
  description: 'A test plugin for testing',
  minAppVersion: '0.1.0'
}

describe('PluginValidator', () => {
  it('validates a correct manifest', () => {
    const result = PluginValidator.validateManifest(validManifest, tmpDir)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('rejects null manifest', () => {
    const result = PluginValidator.validateManifest(null, tmpDir)
    expect(result.valid).toBe(false)
  })

  it('rejects non-object manifest', () => {
    const result = PluginValidator.validateManifest('not-an-object', tmpDir)
    expect(result.valid).toBe(false)
  })

  it('rejects missing required fields', () => {
    const result = PluginValidator.validateManifest({ id: 'test' }, tmpDir)
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThanOrEqual(4)
  })

  it('rejects non-semver version', () => {
    const result = PluginValidator.validateManifest(
      { ...validManifest, version: 'abc' },
      tmpDir
    )
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('semver'))).toBe(true)
  })

  it('rejects incompatible minAppVersion', () => {
    const result = PluginValidator.validateManifest(
      { ...validManifest, minAppVersion: '99.0.0' },
      tmpDir
    )
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('requires app version'))).toBe(true)
  })

  it('allows missing minAppVersion', () => {
    const { minAppVersion: _, ...noMinVersion } = validManifest
    const result = PluginValidator.validateManifest(noMinVersion, tmpDir)
    expect(result.valid).toBe(true)
  })

  it('warns about invalid rules.json', () => {
    writeFileSync(join(tmpDir, 'rules.json'), 'not valid json', 'utf-8')
    const result = PluginValidator.validateManifest(validManifest, tmpDir)
    expect(result.warnings.some((w) => w.includes('rules.json'))).toBe(true)
  })

  it('warns about invalid presets.json', () => {
    writeFileSync(join(tmpDir, 'presets.json'), '[not valid]', 'utf-8')
    const result = PluginValidator.validateManifest(validManifest, tmpDir)
    expect(result.warnings.some((w) => w.includes('presets.json'))).toBe(true)
  })

  it('warns about assets dir without index.json', () => {
    mkdirSync(join(tmpDir, 'assets'))
    const result = PluginValidator.validateManifest(validManifest, tmpDir)
    expect(result.warnings.some((w) => w.includes('assets/index.json'))).toBe(true)
  })
})
