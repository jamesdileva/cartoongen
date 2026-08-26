import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { WorkspaceService } from './WorkspaceService'

let tmpDir: string

beforeEach(() => {
  tmpDir = join(import.meta.dirname, '..', '..', 'tmp_test_ws_' + randomUUID().slice(0, 8))
  mkdirSync(tmpDir, { recursive: true })
})

afterEach(() => {
  try { rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ok */ }
})

describe('WorkspaceService', () => {
  it('saves and loads state with round-trip equality', () => {
    const state = { lastCharacterName: 'Hero', bgIndex: 2 }
    const saved = WorkspaceService.save(tmpDir, state)
    expect(saved).toBe(true)
    const loaded = WorkspaceService.load(tmpDir)
    expect(loaded).toEqual(state)
  })

  it('load returns null for missing file', () => {
    const result = WorkspaceService.load(tmpDir)
    expect(result).toBeNull()
  })

  it('load returns null for corrupted JSON', () => {
    writeFileSync(join(tmpDir, 'app-state.json'), 'not valid json{{{', 'utf-8')
    const result = WorkspaceService.load(tmpDir)
    expect(result).toBeNull()
  })

  it('save returns false on failure', () => {
    const result = WorkspaceService.save(
      join(tmpDir, 'nonexistent_subdir_that_cannot_exist_ever_12345'),
      { lastCharacterName: null, bgIndex: 0 }
    )
    expect(result).toBe(false)
  })
})
