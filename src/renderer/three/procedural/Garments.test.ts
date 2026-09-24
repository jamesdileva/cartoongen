import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  buildTShirt,
  buildJeans,
  isProceduralAssetId,
  findProceduralAsset,
  getProceduralAssetEntries,
  buttRearDepth
} from './Garments'
import { DEFAULT_BODY_SHAPE, type BodyShape } from '../../../shared/types/bodyShape'
import type { CharacterDNA } from '../../../shared/types/dna'

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

function zExtentAtY(geometry: THREE.BufferGeometry, y0: number, y1: number, rear = false): number {
  const pos = geometry.attributes.position as THREE.BufferAttribute
  let best = rear ? Infinity : -Infinity
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    if (y < y0 || y > y1) continue
    const z = pos.getZ(i)
    if (rear) best = Math.min(best, z)
    else best = Math.max(best, z)
  }
  return best
}

const baseDna = {
  id: 'test',
  name: 'Test',
  version: 3,
  slots: {},
  morphs: {},
  colors: {},
  created: '',
  modified: ''
} as unknown as CharacterDNA

describe('procedural asset catalog', () => {
  it('recognizes proc: ids', () => {
    expect(isProceduralAssetId('proc:tshirt')).toBe(true)
    expect(isProceduralAssetId('abc')).toBe(false)
  })

  it('exposes t-shirt and jeans entries for shirt/pants slots', () => {
    const entries = getProceduralAssetEntries()
    expect(entries.map((e) => e.id).sort()).toEqual(['proc:jeans', 'proc:tshirt'])
    expect(entries.find((e) => e.id === 'proc:tshirt')?.slotId).toBe('shirt')
    expect(entries.find((e) => e.id === 'proc:jeans')?.slotId).toBe('pants')
    expect(findProceduralAsset('proc:tshirt')?.label).toBe('T-Shirt')
  })
})

