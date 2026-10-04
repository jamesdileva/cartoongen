import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { snapshotRest, applyPoseOffsets, resetPoseRotations } from './Poses'
import type { Pose } from '../../shared/types/pose'
import poses from '../../shared/data/poses.json'
import referenceSkeleton from '../../shared/data/reference-skeleton.json'

function makeArmRig(): Map<string, THREE.Bone> {
  const map = new Map<string, THREE.Bone>()
  const root = new THREE.Bone()
  root.name = 'Root'
  root.position.set(0, 0.9, 0)
  const spine2 = new THREE.Bone()
  spine2.name = 'Spine2'
  spine2.position.set(0, 0.7, 0)
  root.add(spine2)
  map.set('Root', root)
  map.set('Spine2', spine2)
  for (const side of ['Left', 'Right'] as const) {
    const clav = new THREE.Bone()
    clav.name = `${side}Clavicle`
    clav.position.set(side === 'Left' ? -0.1 : 0.1, 0.02, 0)
    spine2.add(clav)
    map.set(clav.name, clav)
    const upper = new THREE.Bone()
    upper.name = `${side}UpperArm`
    upper.position.set(side === 'Left' ? -0.38 : 0.38, 0.05, 0)
    upper.rotation.z = side === 'Left' ? Math.PI / 2 : -Math.PI / 2
    spine2.add(upper)
    const fore = new THREE.Bone()
    fore.name = `${side}Forearm`
    fore.position.set(0, 0.3, 0)
    upper.add(fore)
    map.set(upper.name, upper)
    map.set(fore.name, fore)
  }
  root.updateMatrixWorld(true)
  return map
}

function tipWorld(bones: Map<string, THREE.Bone>, name: string): THREE.Vector3 {
  const bone = bones.get(name)!
  const tip = new THREE.Vector3()
  // Forearm is 0.3 long; tip = forearm origin + its Y axis in world space.
  const dir = new THREE.Vector3(0, 1, 0).applyQuaternion(
    bone.getWorldQuaternion(new THREE.Quaternion())
  )
  bone.getWorldPosition(tip)
  return tip.addScaledVector(dir, 0.3)
}

describe('pose offsets', () => {
  it('relaxes arms downward from T-pose', () => {
    const bones = makeArmRig()
    const rest = snapshotRest(bones)
    const before = tipWorld(bones, 'LeftForearm')
    const pose: Pose = {
      id: 'relaxed',
      name: 'Relaxed',
      icon: '',
      description: '',
      bones: { LeftUpperArm: [0, 0, 1.25], RightUpperArm: [0, 0, -1.25] }
    }
    const applied = applyPoseOffsets(bones, rest, pose)
    expect(applied).toEqual(expect.arrayContaining(['LeftUpperArm', 'RightUpperArm']))
    bones.get('Root')!.updateMatrixWorld(true)
    const after = tipWorld(bones, 'LeftForearm')
    // T-pose hand at shoulder height (~1.65); relaxed hangs below it.
    expect(before.y).toBeGreaterThan(1.5)
    expect(after.y).toBeLessThan(before.y - 0.3)
  })

  it('skips unknown bones and restores rest on reset', () => {
    const bones = makeArmRig()
    const rest = snapshotRest(bones)
    const pose: Pose = {
      id: 'x',
      name: 'X',
      icon: '',
      description: '',
      bones: { Nope: [1, 2, 3], LeftUpperArm: [0, 0, 0.5] }
    }
    const applied = applyPoseOffsets(bones, rest, pose)
    expect(applied).toEqual(['LeftUpperArm'])
    expect(bones.get('LeftUpperArm')!.rotation.z).toBeCloseTo(Math.PI / 2 + 0.5, 5)
    resetPoseRotations(bones, rest)
    expect(bones.get('LeftUpperArm')!.rotation.z).toBeCloseTo(Math.PI / 2, 5)
  })

  it('real relaxed pose drops both arm tips symmetrically', () => {
    const relaxed = (poses as Pose[]).find((p) => p.id === 'relaxed')!
    for (const side of ['Left', 'Right'] as const) {
      const bones = makeArmRig()
      const rest = snapshotRest(bones)
      const before = tipWorld(bones, `${side}Forearm`)
      const applied = applyPoseOffsets(bones, rest, relaxed)
      expect(applied).toContain(`${side}Clavicle`)
      expect(applied).toContain(`${side}UpperArm`)
      expect(applied).toContain(`${side}Forearm`)
      bones.get('Root')!.updateMatrixWorld(true)
      const after = tipWorld(bones, `${side}Forearm`)
      expect(after.y).toBeLessThan(before.y - 0.3)
    }
  })
})

describe('poses.json', () => {
  it('has unique ids and finite bounded angles on known bones', () => {
    const ref = referenceSkeleton as {
      critical: string[]
      optional: string[]
      aliases: Record<string, string>
    }
    const known = new Set([
      ...ref.critical,
      ...ref.optional,
      ...Object.keys(ref.aliases),
      ...Object.values(ref.aliases)
    ])
    const ids = new Set<string>()
    for (const pose of poses as Pose[]) {
      expect(pose.id).toBeTruthy()
      expect(ids.has(pose.id)).toBe(false)
      ids.add(pose.id)
      expect(pose.name).toBeTruthy()
      for (const [bone, angles] of Object.entries(pose.bones)) {
        expect(known.has(bone), `${pose.id} references known bone ${bone}`).toBe(true)
        for (const a of angles) {
          expect(Number.isFinite(a)).toBe(true)
          expect(Math.abs(a)).toBeLessThanOrEqual(Math.PI)
        }
      }
    }
    expect(ids.size).toBeGreaterThanOrEqual(4)
  })
})
