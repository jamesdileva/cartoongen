import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../src/shared/types/ipc'
import type { CharacterDNA } from '../src/shared/types/dna'
import type { AssetEntry, AssetQuery } from '../src/shared/types/asset'

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome
  },
  project: {
    create: (root: string, name: string) => ipcRenderer.invoke(IPC.PROJECT_CREATE, root, name),
    open: (root: string) => ipcRenderer.invoke(IPC.PROJECT_OPEN, root),
    listCharacters: () => ipcRenderer.invoke(IPC.PROJECT_LIST_CHARACTERS),
    listAssets: () => ipcRenderer.invoke(IPC.PROJECT_LIST_ASSETS),
    getFavorites: () => ipcRenderer.invoke(IPC.PROJECT_GET_FAVORITES),
    setFavorites: (favorites: string[]) => ipcRenderer.invoke(IPC.PROJECT_SET_FAVORITES, favorites)
  },
  character: {
    save: (dna: CharacterDNA) => ipcRenderer.invoke(IPC.CHARACTER_SAVE, dna),
    load: (name: string) => ipcRenderer.invoke(IPC.CHARACTER_LOAD, name),
    delete: (name: string) => ipcRenderer.invoke(IPC.CHARACTER_DELETE, name),
    list: () => ipcRenderer.invoke(IPC.CHARACTER_LIST),
    saveThumbnail: (name: string, buffer: ArrayBuffer) =>
      ipcRenderer.invoke(IPC.CHARACTER_SAVE_THUMBNAIL, name, buffer),
    readThumbnail: (name: string) => ipcRenderer.invoke(IPC.CHARACTER_READ_THUMBNAIL, name)
  },
  asset: {
    query: (filters?: AssetQuery) => ipcRenderer.invoke(IPC.ASSET_QUERY, filters),
    register: (entry: AssetEntry) => ipcRenderer.invoke(IPC.ASSET_REGISTER, entry),
    unregister: (id: string) => ipcRenderer.invoke(IPC.ASSET_UNREGISTER, id),
    readFile: (assetId: string) => ipcRenderer.invoke(IPC.ASSET_READ_FILE, assetId),
    readThumbnail: (assetId: string) => ipcRenderer.invoke(IPC.ASSET_READ_THUMBNAIL, assetId)
  },
  slot: {
    listAll: () => ipcRenderer.invoke(IPC.SLOT_LIST_ALL),
    getById: (id: string) => ipcRenderer.invoke(IPC.SLOT_GET_BY_ID, id)
  },
  rule: {
    listAll: () => ipcRenderer.invoke(IPC.RULE_LIST_ALL)
  },
  import: {
    pickFile: () => ipcRenderer.invoke(IPC.IMPORT_PICK_FILE),
    confirm: (params: unknown) => ipcRenderer.invoke(IPC.IMPORT_CONFIRM, params)
  },
  export: {
    execute: (params: unknown) => ipcRenderer.invoke(IPC.EXPORT_EXECUTE, params)
  },
  workspace: {
    load: () => ipcRenderer.invoke(IPC.WORKSPACE_LOAD),
    save: (state: unknown) => ipcRenderer.invoke(IPC.WORKSPACE_SAVE, state)
  },
  plugin: {
    list: () => ipcRenderer.invoke(IPC.PLUGIN_LIST),
    toggle: (pluginId: string, enabled: boolean) =>
      ipcRenderer.invoke(IPC.PLUGIN_TOGGLE, pluginId, enabled)
  },
  data: {
    getRules: () => ipcRenderer.invoke(IPC.DATA_GET_RULES),
    getPresets: () => ipcRenderer.invoke(IPC.DATA_GET_PRESETS),
    getPalettes: () => ipcRenderer.invoke(IPC.DATA_GET_PALETTES)
  }
})
