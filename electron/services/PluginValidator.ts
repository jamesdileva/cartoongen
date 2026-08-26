import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PluginValidationResult } from '../../src/shared/types/plugin'

const APP_VERSION = '0.1.0'

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0
    const nb = pb[i] ?? 0
    if (na > nb) return 1
    if (na < nb) return -1
  }
  return 0
}

export class PluginValidator {
  static validateManifest(manifest: unknown, pluginDir: string): PluginValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    if (!manifest || typeof manifest !== 'object') {
      errors.push('plugin.json is not a valid object')
      return { valid: false, errors, warnings }
    }

    const m = manifest as Record<string, unknown>

    if (!m.id || typeof m.id !== 'string') {
      errors.push('plugin.json missing required field: id (string)')
    }
    if (!m.name || typeof m.name !== 'string') {
      errors.push('plugin.json missing required field: name (string)')
    }
    if (!m.version || typeof m.version !== 'string') {
      errors.push('plugin.json missing required field: version (string)')
    } else if (!/^\d+\.\d+\.\d+$/.test(m.version as string)) {
      errors.push('plugin.json version must be semver (e.g. 1.0.0)')
    }
    if (!m.author || typeof m.author !== 'string') {
      errors.push('plugin.json missing required field: author (string)')
    }
    if (!m.description || typeof m.description !== 'string') {
      errors.push('plugin.json missing required field: description (string)')
    }

    if (m.minAppVersion && typeof m.minAppVersion === 'string') {
      if (compareVersions(APP_VERSION, m.minAppVersion) < 0) {
        errors.push(
          `Plugin requires app version ${m.minAppVersion} but current version is ${APP_VERSION}`
        )
      }
    }

    if (errors.length > 0) {
      return { valid: false, errors, warnings }
    }

    const assetsDir = join(pluginDir, 'assets')
    if (existsSync(join(pluginDir, 'assets'))) {
      if (!existsSync(join(assetsDir, 'index.json'))) {
        warnings.push('assets/ directory exists but no assets/index.json found')
      }
    }

    if (existsSync(join(pluginDir, 'rules.json'))) {
      try {
        const raw = readFileSync(join(pluginDir, 'rules.json'), 'utf-8')
        const rules = JSON.parse(raw)
        if (!Array.isArray(rules)) {
          warnings.push('rules.json should be an array')
        }
      } catch {
        warnings.push('rules.json is not valid JSON')
      }
    }

    if (existsSync(join(pluginDir, 'presets.json'))) {
      try {
        const raw = readFileSync(join(pluginDir, 'presets.json'), 'utf-8')
        const presets = JSON.parse(raw)
        if (!Array.isArray(presets)) {
          warnings.push('presets.json should be an array')
        }
      } catch {
        warnings.push('presets.json is not valid JSON')
      }
    }

    if (existsSync(join(pluginDir, 'palettes.json'))) {
      try {
        const raw = readFileSync(join(pluginDir, 'palettes.json'), 'utf-8')
        const palettes = JSON.parse(raw)
        if (typeof palettes !== 'object' || Array.isArray(palettes)) {
          warnings.push('palettes.json should be an object (category -> { default, colors })')
        }
      } catch {
        warnings.push('palettes.json is not valid JSON')
      }
    }

    return { valid: true, errors, warnings }
  }
}
