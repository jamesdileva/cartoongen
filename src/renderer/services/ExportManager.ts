import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import type { CharacterDNA } from '../../shared/types/dna'
import type { ExportProfile } from '../../shared/types/export'

export interface ExportValidation {
  bodySlotFilled: boolean
  headSlotFilled: boolean
  meshesPresent: boolean
}

export async function exportCharacter(
  sceneGroup: THREE.Group,
  dna: CharacterDNA,
  profile: ExportProfile,
  _characterName: string
): Promise<{ buffer: ArrayBuffer; validation: ExportValidation }> {
  const clone = sceneGroup.clone(true)

  const toRemove: THREE.Object3D[] = []
  clone.traverse((child) => {
    if ((child as THREE.LineSegments).isLineSegments) {
      toRemove.push(child)
    }
  })
  for (const obj of toRemove) {
    obj.parent?.remove(obj)
  }

  const validation: ExportValidation = {
    bodySlotFilled: !!dna.slots.body,
    headSlotFilled: !!dna.slots.head,
    meshesPresent: clone.children.some((c) => c instanceof THREE.Mesh || hasMeshDescendant(c))
  }

  const exporter = new GLTFExporter()

  return exporter
    .parseAsync(clone, {
      binary: profile.binary,
      embedImages: profile.embedImages
    })
    .then((result) => {
      if (result instanceof ArrayBuffer) {
        return { buffer: result, validation }
      }
      const json = JSON.stringify(result, null, 2)
      const bytes = new TextEncoder().encode(json)
      return { buffer: bytes.buffer as ArrayBuffer, validation }
    })
}

function hasMeshDescendant(obj: THREE.Object3D): boolean {
  let found = false
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh) found = true
  })
  return found
}

export function validateExport(dna: CharacterDNA, sceneGroup: THREE.Group, hasBaseBody = false): ExportValidation {
  return {
    bodySlotFilled: !!dna.slots.body || hasBaseBody,
    headSlotFilled: !!dna.slots.head || hasBaseBody,
    meshesPresent: sceneGroup.children.some((c) => c instanceof THREE.Mesh || hasMeshDescendant(c))
  }
}
