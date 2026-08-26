export interface AssetEntry {
  id: string
  slotId: string
  path: string
  tags: string[]
  previewPath?: string
  version: number
  created: string
}

export interface AssetQuery {
  slotId?: string
  tags?: string[]
  ids?: string[]
}
