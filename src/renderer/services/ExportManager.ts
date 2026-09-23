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
  // SkeletonHelper.clone() throws (broken root bone after Object3D.copy) — detach debug
  // helpers before cloning, then restore them on the live scene.
  const detached: { obj: THREE.Object3D; parent: THREE.Object3D; index: number }[] = []
  sceneGroup.traverse((child) => {
    if ((child as THREE.SkeletonHelper).isSkeletonHelper || (child as THREE.LineSegments).isLineSegments) {
      const parent = child.parent
      if (parent) {
        detached.push({ obj: child, parent, index: parent.children.indexOf(child) })
      }
    }
  })
  for (const { obj, parent } of detached) {
    parent.remove(obj)
  }

  let clone: THREE.Group
  try {
    clone = sceneGroup.clone(true)
  } finally {
    for (const { obj, parent, index } of detached) {
      const at = Math.min(index, parent.children.length)
      parent.children.splice(at, 0, obj)
      obj.parent = parent
    }
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