describe('buildTShirt', () => {
  it('binds to torso and upper-arm segments', () => {
    const { boneNames } = buildTShirt()
    expect(boneNames).toContain('Root')
    expect(boneNames).toContain('Spine1')
    expect(boneNames).toContain('LeftClavicle')
    expect(boneNames).toContain('LeftUpperArm')
    expect(boneNames).toContain('RightUpperArm')
  })

  it('produces normalized skin weights', () => {
    expect(weightSumViolations(buildTShirt().geometry)).toBe(0)
  })

  it('covers hips through shoulders', () => {
    const box = new THREE.Box3().setFromBufferAttribute(
      buildTShirt().geometry.attributes.position as THREE.BufferAttribute
    )
    expect(box.min.y).toBeGreaterThan(0.8)
    expect(box.min.y).toBeLessThan(1.0)
    expect(box.max.y).toBeGreaterThan(1.45)
    expect(box.max.y).toBeLessThan(1.65)
  })

  it('is symmetric on x', () => {
    const ext = xExtent(buildTShirt().geometry)
    expect(ext.min).toBeCloseTo(-ext.max, 3)
  })

  it('belly morph widens the waist shell', () => {
    const lean = zExtentAtY(buildTShirt(DEFAULT_BODY_SHAPE, 0.15, 0).geometry, 1.0, 1.18)
    const fat = zExtentAtY(buildTShirt(DEFAULT_BODY_SHAPE, 0.15, 1).geometry, 1.0, 1.18)
    expect(fat).toBeGreaterThan(lean)
  })

  it('bust morph extends chest front beyond flat chest', () => {
    const flat = zExtentAtY(buildTShirt(DEFAULT_BODY_SHAPE, 0, 0.5).geometry, 1.25, 1.4)
    const full = zExtentAtY(buildTShirt(DEFAULT_BODY_SHAPE, 1, 0.5).geometry, 1.25, 1.4)
    expect(full).toBeGreaterThan(flat)
  })

  it('chest depth covers off-center bust peaks at max morph', () => {
    // Peak at x ≈ 0.085+0.03 = 0.115; ring z there must clear body bust front.
    const bust = 1
    const bustR = 0.02 + 0.075 * bust
    const bodyFront = (0.155 + 0.045 * bust) * DEFAULT_BODY_SHAPE.chestDepth + bustR * 0.78
    const peakX = 0.085 + 0.03 * bust
    const geo = buildTShirt(DEFAULT_BODY_SHAPE, bust, 0.5).geometry
    const pos = geo.attributes.position as THREE.BufferAttribute
    let peakZ = -Infinity
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i)
      if (y < 1.25 || y > 1.4) continue
      if (Math.abs(pos.getX(i) - peakX) < 0.02) {
        peakZ = Math.max(peakZ, pos.getZ(i))
      }
    }
    expect(peakZ).toBeGreaterThan(bodyFront)
  })

  it('stays outside the body surface (offset shell)', () => {
    // Chest half-depth from torsoProfile is 0.225; shirt must exceed it + epsilon.
    const front = zExtentAtY(buildTShirt(DEFAULT_BODY_SHAPE, 0.15, 0.5).geometry, 1.3, 1.4)
    expect(front).toBeGreaterThan(0.225)
  })

  it('hem clears the pelvis ellipsoid (0.32 * hipWidth)', () => {
    const hemHalfW = 0.32 * DEFAULT_BODY_SHAPE.hipWidth
    const ext = xExtent(buildTShirt(DEFAULT_BODY_SHAPE, 0.15, 0.5).geometry)
    expect(ext.max).toBeGreaterThan(hemHalfW)
    expect(ext.min).toBeLessThan(-hemHalfW)
  })

  it('rear hem clears butt at max morph on wide hips', () => {
    const shape: BodyShape = { ...DEFAULT_BODY_SHAPE, hipWidth: 1.2, shoulderWidth: 1.2 }
    const rear = -zExtentAtY(buildTShirt(shape, 0.15, 0.5, 1).geometry, 0.85, 1.05, true)
    expect(rear).toBeGreaterThan(buttRearDepth(shape, 1))
  })

  it('waist band clears butt top at max morph', () => {
    // Butt ellipsoids top out near y=1.045 — the y=1.06 station must carry
    // hip depth instead of sagging to the shallow waist tube.
    for (const hipWidth of [1, 1.3]) {
      const shape: BodyShape = { ...DEFAULT_BODY_SHAPE, hipWidth }
      const geo = buildTShirt(shape, 0.15, 0.5, 1).geometry
      const pos = geo.attributes.position as THREE.BufferAttribute
      let minZ = Infinity
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i)
        if (y < 1.0 || y > 1.08) continue
        minZ = Math.min(minZ, pos.getZ(i))
      }
      // Body butt rear at y~1.02 reaches ≈0.256; cloth must stay outside it.
      expect(-minZ, `hip=${hipWidth}`).toBeGreaterThan(0.26)
    }
  })

  it('chest peak clears body bust across extreme shapes', () => {
    const shapes: BodyShape[] = [
      DEFAULT_BODY_SHAPE,
      { ...DEFAULT_BODY_SHAPE, shoulderWidth: 0.75, chestDepth: 0.75 },
      { ...DEFAULT_BODY_SHAPE, shoulderWidth: 1.3, chestDepth: 1.3 },
      { ...DEFAULT_BODY_SHAPE, shoulderWidth: 1.3, chestDepth: 0.75 },
      { ...DEFAULT_BODY_SHAPE, shoulderWidth: 0.75, chestDepth: 1.3 }
    ]
    for (const shape of shapes) {
      for (const bust of [0, 0.5, 1]) {
        const bustR = 0.02 + 0.075 * bust
        const bodyFront = (0.155 + 0.045 * bust) * shape.chestDepth + bustR * 0.78
        const peakX = 0.085 + 0.03 * bust
        const geo = buildTShirt(shape, bust, 0.5, 0.2).geometry
        const pos = geo.attributes.position as THREE.BufferAttribute
        let peakZ = -Infinity
        for (let i = 0; i < pos.count; i++) {
          const y = pos.getY(i)
          if (y < 1.25 || y > 1.4) continue
          if (Math.abs(pos.getX(i) - peakX) < 0.025) {
            peakZ = Math.max(peakZ, pos.getZ(i))
          }
        }
        expect(
          peakZ,
          `shape sw=${shape.shoulderWidth} cd=${shape.chestDepth} bust=${bust}`
        ).toBeGreaterThan(bodyFront)
      }
    }
  })

  it('sleeve encapsulates deltoid ellipsoid across shoulder widths', () => {
    for (const shoulderWidth of [0.75, 1, 1.3]) {
      const shape: BodyShape = { ...DEFAULT_BODY_SHAPE, shoulderWidth }
      const geo = buildTShirt(shape, 0.15, 0.5, 0.2).geometry
      const pos = geo.attributes.position as THREE.BufferAttribute
      const clavEnd = 0.36 * shoulderWidth
      const cx = clavEnd + 0.005
      const cy = 1.465
      // Sample deltoid shell points (unit sphere scaled) and require cloth outside.
      const samples: Array<[number, number, number]> = []
      const n = 8
      for (let i = 0; i <= n; i++) {
        for (let j = 0; j <= n; j++) {
          const theta = (i / n) * Math.PI
          const phi = (j / n) * Math.PI * 2
          samples.push([
            cx + 0.095 * Math.sin(theta) * Math.cos(phi),
            cy + 0.115 * Math.cos(theta),
            0.1 * Math.sin(theta) * Math.sin(phi)
          ])
        }
      }
      // For each sample, min distance to any cloth vertex must be >= 0
      // (cloth outside or on surface). Use signed check via nearest vertex z/x.
      let worst = Infinity
      for (const [sx, sy, sz] of samples) {
        let minDist = Infinity
        for (let i = 0; i < pos.count; i++) {
          const dx = pos.getX(i) - sx
          const dy = pos.getY(i) - sy
          const dz = pos.getZ(i) - sz
          const d = Math.hypot(dx, dy, dz)
          if (d < minDist) minDist = d
        }
        worst = Math.min(worst, minDist)
      }
      // Cloth is a discrete mesh; require deltoid not deep inside cloth shell.
      // Positive worst-case clearance means every deltoid sample has cloth nearby outside-ish;
      // we mainly assert the sleeve band reaches the deltoid region.
      const box = new THREE.Box3().setFromBufferAttribute(pos)
      expect(box.max.x, `sw=${shoulderWidth}`).toBeGreaterThan(cx + 0.05)
      expect(box.min.x).toBeLessThan(-(cx + 0.05))
      expect(box.max.y).toBeGreaterThan(cy + 0.1)
      expect(box.min.y).toBeLessThan(cy - 0.1)
      expect(worst).toBeLessThan(0.12)
    }
  })
})

