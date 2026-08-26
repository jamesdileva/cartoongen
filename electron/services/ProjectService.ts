import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { ProjectManifest } from '../../src/shared/types/project'
import type { AssetEntry } from '../../src/shared/types/asset'

const MANIFEST_FILE = 'project.json'
const CHARACTERS_DIR = 'characters'
const ASSETS_DIR = 'assets'
const ASSET_INDEX_FILE = join(ASSETS_DIR, 'index.json')

export class ProjectService {
  private constructor(
    public readonly root: string,
    private manifest: ProjectManifest
  ) {}

  static async create(root: string, name: string): Promise<ProjectService> {
    const now = new Date().toISOString()
    const manifest: ProjectManifest = { name, version: 1, created: now, modified: now }

    await mkdir(root, { recursive: true })
    await mkdir(join(root, CHARACTERS_DIR), { recursive: true })
    await mkdir(join(root, ASSETS_DIR), { recursive: true })
    await mkdir(join(root, 'thumbnails'), { recursive: true })

    await writeFile(join(root, MANIFEST_FILE), JSON.stringify(manifest, null, 2))

    const indexPath = join(root, ASSET_INDEX_FILE)
    try {
      await writeFile(indexPath, JSON.stringify([], null, 2))
    } catch {
      // index file may already exist from a previous session
    }

    return new ProjectService(root, manifest)
  }

  static async open(root: string): Promise<ProjectService> {
    const raw = await readFile(join(root, MANIFEST_FILE), 'utf-8')
    const manifest: ProjectManifest = JSON.parse(raw)

    if (!manifest.name || !manifest.version) {
      throw new Error('Invalid project manifest')
    }

    return new ProjectService(root, manifest)
  }

  getManifest(): ProjectManifest {
    return { ...this.manifest }
  }

  async listCharacterNames(): Promise<string[]> {
    const dir = join(this.root, CHARACTERS_DIR)
    const entries = await readdir(dir)
    return entries
      .filter((e) => e.endsWith('.character.json'))
      .map((e) => e.replace(/\.character\.json$/, ''))
      .sort()
  }

  async listAssets(): Promise<AssetEntry[]> {
    const indexPath = join(this.root, ASSET_INDEX_FILE)
    try {
      const raw = await readFile(indexPath, 'utf-8')
      return JSON.parse(raw) as AssetEntry[]
    } catch {
      return []
    }
  }

  characterPath(name: string): string {
    return join(this.root, CHARACTERS_DIR, `${name}.character.json`)
  }

  assetIndexPath(): string {
    return join(this.root, ASSET_INDEX_FILE)
  }
}
