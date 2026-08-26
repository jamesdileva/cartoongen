import type { CharacterDNA } from '../../shared/types/dna'
import type { AssetEntry, AssetQuery } from '../../shared/types/asset'
import type { SlotDefinition } from '../../shared/types/slot'
import type { Rule } from '../../shared/types/rule'
import type { Preset } from '../../shared/types/preset'
import type { PluginState } from '../../shared/types/plugin'
import type { ImportFileResult, ImportConfirmParams } from '../../shared/types/ipc'

interface ElectronAPI {
  platform: string
  versions: {
    electron: string
    node: string
    chrome: string
  }
  project: {
    create(root: string, name: string): Promise<{ ok: true } | { ok: false; error: string }>
    open(
      root: string
    ): Promise<
      { ok: true; projectName: string; favorites: string[] } | { ok: false; error: string }
    >
    listCharacters(): Promise<string[]>
    listAssets(): Promise<AssetEntry[]>
    getFavorites(): Promise<string[]>
    setFavorites(favorites: string[]): Promise<{ ok: true } | { ok: false; error: string }>
  }
  character: {
    save(dna: CharacterDNA): Promise<{ ok: true } | { ok: false; error: string }>
    load(name: string): Promise<{ ok: true; dna: CharacterDNA } | { ok: false; error: string }>
    delete(name: string): Promise<{ ok: true } | { ok: false; error: string }>
    list(): Promise<string[]>
    saveThumbnail(
      name: string,
      buffer: ArrayBuffer
    ): Promise<{ ok: true } | { ok: false; error: string }>
    readThumbnail(name: string): Promise<ArrayBuffer | null>
  }
  asset: {
    query(filters?: AssetQuery): Promise<AssetEntry[]>
    register(entry: AssetEntry): Promise<{ ok: true } | { ok: false; error: string }>
    unregister(id: string): Promise<{ ok: true } | { ok: false; error: string }>
    readFile(assetId: string): Promise<ArrayBuffer | null>
    readThumbnail(assetId: string): Promise<ArrayBuffer | null>
  }
  slot: {
    listAll(): Promise<SlotDefinition[]>
    getById(id: string): Promise<SlotDefinition | undefined>
  }
  rule: {
    listAll(): Promise<Rule[]>
  }
  import: {
    pickFile(): Promise<ImportFileResult | null>
    confirm(params: ImportConfirmParams): Promise<{ ok: true } | { ok: false; error: string }>
  }
  export: {
    execute(params: {
      buffer: ArrayBuffer
      fileName: string
      profileName: string
      characterDna: string
    }): Promise<{ ok: true; filePath: string } | { ok: false; error: string }>
  }
  workspace: {
    load(): Promise<{ lastCharacterName: string | null; bgIndex: number } | null>
    save(state: { lastCharacterName: string | null; bgIndex: number }): Promise<boolean>
  }
  plugin: {
    list(): Promise<PluginState[]>
    toggle(pluginId: string, enabled: boolean): Promise<{ ok: true } | { ok: false; error: string }>
  }
  data: {
    getRules(): Promise<Rule[]>
    getPresets(): Promise<Preset[]>
    getPalettes(): Promise<Record<string, { default: string; colors: string[] }>>
  }
}

interface Window {
  electronAPI: ElectronAPI
}
