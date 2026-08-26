import { ipcMain } from 'electron'
import { IPC } from '../../src/shared/types/ipc'
import { PluginService } from '../services/PluginService'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Rule } from '../../src/shared/types/rule'
import type { Preset } from '../../src/shared/types/preset'
import { getProjectService } from './index'

let pluginService: PluginService | null = null

const BUNDLED_RULES_PATH = join(__dirname, '../../src/shared/data/rules.json')
const BUNDLED_PRESETS_PATH = join(__dirname, '../../src/shared/data/presets.json')
const BUNDLED_PALETTES_PATH = join(__dirname, '../../src/shared/data/palettes.json')

function loadBundledRules(): Rule[] {
  try {
    return JSON.parse(readFileSync(BUNDLED_RULES_PATH, 'utf-8')) as Rule[]
  } catch {
    return []
  }
}

function loadBundledPresets(): Preset[] {
  try {
    return JSON.parse(readFileSync(BUNDLED_PRESETS_PATH, 'utf-8')) as Preset[]
  } catch {
    return []
  }
}

function loadBundledPalettes(): Record<string, { default: string; colors: string[] }> {
  try {
    return JSON.parse(readFileSync(BUNDLED_PALETTES_PATH, 'utf-8'))
  } catch {
    return {}
  }
}

export async function initializePluginService(projectRoot: string): Promise<void> {
  pluginService = new PluginService(projectRoot)
  const projectManifestPath = join(projectRoot, 'project.json')
  let enabledMap: Record<string, boolean> = {}
  try {
    const manifest = JSON.parse(readFileSync(projectManifestPath, 'utf-8'))
    enabledMap = manifest.plugins ?? {}
  } catch {
    // no plugins state
  }
  await pluginService.scanAll(enabledMap)
}

export function getPluginService(): PluginService {
  if (!pluginService) throw new Error('PluginService not initialized')
  return pluginService
}

export function registerPluginIpc(): void {
  ipcMain.handle(IPC.PLUGIN_LIST, async () => {
    const svc = getPluginService()
    return svc.getPlugins()
  })

  ipcMain.handle(IPC.PLUGIN_TOGGLE, async (_event, pluginId: string, enabled: boolean) => {
    try {
      const svc = getProjectService()
      const manifest = svc.getManifest()
      if (!manifest.plugins) {
        manifest.plugins = {}
      }
      manifest.plugins[pluginId] = enabled
      manifest.modified = new Date().toISOString()

      const manifestPath = join(svc.root, 'project.json')
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))

      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(IPC.DATA_GET_RULES, async () => {
    const bundled = loadBundledRules()
    const plugin = pluginService?.getPluginRules() ?? []
    return [...bundled, ...plugin]
  })

  ipcMain.handle(IPC.DATA_GET_PRESETS, async () => {
    const bundled = loadBundledPresets()
    const plugin = pluginService?.getPluginPresets() ?? []
    return [...bundled, ...plugin]
  })

  ipcMain.handle(IPC.DATA_GET_PALETTES, async () => {
    const bundled = loadBundledPalettes()
    const plugin = pluginService?.getPluginPalettes() ?? {}
    const merged: Record<string, { default: string; colors: string[] }> = { ...bundled }
    for (const [category, data] of Object.entries(plugin)) {
      if (merged[category]) {
        merged[category].colors.push(...data.colors)
      } else {
        merged[category] = { default: data.default, colors: [...data.colors] }
      }
    }
    return merged
  })
}
