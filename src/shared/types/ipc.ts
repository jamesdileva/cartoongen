import type { CharacterDNA } from './dna'
import type { AssetEntry, AssetQuery } from './asset'
import type { SlotDefinition } from './slot'
import type { Rule } from './rule'

export const IPC = {
  PROJECT_CREATE: 'project:create',
  PROJECT_OPEN: 'project:open',
  PROJECT_LIST_CHARACTERS: 'project:listCharacters',
  PROJECT_LIST_ASSETS: 'project:listAssets',
  CHARACTER_SAVE: 'character:save',
  CHARACTER_LOAD: 'character:load',
  CHARACTER_DELETE: 'character:delete',
  CHARACTER_LIST: 'character:list',
  ASSET_QUERY: 'asset:query',
  ASSET_REGISTER: 'asset:register',
  ASSET_UNREGISTER: 'asset:unregister',
  ASSET_READ_FILE: 'asset:readFile',
  ASSET_READ_THUMBNAIL: 'asset:readThumbnail',
  SLOT_LIST_ALL: 'slot:listAll',
  SLOT_GET_BY_ID: 'slot:getById',
  RULE_LIST_ALL: 'rule:listAll',
  IMPORT_PICK_FILE: 'import:pickFile',
  IMPORT_DROP_FILE: 'import:dropFile',
  IMPORT_CONFIRM: 'import:confirm',
  EXPORT_EXECUTE: 'export:execute',
  CHARACTER_SAVE_THUMBNAIL: 'character:saveThumbnail',
  CHARACTER_READ_THUMBNAIL: 'character:readThumbnail',
  PROJECT_GET_FAVORITES: 'project:getFavorites',
  PROJECT_SET_FAVORITES: 'project:setFavorites',
  WORKSPACE_LOAD: 'workspace:load',
  WORKSPACE_SAVE: 'workspace:save',
  PLUGIN_LIST: 'plugin:list',
  PLUGIN_TOGGLE: 'plugin:toggle',
  DATA_GET_RULES: 'data:getRules',
  DATA_GET_PRESETS: 'data:getPresets',
  DATA_GET_PALETTES: 'data:getPalettes'
} as const

export interface ImportFileResult {
  buffer: ArrayBuffer
  filePath: string
  assetId: string
  fileName: string
  formatValid: boolean
  formatVersion: number | null
}

export interface ImportDropFileParams {
  buffer: ArrayBuffer
  fileName: string
}

export interface ImportConfirmParams {
  assetId: string
  slotId: string
  tags: string[]
  version: number
  thumbnailDataUrl: string | null
  extension: string
  fileBuffer?: ArrayBuffer
}

export interface IpcProjectApi {
  create(root: string, name: string): Promise<{ ok: true } | { ok: false; error: string }>
  open(root: string): Promise<{ ok: true; projectName: string } | { ok: false; error: string }>
  listCharacters(): Promise<string[]>
  listAssets(): Promise<AssetEntry[]>
}

export interface IpcCharacterApi {
  save(dna: CharacterDNA): Promise<{ ok: true } | { ok: false; error: string }>
  load(name: string): Promise<{ ok: true; dna: CharacterDNA } | { ok: false; error: string }>
  delete(name: string): Promise<{ ok: true } | { ok: false; error: string }>
  list(): Promise<string[]>
}

export interface IpcAssetApi {
  query(filters?: AssetQuery): Promise<AssetEntry[]>
  register(entry: AssetEntry): Promise<{ ok: true } | { ok: false; error: string }>
  unregister(id: string): Promise<{ ok: true } | { ok: false; error: string }>
  readFile(assetId: string): Promise<ArrayBuffer | null>
  readThumbnail(assetId: string): Promise<ArrayBuffer | null>
}

export interface IpcSlotApi {
  listAll(): Promise<SlotDefinition[]>
  getById(id: string): Promise<SlotDefinition | undefined>
}

export interface IpcRuleApi {
  listAll(): Promise<Rule[]>
}
