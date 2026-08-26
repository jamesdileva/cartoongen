import * as THREE from 'three'

interface MaterialConfig {
  color: string
  roughness: number
  metalness: number
}

const DEFAULT_MATERIALS: Record<string, MaterialConfig> = {
  skin: { color: '#f5d0a9', roughness: 0.7, metalness: 0.0 },
  hair: { color: '#4a3728', roughness: 0.9, metalness: 0.0 },
  cloth: { color: '#8b4513', roughness: 0.8, metalness: 0.0 },
  metal: { color: '#c0c0c0', roughness: 0.3, metalness: 0.9 },
  leather: { color: '#3e2723', roughness: 0.6, metalness: 0.1 },
  eye: { color: '#ffffff', roughness: 0.1, metalness: 0.0 },
  mouth: { color: '#cc3333', roughness: 0.5, metalness: 0.0 }
}

export class MaterialManager {
  private materials = new Map<string, THREE.MeshStandardMaterial>()

  getMaterial(materialId: string): THREE.MeshStandardMaterial {
    let mat = this.materials.get(materialId)
    if (!mat) {
      const config = DEFAULT_MATERIALS[materialId]
      mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(config?.color ?? '#cccccc'),
        roughness: config?.roughness ?? 0.5,
        metalness: config?.metalness ?? 0.0
      })
      this.materials.set(materialId, mat)
    }
    return mat
  }

  setColor(materialId: string, hex: string): void {
    const mat = this.materials.get(materialId)
    if (mat) {
      mat.color.set(hex)
    } else {
      const mat2 = this.getMaterial(materialId)
      mat2.color.set(hex)
    }
  }

  dispose(): void {
    for (const mat of this.materials.values()) {
      mat.dispose()
    }
    this.materials.clear()
  }
}
