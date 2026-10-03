import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { UserPresetService } from './UserPresetService'
import type { Preset } from '../../src/shared/types/preset'

let dir: string
let svc: UserPresetService

const preset: Preset = {
  id: 'user-abc',
  name: 'My Look',
  description: 'Saved look',
  icon: '⭐',
  slots: { shirt: 'proc:jacket' },
  colors: { cloth: '#ff0000' }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'user-preset-test-'))
  svc = new UserPresetService(dir)
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('UserPresetService', () => {
  it('loads empty when no file exists', () => {
    expect(svc.load()).toEqual([])
  })

  it('saves and loads a round trip', () => {
    expect(svc.save(preset)).toEqual({ ok: true })
    const loaded = svc.load()
    expect(loaded).toHaveLength(1)
    expect(loaded[0]).toMatchObject({ id: 'user-abc', custom: true })
  })

  it('replaces a preset with the same id', () => {
    svc.save(preset)
    svc.save({ ...preset, name: 'Renamed' })
    const loaded = svc.load()
    expect(loaded).toHaveLength(1)
    expect(loaded[0].name).toBe('Renamed')
  })

  it('removes by id and tolerates unknown ids', () => {
    svc.save(preset)
    expect(svc.remove('user-abc')).toEqual({ ok: true })
    expect(svc.load()).toEqual([])
    expect(svc.remove('nope')).toEqual({ ok: true })
  })

  it('rejects presets without an id', () => {
    const bad = { ...preset, id: '' }
    expect(svc.save(bad).ok).toBe(false)
    expect(svc.load()).toEqual([])
  })

  it('returns empty on corrupt JSON', () => {
    mkdirSync(join(dir, 'presets'), { recursive: true })
    writeFileSync(join(dir, 'presets', 'user.json'), '{broken')
    expect(svc.load()).toEqual([])
  })
})
