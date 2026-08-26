import { readFile, writeFile } from 'node:fs/promises'
import type { AssetEntry, AssetQuery } from '../../src/shared/types/asset'

export class AssetRegistry {
  private entries: AssetEntry[] = []
  private indexPath: string

  constructor(indexPath: string) {
    this.indexPath = indexPath
  }

  static async create(indexPath: string): Promise<AssetRegistry> {
    const registry = new AssetRegistry(indexPath)
    await registry.reload()
    return registry
  }

  async reload(): Promise<void> {
    try {
      const raw = await readFile(this.indexPath, 'utf-8')
      this.entries = JSON.parse(raw) as AssetEntry[]
    } catch {
      this.entries = []
    }
  }

  async persist(): Promise<void> {
    await writeFile(this.indexPath, JSON.stringify(this.entries, null, 2))
  }

  async query(filters?: AssetQuery): Promise<AssetEntry[]> {
    let results = this.entries

    if (filters?.slotId) {
      results = results.filter((e) => e.slotId === filters.slotId)
    }

    if (filters?.tags && filters.tags.length > 0) {
      results = results.filter((e) => filters.tags!.every((tag) => e.tags.includes(tag)))
    }

    if (filters?.ids && filters.ids.length > 0) {
      results = results.filter((e) => filters.ids!.includes(e.id))
    }

    return results
  }

  async getById(id: string): Promise<AssetEntry | undefined> {
    return this.entries.find((e) => e.id === id)
  }

  async register(entry: AssetEntry): Promise<void> {
    const existing = this.entries.findIndex((e) => e.id === entry.id)
    if (existing >= 0) {
      this.entries[existing] = entry
    } else {
      this.entries.push(entry)
    }
    await this.persist()
  }

  async unregister(id: string): Promise<void> {
    this.entries = this.entries.filter((e) => e.id !== id)
    await this.persist()
  }
}
