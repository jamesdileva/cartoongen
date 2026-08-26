import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  buildHead,
  buildTorso,
  buildArm,
  buildLeg
} from './BodyParts'
import { DEFAULT_BODY_SHAPE } from '../../../shared/types/bodyShape'

function weightSumViolations(geometry: THREE.BufferGeometry): number {
  const sw = geometry.attributes.skinWeight.array as ArrayLike<number>
  let bad = 0
  for (let v = 0; v < geometry.attributes.position.count; v++) {
    let sum = 0
    for (let k = 0; k < 4; k++) sum += sw[v * 4 + k]
    if (Math.abs(sum - 1) > 1e-4) bad++
  }
  return bad
}

function xExtent(geometry: THREE.BufferGeometry): { min: number; max: number } {
  const pos = geometry.attributes.position as THREE.BufferAttribute
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < pos.count; i++) {
    min = Math.min(min, pos.getX(i))
    max = Math.max(max, pos.getX(i))
  }
  return { min, max }
}

function pelvisExtent(geometry: THREE.BufferGeometry): number {
  const pos = geometry.attributes.position as THREE.BufferAttribute
  let max = 0
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) < 1.0) max = Math.max(max, Math.abs(pos.getX(i)))
  }
  return max
}

function zExtent(geometry: THREE.BufferGeometry, yMin: number, yMax: number): number {
  const pos = geometry.attributes.position as THREE.BufferAttribute
  let max = -Infinity
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    if (y >= yMin && y <= yMax) max = Math.max(max, pos.getZ(i))
  }
  return max
}

function zMin(geometry: THREE.BufferGeometry, yMin: number, yMax: number): number {
  const pos = geometry.attributes.position as THREE.BufferAttribute
  let min = Infinity
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    if (y >= yMin && y <= yMax) min = Math.min(min, pos.getZ(i))
  }
  return min
}

describe('buildHead', () => {
  it('produces normalized skin weights', () => {
    const { geometry } = buildHead()
    expect(weightSumViolations(geometry)).toBe(0)
  })

  it('head spans from neck stub to skull top', () => {
    const { geometry } = buildHead(DEFAULT_BODY_SHAPE)
    const box = new THREE.Box3().setFromBufferAttribute(
      geometry.attributes.position as THREE.BufferAttribute
    )
    expect(box.min.y).toBeGreaterThan(1.4)
    expect(box.min.y).toBeLessThan(1.6)
    expect(box.max.y).toBeGreaterThan(2.0)
    expect(box.max.y).toBeLessThan(2.2)
  })

  it('wider head param widens the skull', () => {
    const narrow = xExtent(buildHead({ ...DEFAULT_BODY_SHAPE, headWidth: 0.2 }).geometry)
    const wide = xExtent(buildHead({ ...DEFAULT_BODY_SHAPE, headWidth: 0.3 }).geometry)
    expect(wide.max).toBeGreaterThan(narrow.max)
  })
})

