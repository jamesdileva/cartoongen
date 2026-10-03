import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Preset } from '../../src/shared/types/preset'

/**
 * Per-project user-saved presets (`{project}/presets/user.json`).
 * Stateless filesystem wrapper; merged into data:getPresets alongside
 * bundled + plugin presets. Entries carry `custom: true` so the UI can
 * offer delete affordances on user presets only.
 */
export class UserPresetService {
  constructor(private readonly projectRoot: string) {}

  private get filePath(): string {
    return join(this.projectRoot, 'presets', 'user.json')
  }

  load(): Preset[] {
    try {
      if (!existsSync(this.filePath)) return []
      const raw = JSON.parse(readFileSync(this.filePath, 'utf-8'))
      if (!Array.isArray(raw)) return []
      return raw.filter((p) => p && typeof p.id === 'string')
    } catch {
      return []
    }
  }

  save(preset: Preset): { ok: true } | { ok: false; error: string } {
    try {
      if (!preset || typeof preset.id !== 'string' || preset.id.length === 0) {
        return { ok: false, error: 'Preset needs an id' }
      }
      const dir = join(this.projectRoot, 'presets')
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      const all = this.load().filter((p) => p.id !== preset.id)
      all.push({ ...preset, custom: true })
      writeFileSync(this.filePath, JSON.stringify(all, null, 2))
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  }

  remove(id: string): { ok: true } | { ok: false; error: string } {
    try {
      const dir = join(this.projectRoot, 'presets')
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      const kept = this.load().filter((p) => p.id !== id)
      writeFileSync(this.filePath, JSON.stringify(kept, null, 2))
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  }
}
