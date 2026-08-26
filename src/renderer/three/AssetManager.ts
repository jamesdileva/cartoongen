import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import type { MaterialManager } from './MaterialManager'

const gltfLoader = new GLTFLoader()
const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/')
gltfLoader.setDRACOLoader(dracoLoader)
gltfLoader.setMeshoptDecoder(MeshoptDecoder)

interface CacheEntry {
  group: THREE.Group
  lastAccessed: number
  ownsMaterials: boolean
}

const PLACEHOLDER_SHAPES: Record<string, () => THREE.BufferGeometry> = {
  hair: () => new THREE.ConeGeometry(0.18, 0.25, 8),
  helmet: () => new THREE.SphereGeometry(0.28, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  eyebrows: () => new THREE.BoxGeometry(0.14, 0.03, 0.03),
  eyes: () => new THREE.SphereGeometry(0.04, 8, 8),
  mouth: () => new THREE.CylinderGeometry(0.05, 0.05, 0.02, 8),
  beard: () => new THREE.ConeGeometry(0.08, 0.12, 6),
  shirt: () => new THREE.BoxGeometry(0.6, 0.35, 0.3),
  pants: () => new THREE.BoxGeometry(0.35, 0.45, 0.25),
  shoes: () => new THREE.BoxGeometry(0.1, 0.06, 0.18),
  gloves: () => new THREE.BoxGeometry(0.08, 0.06, 0.08),
  cape: () => new THREE.PlaneGeometry(0.4, 0.5),
  wings: () => {
    const geo = new THREE.BufferGeometry()
    const vertices = new Float32Array([
      0, 0, 0, 0.4, 0.3, 0, 0.1, -0.2, 0, 0, 0, 0, -0.1, -0.2, 0, 0.4, 0.3, 0
    ])
    geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
    geo.computeVertexNormals()
    return geo
  }
}

const SLOT_MATERIAL_MAP: Record<string, string> = {
  hair: 'hair',
  helmet: 'metal',
  eyebrows: 'hair',
  eyes: 'eye',
  mouth: 'mouth',
  beard: 'hair',
  shirt: 'cloth',
  pants: 'cloth',
  shoes: 'leather',
  gloves: 'leather',
  cape: 'cloth',
  wings: 'cloth'
}

export class AssetManager {
  private cache = new Map<string, CacheEntry>()
  private maxCacheSize: number
  private materialManager: MaterialManager

  constructor(materialManager: MaterialManager, maxCacheSize = 50) {
    this.materialManager = materialManager
    this.maxCacheSize = maxCacheSize
  }

  async loadAsset(assetId: string, slotId: string): Promise<THREE.Group> {
    const existing = this.cache.get(assetId)
    if (existing) {
      existing.lastAccessed = Date.now()
      return existing.group
    }

    let group: THREE.Group
    let ownsMaterials = false

    try {
      group = await this.tryLoadGLBAsset(assetId)
      ownsMaterials = true
    } catch {
      group = this.createPlaceholder(slotId)
    }

    this.cache.set(assetId, { group, lastAccessed: Date.now(), ownsMaterials })
    if (this.cache.size > this.maxCacheSize) {
      this.evictLRU()
    }

    return group
  }

  releaseAsset(assetId: string): void {
    const entry = this.cache.get(assetId)
    if (entry) {
      this.disposeEntry(entry)
      this.cache.delete(assetId)
    }
  }

  dispose(): void {
    for (const entry of this.cache.values()) {
      this.disposeEntry(entry)
    }
    this.cache.clear()
  }

  private disposeGroup(group: THREE.Group, ownsMaterials: boolean): void {
    group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        if (ownsMaterials) {
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose())
          } else {
            child.material.dispose()
          }
        }
      }
    })
  }

  private disposeEntry(entry: CacheEntry): void {
    this.disposeGroup(entry.group, entry.ownsMaterials)
  }

  private evictLRU(): void {
    let oldestKey: string | null = null
    let oldestTime = Infinity
    for (const [key, entry] of this.cache) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed
        oldestKey = key
      }
    }
    if (oldestKey) {
      const entry = this.cache.get(oldestKey)
      if (entry) {
        this.disposeEntry(entry)
        this.cache.delete(oldestKey)
      }
    }
  }

  private async tryLoadGLBAsset(assetId: string): Promise<THREE.Group> {
    const buffer = await window.electronAPI.asset.readFile(assetId)
    if (!buffer) throw new Error(`Asset ${assetId} not found on disk`)

    const gltf = await gltfLoader.parseAsync(buffer, '')

    gltf.scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (Array.isArray(child.material)) {
          child.material = child.material.map((m) => this.remapMaterial(m))
        } else if (child.material) {
          child.material = this.remapMaterial(child.material)
        }
      }
    })

    return gltf.scene
  }

  private remapMaterial(mat: THREE.Material): THREE.Material {
    const name = mat.name?.toLowerCase() ?? ''
    if (name.includes('skin') || name.includes('superhero')) return this.materialManager.getMaterial('skin')
    if (name.includes('hair') || name.includes('eyebrow') || name.includes('beard')) return this.materialManager.getMaterial('hair')
    if (name.includes('cloth') || name.includes('body') || name.includes('hood') || name.includes('arm') || name.includes('pants') || name.includes('leg') || name.includes('pauldron') || name.includes('cape')) return this.materialManager.getMaterial('cloth')
    if (name.includes('metal') || name.includes('armor')) return this.materialManager.getMaterial('metal')
    if (name.includes('leather') || name.includes('boot') || name.includes('shoe')) return this.materialManager.getMaterial('leather')
    if (name.includes('eye')) return this.materialManager.getMaterial('eye')
    if (name.includes('mouth') || name.includes('lip')) return this.materialManager.getMaterial('mouth')
    return mat
  }

  private createPlaceholder(slotId: string): THREE.Group {
    const shapeFn = PLACEHOLDER_SHAPES[slotId]
    const geometry = shapeFn ? shapeFn() : new THREE.BoxGeometry(0.1, 0.1, 0.1)
    const materialId = SLOT_MATERIAL_MAP[slotId] ?? 'cloth'
    const material = this.materialManager.getMaterial(materialId)
    const mesh = new THREE.Mesh(geometry, material)
    const group = new THREE.Group()
    group.add(mesh)
    return group
  }
}
