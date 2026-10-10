import * as THREE from 'three'
import type { Pose } from '../../shared/types/pose'

/**
 * Pure pose application over a bone map. Offsets add to captured rest
 * rotations; unknown bones are skipped (cross-rig tolerance). Headless
 * safe: plain THREE objects, no stores, no DOM.
 */
export function snapshotRest(bones: Map<string, THREE.Bone>): Map<string, THREE.Euler> {
  const rest = new Map<string, THREE.Euler>()
  bones.forEach((bone, name) => {
    rest.set(name, bone.rotation.clone())
  })
  return rest
}

export function applyPoseOffsets(
  bones: Map<string, THREE.Bone>,
  rest: Map<string, THREE.Euler>,
  pose: Pose
): string[] {
  const applied: string[] = []
  for (const [name, offset] of Object.entries(pose.bones)) {
    const bone = bones.get(name)
    const base = rest.get(name)
    if (!bone || !base) continue
    bone.rotation.set(base.x + offset[0], base.y + offset[1], base.z + offset[2])
    applied.push(name)
  }
  return applied
}

export function resetPoseRotations(
  bones: Map<string, THREE.Bone>,
  rest: Map<string, THREE.Euler>
): void {
  rest.forEach((euler, name) => {
    bones.get(name)?.rotation.copy(euler)
  })
}

/**
 * CPU skinning: deforms geometry by its own skinIndex/skinWeight attributes
 * using rest inverses and CURRENT bone matrices. Pure/headless; mirrors the
 * GPU path for verification (posed coverage, bind parity).
 */
export function deformSkin(
  geometry: THREE.BufferGeometry,
  order: string[],
  bones: Map<string, THREE.Bone>,
  inverses: Map<string, THREE.Matrix4>
): THREE.BufferGeometry {
  const pos = geometry.attributes.position as THREE.BufferAttribute
  const si = geometry.attributes.skinIndex.array as ArrayLike<number>
  const sw = geometry.attributes.skinWeight.array as ArrayLike<number>
  const g = geometry.clone()
  const p = g.attributes.position as THREE.BufferAttribute
  const v = new THREE.Vector3()
  const sk = new THREE.Vector3()
  const m = new THREE.Matrix4()
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i))
    sk.set(0, 0, 0)
    for (let k = 0; k < 4; k++) {
      const w = sw[i * 4 + k]
      if (w <= 0) continue
      const bone = bones.get(order[si[i * 4 + k]])!
      m.multiplyMatrices(bone.matrixWorld, inverses.get(order[si[i * 4 + k]])!)
      sk.addScaledVector(v.clone().applyMatrix4(m), w)
    }
    p.setXYZ(i, sk.x, sk.y, sk.z)
  }
  return g
}
