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
