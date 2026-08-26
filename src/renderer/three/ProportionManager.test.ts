import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { ProportionManager } from './ProportionManager'

function makeBone(name: string): THREE.Bone {
  const bone = new THREE.Bone()
  bone.name = name
  return bone
}

describe('ProportionManager', () => {
  it('scales a single bone on the given axis', () => {
    const pm = new ProportionManager()
    const head = makeBone('Head')
    const map = new Map([[ 'Head', head ]])
    pm.setBoneMap(map)
    pm.applyProportions({ headSize: 1 })
    expect(head.scale.y).toBeCloseTo(1.22, 5)
    expect(head.scale.x).toBe(1)
    pm.applyProportions({ headSize: 0 })
    expect(head.scale.y).toBeCloseTo(0.82, 5)
  })

  it('xz axis scales both x and z (muscle mass thickness)', () => {
    const pm = new ProportionManager()
    const arm = makeBone('upperarm_l')
    const map = new Map([[ 'upperarm_l', arm ]])
    pm.setBoneMap(map)
    pm.applyProportions({ muscleMass: 1 })
    expect(arm.scale.x).toBeCloseTo(1.3, 5)
    expect(arm.scale.z).toBeCloseTo(1.3, 5)
    expect(arm.scale.y).toBe(1)
  })

  it('mirrors clavicle scaling to the right side', () => {
    const pm = new ProportionManager()
    const left = makeBone('clavicle_l')
    const right = makeBone('clavicle_r')
    const map = new Map([[ 'clavicle_l', left ], [ 'clavicle_r', right ]])
    pm.setBoneMap(map)
    pm.applyProportions({ shoulderWidth: 1 })
    expect(left.scale.x).toBe(right.scale.x)
    expect(left.scale.x).toBeCloseTo(1.35, 5)
  })

  it('resolves aliases for quaternius-style names', () => {
    const pm = new ProportionManager()
    const spine = makeBone('Spine')
    const map = new Map([[ 'Spine', spine ]])
    pm.setBoneMap(map)
    pm.applyProportions({ height: 1 })
    expect(spine.scale.y).toBeGreaterThan(0.8)
    expect(spine.scale.y).toBeLessThan(1.2)
  })
})