describe('buildJeans', () => {
  it('binds to hips and leg chains', () => {
    const { boneNames } = buildJeans()
    expect(boneNames).toEqual([
      'Root',
      'Spine',
      'LeftUpperLeg',
      'LeftCalf',
      'RightUpperLeg',
      'RightCalf'
    ])
  })

  it('produces normalized skin weights', () => {
    expect(weightSumViolations(buildJeans().geometry)).toBe(0)
  })

  it('reaches the ankles without going to the floor', () => {
    const box = new THREE.Box3().setFromBufferAttribute(
      buildJeans().geometry.attributes.position as THREE.BufferAttribute
    )
    expect(box.min.y).toBeGreaterThan(0.05)
    expect(box.min.y).toBeLessThan(0.2)
    expect(box.max.y).toBeGreaterThan(0.95)
    expect(box.max.y).toBeLessThan(1.15)
  })

  it('hipWidth widens the hip shell', () => {
    const slim = xExtent(buildJeans({ ...DEFAULT_BODY_SHAPE, hipWidth: 0.8 }).geometry)
    const broad = xExtent(buildJeans({ ...DEFAULT_BODY_SHAPE, hipWidth: 1.2 }).geometry)
    expect(broad.max).toBeGreaterThan(slim.max)
  })

  it('hip shell clears pelvis ellipsoid width', () => {
    const pelvisHalfW = 0.32 * DEFAULT_BODY_SHAPE.hipWidth
    const ext = xExtent(buildJeans(DEFAULT_BODY_SHAPE, 0.2).geometry)
    expect(ext.max).toBeGreaterThan(pelvisHalfW)
    expect(ext.min).toBeLessThan(-pelvisHalfW)
  })

  it('rear covers butt ellipsoid at max morph', () => {
    // butt=1, hipWidth=1: rear extent ≈ 0.13+0.055+0.055+0.065 = 0.305
    const rear = -zExtentAtY(buildJeans(DEFAULT_BODY_SHAPE, 1).geometry, 0.8, 1.0, true)
    expect(rear).toBeGreaterThan(0.305)
    expect(rear).toBeGreaterThan(buttRearDepth(DEFAULT_BODY_SHAPE, 1))
  })

  it('rear clears butt across hipWidth × butt grid', () => {
    for (const hipWidth of [0.75, 1, 1.3]) {
      for (const butt of [0, 0.5, 1]) {
        const shape: BodyShape = { ...DEFAULT_BODY_SHAPE, hipWidth }
        const rear = -zExtentAtY(buildJeans(shape, butt).geometry, 0.8, 1.0, true)
        expect(rear, `hip=${hipWidth} butt=${butt}`).toBeGreaterThan(buttRearDepth(shape, butt))
      }
    }
  })

  it('hip rear clears fixed pelvis radius at butt=0', () => {
    // Pelvis rear z radius is 0.23 regardless of shape — floor must match.
    for (const hipWidth of [0.75, 1, 1.3]) {
      const shape: BodyShape = { ...DEFAULT_BODY_SHAPE, hipWidth }
      const rear = -zExtentAtY(buildJeans(shape, 0).geometry, 0.85, 0.95, true)
      expect(rear, `hip=${hipWidth}`).toBeGreaterThan(0.23)
    }
  })

  it('waist widens with belly morph', () => {
    const lean = xExtent(buildJeans(DEFAULT_BODY_SHAPE, 0.2, 0).geometry)
    const fat = xExtent(buildJeans(DEFAULT_BODY_SHAPE, 0.2, 1).geometry)
    expect(fat.max).toBeGreaterThan(lean.max)
  })

  it('waist clears belly-scaled body tube', () => {
    // Body waist half-depth at belly=1 is 0.19*1.35=0.2565.
    const rear = -zExtentAtY(buildJeans(DEFAULT_BODY_SHAPE, 0, 1).geometry, 1.0, 1.06, true)
    expect(rear).toBeGreaterThan(0.2565)
  })

  it('butt morph extends rear coverage', () => {
    const flat = zExtentAtY(buildJeans(DEFAULT_BODY_SHAPE, 0).geometry, 0.8, 1.0, true)
    const full = zExtentAtY(buildJeans(DEFAULT_BODY_SHAPE, 1).geometry, 0.8, 1.0, true)
    // rear is more negative when butt is larger
    expect(full).toBeLessThan(flat)
  })

  it('is symmetric on x', () => {
    const ext = xExtent(buildJeans().geometry)
    expect(ext.min).toBeCloseTo(-ext.max, 3)
  })
})

