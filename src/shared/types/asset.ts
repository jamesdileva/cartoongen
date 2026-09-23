export interface AssetEntry {
  id: string
  slotId: string
  path: string
  tags: string[]
  previewPath?: string
  version: number
  created: string
  /** Display name; optional so imported GLB entries stay unchanged. */
  label?: string
}

export interface AssetQuery {
  slotId?: string
  tags?: string[]
  ids?: string[]
}