describe('buildTorso', () => {
  it('binds to six segments including clavicles', () => {
    const { segments } = buildTorso()
    expect(segments.map((s) => s.name)).toEqual([
      'Root',
      'Spine',
      'Spine1',
      'Spine2',
      'LeftClavicle',
      'RightClavicle'
    ])
  })

  it('produces normalized skin weights', () => {
    const { geometry } = buildTorso()
    expect(weightSumViolations(geometry)).toBe(0)
  })

  it('torso spans hips to neck base with symmetric x extent', () => {
    const { geometry } = buildTorso(DEFAULT_BODY_SHAPE)
    const box = new THREE.Box3().setFromBufferAttribute(
      geometry.attributes.position as THREE.BufferAttribute
    )
    expect(box.min.y).toBeGreaterThan(0.7)
    expect(box.max.y).toBeLessThan(1.62)
    const ext = xExtent(geometry)
    expect(ext.min).toBeCloseTo(-ext.max, 3)
  })

  it('shoulderWidth param widens the rest pose', () => {
    const narrow = xExtent(buildTorso({ ...DEFAULT_BODY_SHAPE, shoulderWidth: 0.8 }).geometry)
    const wide = xExtent(buildTorso({ ...DEFAULT_BODY_SHAPE, shoulderWidth: 1.2 }).geometry)
    expect(wide.max).toBeGreaterThan(narrow.max)
  })

  it('hipWidth param widens the pelvis', () => {
    const slim = pelvisExtent(buildTorso({ ...DEFAULT_BODY_SHAPE, hipWidth: 0.8 }).geometry)
    const broad = pelvisExtent(buildTorso({ ...DEFAULT_BODY_SHAPE, hipWidth: 1.2 }).geometry)
    expect(broad).toBeGreaterThan(slim)
  })

  it('bust param extends chest front projection', () => {
    const flat = zExtent(buildTorso(DEFAULT_BODY_SHAPE, 0, 0.2).geometry, 1.25, 1.42)
    const full = zExtent(buildTorso(DEFAULT_BODY_SHAPE, 1, 0.2).geometry, 1.25, 1.42)
    expect(full).toBeGreaterThan(flat)
  })

  it('butt param extends rear projection', () => {
    const flat = -zMin(buildTorso(DEFAULT_BODY_SHAPE, 0.15, 0).geometry, 0.85, 1.05)
    const full = -zMin(buildTorso(DEFAULT_BODY_SHAPE, 0.15, 1).geometry, 0.85, 1.05)
    expect(full).toBeGreaterThan(flat)
  })
})

describe('buildArm', () => {
  it('binds to upper arm, forearm and hand segments', () => {
    const { segments } = buildArm(-1)
    expect(segments.map((s) => s.name)).toEqual(['LeftUpperArm', 'LeftForearm', 'LeftHand'])
  })

  it('left arm extends leftward with normalized weights', () => {
    const { geometry } = buildArm(-1)
    const box = new THREE.Box3().setFromBufferAttribute(
      geometry.attributes.position as THREE.BufferAttribute
    )
    expect(box.max.x).toBeLessThan(-0.25)
    expect(box.min.x).toBeGreaterThan(-1.15)
    expect(weightSumViolations(geometry)).toBe(0)
  })

  it('right arm mirrors left arm', () => {
    const left = xExtent(buildArm(-1).geometry)
    const right = xExtent(buildArm(1).geometry)
    expect(right.max).toBeCloseTo(-left.min, 4)
    expect(right.min).toBeCloseTo(-left.max, 4)
  })
})

describe('buildLeg', () => {
  it('binds to thigh, calf and foot segments', () => {
    const { segments } = buildLeg(1)
    expect(segments.map((s) => s.name)).toEqual(['RightUpperLeg', 'RightCalf', 'RightFoot'])
  })

  it('foot reaches the floor without going through it', () => {
    const { geometry } = buildLeg(-1)
    const box = new THREE.Box3().setFromBufferAttribute(
      geometry.attributes.position as THREE.BufferAttribute
    )
    expect(box.min.y).toBeGreaterThanOrEqual(-0.01)
    expect(box.min.y).toBeLessThanOrEqual(0.02)
    expect(box.max.y).toBeGreaterThan(0.8)
  })

  it('foot points forward from the ankle', () => {
    const { geometry } = buildLeg(1)
    const box = new THREE.Box3().setFromBufferAttribute(
      geometry.attributes.position as THREE.BufferAttribute
    )
    expect(box.max.z).toBeGreaterThan(0.14)
    expect(box.min.z).toBeGreaterThan(-0.12)
  })

  it('produces normalized skin weights', () => {
    expect(weightSumViolations(buildLeg(1).geometry)).toBe(0)
    expect(weightSumViolations(buildArm(1).geometry)).toBe(0)
  })
})
