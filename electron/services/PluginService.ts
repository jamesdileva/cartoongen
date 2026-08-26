import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { PluginManifest, PluginState } from '../../src/shared/types/plugin'
import type { Rule } from '../../src/shared/types/rule'
import type { Preset } from '../../src/shared/types/preset'
import { PluginValidator } from './PluginValidator'

export class PluginService {
  private plugins: PluginState[] = []
  private pluginRules: Rule[] = []
  private pluginPresets: Preset[] = []
  private pluginPalettes: Record<string, { default: string; colors: string[] }> = {}

  constructor(private projectRoot: string) {}

  async scanAll(enabledMap: Record<string, boolean>): Promise<PluginState[]> {
    this.plugins = []
    this.pluginRules = []
    this.pluginPresets = []
    this.pluginPalettes = {}

    const pluginsDir = join(this.projectRoot, 'plugins')
    if (!existsSync(pluginsDir)) {
      return []
    }

    const entries = readdirSync(pluginsDir, { withFileTypes: true })
    const dirs = entries.filter((e) => e.isDirectory())

    for (const dir of dirs) {
      const pluginDir = join(pluginsDir, dir.name)
      const manifestPath = join(pluginDir, 'plugin.json')

      if (!existsSync(manifestPath)) {
        this.plugins.push({
          id: dir.name,
          name: dir.name,
          version: '0.0.0',
          author: 'unknown',
          description: 'Missing plugin.json',
          enabled: false,
          status: 'error',
          error: 'plugin.json not found',
          dir: pluginDir
        })
        continue
      }

      let manifest: PluginManifest
      try {
        const raw = readFileSync(manifestPath, 'utf-8')
        manifest = JSON.parse(raw) as PluginManifest
      } catch {
        this.plugins.push({
          id: dir.name,
          name: dir.name,
          version: '0.0.0',
          author: 'unknown',
          description: 'Invalid plugin.json',
          enabled: false,
          status: 'error',
          error: 'Failed to parse plugin.json',
          dir: pluginDir
        })
        continue
      }

      const validation = PluginValidator.validateManifest(manifest, pluginDir)
      if (!validation.valid) {
        this.plugins.push({
          id: manifest.id,
          name: manifest.name,
          version: manifest.version,
          author: manifest.author,
          description: manifest.description,
          enabled: false,
          status: 'incompatible',
          error: validation.errors.join('; '),
          dir: pluginDir
        })
        continue
      }

      const enabled = enabledMap[manifest.id] !== false

      const state: PluginState = {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        author: manifest.author,
        description: manifest.description,
        enabled,
        status: 'loaded',
        dir: pluginDir
      }

      if (enabled) {
        await this.loadPluginData(pluginDir, manifest.id)
      }

      this.plugins.push(state)
    }

    return this.plugins
  }

  private async loadPluginData(pluginDir: string, _pluginId: string): Promise<void> {
    const assetsIndexPath = join(pluginDir, 'assets', 'index.json')
    if (existsSync(assetsIndexPath)) {
      try {
        const raw = readFileSync(assetsIndexPath, 'utf-8')
        const entries = JSON.parse(raw)
        if (Array.isArray(entries)) {
          const { getProjectService } = await import('../ipc')
          const svc = getProjectService()
          for (const entry of entries) {
            const meshPath = join(pluginDir, 'assets', 'meshes', `${entry.id}.glb`)
            if (!existsSync(meshPath)) {
              continue
            }
            await svc.getAssetRegistry().register({
              id: entry.id,
              slotId: entry.slotId,
              tags: entry.tags ?? [],
              path: meshPath,
              version: entry.version ?? 1,
              created: new Date().toISOString()
            })
          }
        }
      } catch {
        // skip plugin asset loading errors gracefully
      }
    }

    const rulesPath = join(pluginDir, 'rules.json')
    if (existsSync(rulesPath)) {
      try {
        const raw = readFileSync(rulesPath, 'utf-8')
        const rules = JSON.parse(raw)
        if (Array.isArray(rules)) {
          this.pluginRules.push(...rules)
        }
      } catch {
        // skip
      }
    }

    const presetsPath = join(pluginDir, 'presets.json')
    if (existsSync(presetsPath)) {
      try {
        const raw = readFileSync(presetsPath, 'utf-8')
        const presets = JSON.parse(raw)
        if (Array.isArray(presets)) {
          this.pluginPresets.push(...presets)
        }
      } catch {
        // skip
      }
    }

    const palettesPath = join(pluginDir, 'palettes.json')
    if (existsSync(palettesPath)) {
      try {
        const raw = readFileSync(palettesPath, 'utf-8')
        const palettes = JSON.parse(raw)
        if (typeof palettes === 'object' && !Array.isArray(palettes)) {
          for (const [category, data] of Object.entries(palettes)) {
            const typed = data as { default: string; colors: string[] }
            if (!this.pluginPalettes[category]) {
              this.pluginPalettes[category] = { default: typed.default, colors: [] }
            }
            this.pluginPalettes[category].colors.push(...typed.colors)
          }
        }
      } catch {
        // skip
      }
    }
  }

  async getPlugins(): Promise<PluginState[]> {
    return this.plugins
  }

  getPluginRules(): Rule[] {
    return this.pluginRules
  }

  getPluginPresets(): Preset[] {
    return this.pluginPresets
  }

  getPluginPalettes(): Record<string, { default: string; colors: string[] }> {
    return this.pluginPalettes
  }

  getPluginDir(pluginId: string): string | undefined {
    return this.plugins.find((p) => p.id === pluginId)?.dir
  }
}