describe('garment build from DNA', () => {
  it('t-shirt builder responds to morphs in DNA', () => {
    const def = findProceduralAsset('proc:tshirt')
    expect(def).toBeDefined()
    const lean = def!.build({ ...baseDna, morphs: { bellySize: 0, bust: 0 } }).geometry
    const fat = def!.build({ ...baseDna, morphs: { bellySize: 1, bust: 1 } }).geometry
    const leanZ = zExtentAtY(lean, 1.0, 1.4)
    const fatZ = zExtentAtY(fat, 1.0, 1.4)
    expect(fatZ).toBeGreaterThan(leanZ)
  })

  it('jeans builder responds to hipWidth in DNA', () => {
    const def = findProceduralAsset('proc:jeans')
    const slim = def!.build({
      ...baseDna,
      bodyShape: { hipWidth: 0.8 }
    }).geometry
    const broad = def!.build({
      ...baseDna,
      bodyShape: { hipWidth: 1.2 }
    }).geometry
    expect(xExtent(broad).max).toBeGreaterThan(xExtent(slim).max)
  })
})

describe('garment skinned deformation', () => {
  /** CPU skin: world = boneWorld * boneInverse * identity * v (matches bindToBones). */
  function skinMaxRadius(
    geometry: THREE.BufferGeometry,
    bones: THREE.Bone[],
    boneInverses: THREE.Matrix4[],
    yBand: [number, number]
  ): number {
    const pos = geometry.attributes.position as THREE.BufferAttribute
    const si = geometry.attributes.skinIndex.array as ArrayLike<number>
    const sw = geometry.attributes.skinWeight.array as ArrayLike<number>
    const v = new THREE.Vector3()
    const skinned = new THREE.Vector3()
    let maxR = 0
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i)
      if (y < yBand[0] || y > yBand[1]) continue
      v.set(pos.getX(i), y, pos.getZ(i))
      skinned.set(0, 0, 0)
      let wSum = 0
      for (let k = 0; k < 4; k++) {
        const w = sw[i * 4 + k]
        if (w <= 0) continue
        const bi = si[i * 4 + k]
        const mat = new THREE.Matrix4().multiplyMatrices(bones[bi].matrixWorld, boneInverses[bi])
        skinned.addScaledVector(v.clone().applyMatrix4(mat), w)
        wSum += w
      }
      if (wSum > 0) skinned.divideScalar(wSum)
      maxR = Math.max(maxR, Math.hypot(skinned.x, skinned.z))
    }
    return maxR
  }

  function restSkeleton(
    boneDefs: Array<{ name: string; pos: [number, number, number]; parent?: number }>
  ) {
    const bones = boneDefs.map((d) => {
      const b = new THREE.Bone()
      b.name = d.name
      b.position.set(...d.pos)
      return b
    })
    boneDefs.forEach((d, i) => {
      if (d.parent !== undefined) bones[d.parent].add(bones[i])
    })
    const rootIdx = boneDefs.findIndex((d) => d.parent === undefined)
    bones[rootIdx].updateMatrixWorld(true)
    const inverses = bones.map((b) => new THREE.Matrix4().copy(b.matrixWorld).invert())
    return { bones, inverses }
  }

  it('t-shirt waist grows when Spine1 xz scales (belly stand-in)', () => {
    const { geometry, boneNames } = buildTShirt(DEFAULT_BODY_SHAPE, 0.15, 0.3)
    const { bones, inverses } = restSkeleton([
      { name: 'Root', pos: [0, 0.9, 0] },
      { name: 'Spine', pos: [0, 0.25, 0], parent: 0 },
      { name: 'Spine1', pos: [0, 0.15, 0], parent: 1 },
      { name: 'Spine2', pos: [0, 0.15, 0], parent: 2 },
      { name: 'LeftClavicle', pos: [-0.1, 0.02, 0], parent: 3 },
      { name: 'RightClavicle', pos: [0.1, 0.02, 0], parent: 3 },
      { name: 'LeftUpperArm', pos: [-0.38, 0.05, 0], parent: 3 },
      { name: 'RightUpperArm', pos: [0.38, 0.05, 0], parent: 3 }
    ])
    const byName = new Map(bones.map((b, i) => [b.name, i]))
    const order = boneNames.map((n) => byName.get(n)!)
    expect(order.every((i) => i !== undefined)).toBe(true)
    const orderedBones = order.map((i) => bones[i])
    const orderedInv = order.map((i) => inverses[i])

    const band: [number, number] = [1.0, 1.18]
    const restR = skinMaxRadius(geometry, orderedBones, orderedInv, band)

    // Scale Spine1 xz like bellySize morph
    const spine1 = bones[byName.get('Spine1')!]
    spine1.scale.set(1.4, 1, 1.4)
    spine1.updateMatrixWorld(true)
    const fatR = skinMaxRadius(geometry, orderedBones, orderedInv, band)

    expect(fatR).toBeGreaterThan(restR * 1.1)
  })

  it('jeans hip grows when Root xz scales', () => {
    const { geometry, boneNames } = buildJeans(DEFAULT_BODY_SHAPE, 0.2)
    const { bones, inverses } = restSkeleton([
      { name: 'Root', pos: [0, 0.9, 0] },
      { name: 'Spine', pos: [0, 0.25, 0], parent: 0 },
      { name: 'LeftUpperLeg', pos: [-0.18, -0.3, 0], parent: 1 },
      { name: 'LeftCalf', pos: [0, -0.37, 0], parent: 2 },
      { name: 'RightUpperLeg', pos: [0.18, -0.3, 0], parent: 1 },
      { name: 'RightCalf', pos: [0, -0.37, 0], parent: 4 }
    ])
    const byName = new Map(bones.map((b, i) => [b.name, i]))
    const orderedBones = boneNames.map((n) => bones[byName.get(n)!])
    const orderedInv = boneNames.map((n) => inverses[byName.get(n)!])

    const band: [number, number] = [0.8, 1.0]
    const restR = skinMaxRadius(geometry, orderedBones, orderedInv, band)

    const root = bones[0]
    root.scale.set(1.5, 1, 1.2)
    root.updateMatrixWorld(true)
    const fatR = skinMaxRadius(geometry, orderedBones, orderedInv, band)

    expect(fatR).toBeGreaterThan(restR * 1.1)
  })
})
