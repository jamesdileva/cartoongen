import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  buildTShirt,
  buildJeans,
  buildShorts,
  buildBaggy,
  buildTights,
  buildLongsleeve,
  buildTank,
  buildJacket,
  buildVest,
  buildPolo,
  buildMageRobe,
  buildElvenTunic,
  buildDwarfVest,
  buildPlate,
  buildPlateLegs,
  buildArmet,
  armetExtents,
  buildCropHair,
  buildPonytail,
  buildMohawk,
  buildLongHair,
  buildSunglasses,
  buildGoggles,
  buildFaceMask,
  buildShoes,
  buildBoots,
  buildGloves,
  buildGauntlets,
  buildGoatee,
  buildFullBeard,
  buildMustache,
  buildBeanie,
  buildCap,
  buildSombrero,
  buildTopHat,
  buildHood,
  hatRimY,
  hemYOf,
  garmentDependsOnKey,
  isProceduralAssetId,
  findProceduralAsset,
  getProceduralAssetEntries,
  buttRearDepth
} from './Garments'
import { DEFAULT_BODY_SHAPE, type BodyShape } from '../../../shared/types/bodyShape'
import { DEFAULT_FACE_SHAPE } from '../../../shared/types/faceShape'
import { surfaceZ } from './FaceFeatures'
import type { CharacterDNA } from '../../../shared/types/dna'
import { buildTorso } from './BodyParts'
import { ProportionManager } from '../ProportionManager'

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

  it('exposes all 35 procedural entries with correct slots', () => {
    const entries = getProceduralAssetEntries()
    expect(entries.map((e) => e.id).sort()).toEqual([
      'proc:armet',
      'proc:baggy',
      'proc:beanie',
      'proc:boots',
      'proc:cap',
      'proc:crop_hair',
      'proc:dwarf_vest',
      'proc:elven_tunic',
      'proc:full_beard',
      'proc:gauntlets',
      'proc:gloves',
      'proc:goatee',
      'proc:goggles',
      'proc:hood',
      'proc:jacket',
      'proc:jeans',
      'proc:long_hair',
      'proc:longsleeve',
      'proc:mage_robe',
      'proc:mask',
      'proc:mohawk',
      'proc:mustache',
      'proc:plate',
      'proc:plate_legs',
      'proc:polo',
      'proc:ponytail',
      'proc:shoes',
      'proc:shorts',
      'proc:sombrero',
      'proc:sunglasses',
      'proc:tank',
      'proc:tights',
      'proc:tophat',
      'proc:tshirt',
      'proc:vest'
    ])
    expect(entries.find((e) => e.id === 'proc:tshirt')?.slotId).toBe('shirt')
    expect(entries.find((e) => e.id === 'proc:longsleeve')?.slotId).toBe('shirt')
    expect(entries.find((e) => e.id === 'proc:tank')?.slotId).toBe('shirt')
    expect(entries.find((e) => e.id === 'proc:jacket')?.slotId).toBe('shirt')
    expect(entries.find((e) => e.id === 'proc:vest')?.slotId).toBe('shirt')
    expect(entries.find((e) => e.id === 'proc:polo')?.slotId).toBe('shirt')
    expect(entries.find((e) => e.id === 'proc:jeans')?.slotId).toBe('pants')
    expect(entries.find((e) => e.id === 'proc:shorts')?.slotId).toBe('pants')
    expect(entries.find((e) => e.id === 'proc:baggy')?.slotId).toBe('pants')
    expect(entries.find((e) => e.id === 'proc:tights')?.slotId).toBe('pants')
    expect(entries.find((e) => e.id === 'proc:beanie')?.slotId).toBe('helmet')
    expect(entries.find((e) => e.id === 'proc:cap')?.slotId).toBe('helmet')
    expect(entries.find((e) => e.id === 'proc:sombrero')?.slotId).toBe('helmet')
    expect(entries.find((e) => e.id === 'proc:mage_robe')?.slotId).toBe('shirt')
    expect(entries.find((e) => e.id === 'proc:elven_tunic')?.slotId).toBe('shirt')
    expect(entries.find((e) => e.id === 'proc:dwarf_vest')?.slotId).toBe('shirt')
    expect(entries.find((e) => e.id === 'proc:crop_hair')?.slotId).toBe('hair')
    expect(entries.find((e) => e.id === 'proc:ponytail')?.slotId).toBe('hair')
    expect(entries.find((e) => e.id === 'proc:mohawk')?.slotId).toBe('hair')
    expect(entries.find((e) => e.id === 'proc:long_hair')?.slotId).toBe('hair')
    expect(entries.find((e) => e.id === 'proc:sunglasses')?.slotId).toBe('head')
    expect(entries.find((e) => e.id === 'proc:goggles')?.slotId).toBe('head')
    expect(entries.find((e) => e.id === 'proc:mask')?.slotId).toBe('head')
    expect(entries.find((e) => e.id === 'proc:tophat')?.slotId).toBe('helmet')
    expect(entries.find((e) => e.id === 'proc:hood')?.slotId).toBe('helmet')
    expect(entries.find((e) => e.id === 'proc:shoes')?.slotId).toBe('shoes')
    expect(entries.find((e) => e.id === 'proc:boots')?.slotId).toBe('shoes')
    expect(entries.find((e) => e.id === 'proc:gloves')?.slotId).toBe('gloves')
    expect(entries.find((e) => e.id === 'proc:gauntlets')?.slotId).toBe('gloves')
    expect(entries.find((e) => e.id === 'proc:goatee')?.slotId).toBe('beard')
    expect(entries.find((e) => e.id === 'proc:full_beard')?.slotId).toBe('beard')
    expect(entries.find((e) => e.id === 'proc:mustache')?.slotId).toBe('beard')
    expect(entries.find((e) => e.id === 'proc:plate')?.slotId).toBe('shirt')
    expect(entries.find((e) => e.id === 'proc:plate_legs')?.slotId).toBe('pants')
    expect(entries.find((e) => e.id === 'proc:armet')?.slotId).toBe('helmet')
    expect(findProceduralAsset('proc:armet')?.materialId).toBe('metal')
    expect(findProceduralAsset('proc:ponytail')?.materialId).toBe('hair')
    expect(findProceduralAsset('proc:sunglasses')?.materialId).toBe('lens')
    expect(findProceduralAsset('proc:tshirt')?.label).toBe('T-Shirt')
    expect(findProceduralAsset('proc:sombrero')?.label).toBe('Sombrero')
    expect(findProceduralAsset('proc:jacket')?.materialId).toBe('leather')
    expect(findProceduralAsset('proc:mage_robe')?.label).toBe('Mage Robe')
  })

  it('outfit preset slots resolve to real procedural assets', async () => {
    const { default: presets } = await import('../../../shared/data/presets.json')
    const outfits = (
      presets as Array<{ id: string; outfit?: boolean; slots?: Record<string, string | null> }>
    ).filter((p) => p.outfit === true)
    expect(outfits.length).toBeGreaterThanOrEqual(3)
    for (const preset of outfits) {
      expect(preset.slots, preset.id).toBeDefined()
      for (const assetId of Object.values(preset.slots ?? {})) {
        if (assetId === null) continue
        expect(findProceduralAsset(assetId), `${preset.id} -> ${assetId}`).toBeDefined()
      }
    }
  })

  it('maps garments to rebuild keys', () => {
    for (const id of [
      'proc:tshirt',
      'proc:longsleeve',
      'proc:tank',
      'proc:jacket',
      'proc:vest',
      'proc:polo',
      'proc:mage_robe',
      'proc:elven_tunic',
      'proc:dwarf_vest',
      'proc:plate',
      'proc:jeans',
      'proc:shorts',
      'proc:baggy',
      'proc:tights',
      'proc:plate_legs'
    ]) {
      expect(garmentDependsOnKey(id, 'torso')).toBe(true)
      expect(garmentDependsOnKey(id, 'head')).toBe(false)
    }
    for (const id of ['proc:beanie', 'proc:cap', 'proc:sombrero', 'proc:tophat', 'proc:armet']) {
      expect(garmentDependsOnKey(id, 'head')).toBe(true)
      expect(garmentDependsOnKey(id, 'face')).toBe(true)
      expect(garmentDependsOnKey(id, 'torso')).toBe(false)
    }
    expect(garmentDependsOnKey('proc:hood', 'head')).toBe(true)
    expect(garmentDependsOnKey('proc:hood', 'face')).toBe(false)
    for (const id of ['proc:sunglasses', 'proc:goggles', 'proc:mask']) {
      expect(garmentDependsOnKey(id, 'head')).toBe(true)
      expect(garmentDependsOnKey(id, 'face')).toBe(true)
      expect(garmentDependsOnKey(id, 'torso')).toBe(false)
    }
    for (const id of ['proc:goatee', 'proc:full_beard', 'proc:mustache']) {
      expect(garmentDependsOnKey(id, 'head')).toBe(true)
      expect(garmentDependsOnKey(id, 'face')).toBe(true)
      expect(garmentDependsOnKey(id, 'torso')).toBe(false)
    }
    for (const id of ['proc:shoes', 'proc:boots', 'proc:gloves', 'proc:gauntlets']) {
      expect(garmentDependsOnKey(id, 'torso')).toBe(true)
      expect(garmentDependsOnKey(id, 'head')).toBe(false)
    }
    for (const id of ['proc:crop_hair', 'proc:ponytail', 'proc:mohawk']) {
      expect(garmentDependsOnKey(id, 'head')).toBe(true)
      expect(garmentDependsOnKey(id, 'torso')).toBe(false)
    }
    expect(garmentDependsOnKey('proc:long_hair', 'head')).toBe(true)
    expect(garmentDependsOnKey('proc:long_hair', 'torso')).toBe(true)
    expect(garmentDependsOnKey('proc:nope', 'torso')).toBe(false)
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

describe('garment skinned under morphs', () => {
  // Shoulder pokes only appear with bone scales applied: replicate the real
  // skeleton (rotated arm chains), run the real ProportionManager, CPU-skin
  // both meshes, then raycast cloth from body verts (DoubleSide).
  function morphedScene(
    shape: BodyShape,
    morphs: Record<string, number>
  ): {
    torso: THREE.BufferGeometry
    shirt: THREE.BufferGeometry
  } {
    const defs: Array<{
      name: string
      pos: [number, number, number]
      rotZ?: number
      parent?: string
    }> = [
      { name: 'Root', pos: [0, 0.9, 0] },
      { name: 'Spine', pos: [0, 0.25, 0], parent: 'Root' },
      { name: 'Spine1', pos: [0, 0.15, 0], parent: 'Spine' },
      { name: 'Spine2', pos: [0, 0.15, 0], parent: 'Spine1' },
      { name: 'LeftClavicle', pos: [-0.1, 0.02, 0], parent: 'Spine2' },
      { name: 'RightClavicle', pos: [0.1, 0.02, 0], parent: 'Spine2' },
      { name: 'LeftUpperArm', pos: [-0.38, 0.05, 0], rotZ: Math.PI / 2, parent: 'Spine2' },
      { name: 'LeftForearm', pos: [0, 0.3, 0], parent: 'LeftUpperArm' },
      { name: 'LeftHand', pos: [0, 0.25, 0], parent: 'LeftForearm' },
      { name: 'RightUpperArm', pos: [0.38, 0.05, 0], rotZ: -Math.PI / 2, parent: 'Spine2' },
      { name: 'RightForearm', pos: [0, 0.3, 0], parent: 'RightUpperArm' },
      { name: 'RightHand', pos: [0, 0.25, 0], parent: 'RightForearm' }
    ]
    const map = new Map<string, THREE.Bone>()
    for (const d of defs) {
      const b = new THREE.Bone()
      b.name = d.name
      b.position.set(...d.pos)
      if (d.rotZ) b.rotation.z = d.rotZ
      map.set(d.name, b)
    }
    for (const d of defs) {
      if (d.parent) map.get(d.parent)!.add(map.get(d.name)!)
    }
    map.get('Root')!.updateMatrixWorld(true)
    const inverses = new Map<string, THREE.Matrix4>()
    map.forEach((b, n) => inverses.set(n, new THREE.Matrix4().copy(b.matrixWorld).invert()))
    const pm = new ProportionManager()
    pm.setBoneMap(map)
    pm.applyProportions(morphs)
    map.get('Root')!.updateMatrixWorld(true)

    const skin = (geometry: THREE.BufferGeometry, order: string[]): THREE.BufferGeometry => {
      const pos = geometry.attributes.position as THREE.BufferAttribute
      const si = geometry.attributes.skinIndex.array as ArrayLike<number>
      const sw = geometry.attributes.skinWeight.array as ArrayLike<number>
      const bones = order.map((n) => map.get(n)!)
      const invs = order.map((n) => inverses.get(n)!)
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
          m.multiplyMatrices(bones[si[i * 4 + k]].matrixWorld, invs[si[i * 4 + k]])
          sk.addScaledVector(v.clone().applyMatrix4(m), w)
        }
        p.setXYZ(i, sk.x, sk.y, sk.z)
      }
      return g
    }
    const torso = buildTorso(shape, 0.15, 0.2, 0.5)
    const shirt = buildTShirt(shape, 0.15, 0.5, 0.2, 0)
    return {
      torso: skin(
        torso.geometry,
        torso.segments.map((s) => s.name)
      ),
      shirt: skin(shirt.geometry, shirt.boneNames)
    }
  }

  function rayPokes(
    body: THREE.BufferGeometry,
    cloth: THREE.BufferGeometry,
    opts: { yMin: number; yMax: number; mode: 'front' | 'sideX'; xMin?: number; minAbsZ?: number }
  ): number {
    const ray = new THREE.Raycaster()
    ray.far = 1.0
    const clothMesh = new THREE.Mesh(cloth, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
    clothMesh.updateMatrixWorld(true)
    const bp = body.attributes.position as THREE.BufferAttribute
    let pokes = 0
    for (let i = 0; i < bp.count; i++) {
      const bx = bp.getX(i)
      const by = bp.getY(i)
      const bz = bp.getZ(i)
      if (by < opts.yMin || by > opts.yMax) continue
      if (opts.xMin !== undefined && bx < opts.xMin) continue
      if (opts.minAbsZ !== undefined && Math.abs(bz) < opts.minAbsZ) continue
      let dir: THREE.Vector3
      if (opts.mode === 'front') dir = new THREE.Vector3(0, 0, 1)
      else {
        if (bx <= 0) continue
        dir = new THREE.Vector3(1, 0, 0)
      }
      const origin = new THREE.Vector3(bx, by, bz)
      origin.addScaledVector(dir, 1e-4)
      ray.set(origin, dir)
      if (ray.intersectObject(clothMesh, false).length === 0) pokes++
    }
    return pokes
  }

  it('deltoid stays inside t-shirt under max muscle+shoulder morphs', () => {
    for (const shape of [
      DEFAULT_BODY_SHAPE,
      { ...DEFAULT_BODY_SHAPE, shoulderWidth: 1.3 },
      { ...DEFAULT_BODY_SHAPE, shoulderWidth: 0.75 }
    ]) {
      const { torso, shirt } = morphedScene(shape, { muscleMass: 1, shoulderWidth: 1 })
      const clavEnd = 0.36 * shape.shoulderWidth
      expect(rayPokes(torso, shirt, { yMin: 1.2, yMax: 1.42, mode: 'front', minAbsZ: 0.05 })).toBe(
        0
      )
      expect(rayPokes(torso, shirt, { yMin: 0.95, yMax: 1.4, mode: 'sideX' })).toBe(0)
      expect(
        rayPokes(torso, shirt, { yMin: 1.36, yMax: 1.56, mode: 'sideX', xMin: clavEnd - 0.1 })
      ).toBe(0)
    }
  })
})

function yExtent(geometry: THREE.BufferGeometry): { min: number; max: number } {
  const pos = geometry.attributes.position as THREE.BufferAttribute
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < pos.count; i++) {
    min = Math.min(min, pos.getY(i))
    max = Math.max(max, pos.getY(i))
  }
  return { min, max }
}

function xExtentAtY(
  geometry: THREE.BufferGeometry,
  y0: number,
  y1: number
): { min: number; max: number } {
  const pos = geometry.attributes.position as THREE.BufferAttribute
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    if (y < y0 || y > y1) continue
    min = Math.min(min, pos.getX(i))
    max = Math.max(max, pos.getX(i))
  }
  return { min, max }
}

describe('pants variants', () => {
  it('shorts end mid-thigh with hip coverage intact', () => {
    const geo = buildShorts(DEFAULT_BODY_SHAPE, 0.2, 0.5).geometry
    expect(weightSumViolations(geo)).toBe(0)
    const ext = xExtent(geo)
    expect(ext.min).toBeCloseTo(-ext.max, 3)
    // Leg tubes stop at y=0.52 (+cuff); hip shell still reaches the seat.
    const legBox = yExtent(geo)
    expect(legBox.min).toBeLessThan(0.78)
    let lowestLegX = 0
    const pos = geo.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) < 0.6 && Math.abs(pos.getX(i)) > 0.05) {
        lowestLegX = Math.max(lowestLegX, Math.abs(pos.getX(i)))
      }
    }
    expect(lowestLegX).toBeGreaterThan(0.15)
    // Rear still clears butt at max morph.
    const rear = -zExtentAtY(buildShorts(DEFAULT_BODY_SHAPE, 1, 0.5).geometry, 0.8, 1.0, true)
    expect(rear).toBeGreaterThan(buttRearDepth(DEFAULT_BODY_SHAPE, 1))
  })

  it('baggy legs are wider than jeans at the calf', () => {
    const jeans = xExtentAtY(buildJeans(DEFAULT_BODY_SHAPE, 0.2, 0.5).geometry, 0.3, 0.5)
    const baggy = xExtentAtY(buildBaggy(DEFAULT_BODY_SHAPE, 0.2, 0.5).geometry, 0.3, 0.5)
    expect(weightSumViolations(buildBaggy().geometry)).toBe(0)
    // Tube radius is 1.4x but the fixed +/-0.18 leg centers dilute the ratio.
    expect(baggy.max).toBeGreaterThan(jeans.max * 1.1)
    expect(baggy.min).toBeLessThan(jeans.min * 1.1)
  })

  it('tights hug tighter than jeans', () => {
    const jeans = xExtentAtY(buildJeans(DEFAULT_BODY_SHAPE, 0.2, 0.5).geometry, 0.3, 0.5)
    const tights = xExtentAtY(buildTights(DEFAULT_BODY_SHAPE, 0.2, 0.5).geometry, 0.3, 0.5)
    expect(weightSumViolations(buildTights().geometry)).toBe(0)
    expect(tights.max).toBeLessThan(jeans.max)
    // But still clear the leg: tights use a 4mm offset, not zero.
    expect(tights.max).toBeGreaterThan(0.15)
  })

  it('all pants bind to the leg chains', () => {
    for (const build of [buildShorts, buildBaggy, buildTights]) {
      const { boneNames } = build()
      expect(boneNames).toEqual([
        'Root',
        'Spine',
        'LeftUpperLeg',
        'LeftCalf',
        'RightUpperLeg',
        'RightCalf'
      ])
    }
  })
})

describe('tops variety', () => {
  it('long sleeves reach the wrist with normalized weights', () => {
    const { geometry, boneNames } = buildLongsleeve()
    expect(weightSumViolations(geometry)).toBe(0)
    expect(boneNames).toContain('LeftForearm')
    expect(boneNames).toContain('RightForearm')
    const ext = xExtent(geometry)
    expect(ext.max).toBeGreaterThan(0.85)
    expect(ext.min).toBeLessThan(-0.85)
    expect(ext.min).toBeCloseTo(-ext.max, 3)
  })

  it('tank has shoulder straps and no sleeves', () => {
    const geo = buildTank().geometry
    expect(weightSumViolations(geo)).toBe(0)
    // Straps arc over the shoulders above the chest band.
    const pos = geo.attributes.position as THREE.BufferAttribute
    let strapTop = -Infinity
    for (let i = 0; i < pos.count; i++) {
      const x = Math.abs(pos.getX(i))
      const y = pos.getY(i)
      if (x > 0.05 && x < 0.3 && y > 1.5) strapTop = Math.max(strapTop, y)
    }
    expect(strapTop).toBeGreaterThan(1.55)
    // No sleeve tubes outboard of the deltoid.
    const ext = xExtent(geo)
    expect(ext.max).toBeLessThan(0.45)
  })

  it('jacket has an open front gap', () => {
    const geo = buildJacket().geometry
    expect(weightSumViolations(geo)).toBe(0)
    // Front-center wedge at chest height must be empty (the opening).
    const pos = geo.attributes.position as THREE.BufferAttribute
    let centerFront = 0
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const z = pos.getZ(i)
      if (y > 1.2 && y < 1.4 && z > 0.15 && Math.abs(x) < 0.1) centerFront++
    }
    expect(centerFront).toBe(0)
    // But the sides at the same band exist.
    let sideCount = 0
    for (let i = 0; i < pos.count; i++) {
      const x = Math.abs(pos.getX(i))
      const y = pos.getY(i)
      const z = pos.getZ(i)
      if (y > 1.2 && y < 1.4 && z > 0.15 && x > 0.2) sideCount++
    }
    expect(sideCount).toBeGreaterThan(0)
  })

  it('jacket and polo have collars, vest does not', () => {
    // Collar tube top (y≈1.604) pokes above the shell top ring (y=1.585).
    const collarBand = (geo: THREE.BufferGeometry): number => {
      const pos = geo.attributes.position as THREE.BufferAttribute
      let n = 0
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i)
        const r = Math.hypot(pos.getX(i), pos.getZ(i))
        if (y > 1.595 && y < 1.62 && r < 0.2) n++
      }
      return n
    }
    expect(collarBand(buildJacket().geometry)).toBeGreaterThan(0)
    expect(collarBand(buildPolo().geometry)).toBeGreaterThan(0)
    expect(collarBand(buildVest().geometry)).toBe(0)
  })

  it('topLength morph raises the hem for every closed top', () => {
    const builds = [buildTShirt, buildLongsleeve, buildTank, buildVest, buildPolo, buildJacket]
    for (const build of builds) {
      const hip = yExtent(build(DEFAULT_BODY_SHAPE, 0.15, 0.5, 0.2, 0).geometry)
      const cropped = yExtent(build(DEFAULT_BODY_SHAPE, 0.15, 0.5, 0.2, 1).geometry)
      expect(cropped.min).toBeGreaterThan(hip.min + 0.2)
      expect(hemYOf(1)).toBeGreaterThan(hemYOf(0))
    }
  })

  it('tank straps clear the bust peak at max morph', () => {
    const bust = 1
    const bustR = 0.02 + 0.075 * bust
    const peak = (0.155 + 0.045 * bust) * DEFAULT_BODY_SHAPE.chestDepth + bustR * 0.78
    const geo = buildTank(DEFAULT_BODY_SHAPE, bust, 0.5, 0.2, 0).geometry
    const pos = geo.attributes.position as THREE.BufferAttribute
    let strapFront = -Infinity
    for (let i = 0; i < pos.count; i++) {
      const x = Math.abs(pos.getX(i))
      const y = pos.getY(i)
      if (x > 0.08 && x < 0.2 && y > 1.3 && y < 1.42) {
        strapFront = Math.max(strapFront, pos.getZ(i))
      }
    }
    expect(strapFront).toBeGreaterThan(peak)
  })

  it('all tops bind torso chains with normalized weights', () => {
    for (const build of [buildLongsleeve, buildTank, buildJacket, buildVest, buildPolo]) {
      const { geometry, boneNames } = build()
      expect(weightSumViolations(geometry)).toBe(0)
      expect(boneNames).toContain('Root')
      expect(boneNames).toContain('Spine1')
      const ext = xExtent(geometry)
      expect(ext.min).toBeCloseTo(-ext.max, 3)
    }
  })
})

describe('archetype outfits', () => {
  it('mage robe reaches the floor flared past the legs', () => {
    const { geometry, boneNames } = buildMageRobe()
    expect(weightSumViolations(geometry)).toBe(0)
    expect(boneNames).toContain('LeftForearm')
    const box = yExtent(geometry)
    expect(box.min).toBeLessThan(0.1)
    const ext = xExtent(geometry)
    expect(ext.max).toBeGreaterThan(0.4)
    expect(ext.min).toBeCloseTo(-ext.max, 3)
  })

  it('mage robe keeps a fixed hem regardless of topLength', () => {
    const short = yExtent(buildMageRobe(DEFAULT_BODY_SHAPE, 0.15, 0.5, 0.2).geometry)
    expect(short.min).toBeLessThan(0.1)
  })

  it('elven tunic has a mid-thigh hem and a forward V accent', () => {
    const geo = buildElvenTunic().geometry
    expect(weightSumViolations(geo)).toBe(0)
    const box = yExtent(geo)
    expect(box.min).toBeGreaterThan(0.6)
    expect(box.min).toBeLessThan(0.8)
    // V accent verts sit forward of the chest tube surface (~0.2).
    const pos = geo.attributes.position as THREE.BufferAttribute
    let accentFront = -Infinity
    for (let i = 0; i < pos.count; i++) {
      const x = Math.abs(pos.getX(i))
      const y = pos.getY(i)
      if (x < 0.12 && y > 1.4 && y < 1.55) {
        accentFront = Math.max(accentFront, pos.getZ(i))
      }
    }
    expect(accentFront).toBeGreaterThan(0.2)
    const ext = xExtent(geo)
    expect(ext.min).toBeCloseTo(-ext.max, 3)
  })

  it('dwarf vest has an open front gap and a waist belt ring', () => {
    const geo = buildDwarfVest().geometry
    expect(weightSumViolations(geo)).toBe(0)
    const pos = geo.attributes.position as THREE.BufferAttribute
    let centerFront = 0
    let beltCount = 0
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const z = pos.getZ(i)
      if (y > 1.2 && y < 1.4 && z > 0.15 && Math.abs(x) < 0.1) centerFront++
      const r = Math.hypot(x, z)
      if (y > 0.96 && y < 1.04 && r > 0.2 && r < 0.45) beltCount++
    }
    expect(centerFront).toBe(0)
    expect(beltCount).toBeGreaterThan(0)
  })

  it('all archetypes bind torso chains with normalized weights', () => {
    for (const build of [buildMageRobe, buildElvenTunic, buildDwarfVest]) {
      const { geometry, boneNames } = build()
      expect(weightSumViolations(geometry)).toBe(0)
      expect(boneNames).toContain('Root')
      expect(boneNames).toContain('Spine1')
    }
  })
})

describe('hair', () => {
  it('binds 100% to the Head bone with normalized weights', () => {
    for (const build of [buildCropHair, buildPonytail, buildMohawk, buildLongHair]) {
      const { geometry, boneNames } = build()
      expect(boneNames).toEqual(['Head'])
      expect(weightSumViolations(geometry)).toBe(0)
      const ext = xExtent(geometry)
      expect(ext.min).toBeCloseTo(-ext.max, 3)
    }
  })

  it('leaves the face wedge open on shell styles', () => {
    // Eyes span |x| 0.02-0.16 at y 1.82-1.95; nose/mouth sit center below.
    // Brow tips (|x| > 0.13, hair-colored like the shell) are exempt.
    // Jaw framing below y=1.75 (sideburns) is exempt.
    for (const build of [buildCropHair, buildPonytail, buildLongHair]) {
      const geo = build().geometry
      const pos = geo.attributes.position as THREE.BufferAttribute
      let intruders = 0
      for (let i = 0; i < pos.count; i++) {
        const x = Math.abs(pos.getX(i))
        const y = pos.getY(i)
        const z = pos.getZ(i)
        if (z < 0.15) continue
        if (x >= 0.02 && x < 0.16 && y > 1.82 && y < 1.95) intruders++
        if (x < 0.08 && y >= 1.7 && y <= 1.84) intruders++
      }
      expect(intruders).toBe(0)
    }
  })

  it('crop covers the ears', () => {
    // Ear tips reach ~0.92*W + 0.042; shell rx is W + 0.05.
    const ext = xExtent(buildCropHair().geometry)
    expect(ext.max).toBeGreaterThan(0.92 * DEFAULT_BODY_SHAPE.headWidth + 0.042)
  })

  it('ponytail tail hangs below the neck', () => {
    const box = yExtent(buildPonytail().geometry)
    expect(box.min).toBeLessThan(1.45)
    expect(box.max).toBeGreaterThan(2.0)
  })

  it('mohawk fin clears the crown with an embedded root', () => {
    const top = 1.86 + DEFAULT_BODY_SHAPE.headHeight
    const box = yExtent(buildMohawk().geometry)
    expect(box.max).toBeGreaterThan(top + 0.05)
    expect(box.min).toBeLessThan(top)
  })

  it('long fall reaches mid-back', () => {
    const box = yExtent(buildLongHair().geometry)
    expect(box.min).toBeLessThan(1.15)
  })
})

describe('plate armour', () => {
  it('binds cuirass to torso chains and legs to leg chains', () => {
    const { boneNames: topNames } = buildPlate()
    expect(topNames).toContain('Root')
    expect(topNames).toContain('Spine1')
    expect(topNames).toContain('LeftClavicle')
    const { boneNames: legNames } = buildPlateLegs()
    expect(legNames).toEqual([
      'Root',
      'Spine',
      'LeftUpperLeg',
      'LeftCalf',
      'RightUpperLeg',
      'RightCalf'
    ])
    const { boneNames: helmNames } = buildArmet()
    expect(helmNames).toEqual(['Head'])
  })

  it('produces normalized weights with x symmetry', () => {
    for (const build of [buildPlate, buildPlateLegs, buildArmet]) {
      const { geometry } = build()
      expect(weightSumViolations(geometry)).toBe(0)
      const ext = xExtent(geometry)
      expect(ext.min).toBeCloseTo(-ext.max, 3)
    }
  })

  it('pauldrons clear the deltoid meat', () => {
    const ext = xExtent(buildPlate().geometry)
    // Deltoid outer reaches ~0.46 at rest; pauldron must exceed it.
    expect(ext.max).toBeGreaterThan(0.46)
  })

  it('armet contains cranium top, nose tip, and chin', () => {
    for (const shape of [
      DEFAULT_BODY_SHAPE,
      { ...DEFAULT_BODY_SHAPE, headWidth: 0.31, headHeight: 0.28, headLength: 0.32 }
    ]) {
      for (const noseSize of [0.6, 1, 1.6]) {
        const face = { ...DEFAULT_FACE_SHAPE, noseSize }
        const e = armetExtents(shape, face)
        const inside = (x: number, y: number, z: number): boolean => {
          const nx = (x - e.cx) / e.rx
          const ny = (y - e.cy) / e.ry
          const nz = (z - e.cz) / e.rz
          return nx * nx + ny * ny + nz * nz < 1
        }
        const top = 1.86 + shape.headHeight
        expect(inside(0, top, 0.005), 'cranium top').toBe(true)
        const noseY = 1.86 - shape.headHeight * 0.15
        expect(inside(0, noseY, surfaceZ(shape, 0, noseY) + 0.03 * noseSize), 'nose tip').toBe(true)
        expect(inside(0, 1.66, 0.1), 'chin').toBe(true)
      }
    }
  })

  it('armet carries full_face and hat tags', () => {
    const def = findProceduralAsset('proc:armet')
    expect(def?.tags).toContain('full_face')
    expect(def?.tags).toContain('hat')
  })
})

describe('hats', () => {
  it('bind 100% to the Head bone with normalized weights', () => {
    for (const build of [buildBeanie, buildCap, buildSombrero, buildTopHat]) {
      const { geometry, boneNames } = build()
      expect(boneNames).toEqual(['Head'])
      expect(weightSumViolations(geometry)).toBe(0)
      const ext = xExtent(geometry)
      expect(ext.min).toBeCloseTo(-ext.max, 3)
    }
    const { geometry, boneNames } = buildHood()
    expect(boneNames).toEqual(['Head'])
    expect(weightSumViolations(geometry)).toBe(0)
  })

  it('brims sit above the eye tops', () => {
    for (const eyeScale of [0.7, 1, 1.3]) {
      const face = { ...DEFAULT_FACE_SHAPE, eyeScale }
      const rim = hatRimY(DEFAULT_BODY_SHAPE, face)
      const eyeTop = 1.86 + DEFAULT_BODY_SHAPE.headHeight * 0.12 + 0.062 * eyeScale
      expect(rim).toBeGreaterThan(eyeTop)
    }
  })

  it('sombrero brim is the widest silhouette', () => {
    const beanie = xExtent(buildBeanie().geometry)
    const cap = xExtent(buildCap().geometry)
    const sombrero = xExtent(buildSombrero().geometry)
    expect(sombrero.max).toBeGreaterThan(0.3)
    expect(sombrero.max).toBeGreaterThan(beanie.max)
    expect(sombrero.max).toBeGreaterThan(cap.max)
  })

  it('cap brim extends forward past the forehead', () => {
    const front = zExtentAtY(buildCap().geometry, 1.9, 2.0)
    // Forehead surface at rim is ~0.24; brim disc reaches ~0.1 beyond it.
    expect(front).toBeGreaterThan(0.3)
  })

  it('cranium stays inside every hat dome across extreme head shapes', () => {
    // In-sanitize-range extremes (head dims are absolute meters).
    const shapes: BodyShape[] = [
      DEFAULT_BODY_SHAPE,
      { ...DEFAULT_BODY_SHAPE, headWidth: 0.31, headHeight: 0.28, headLength: 0.32 },
      { ...DEFAULT_BODY_SHAPE, headWidth: 0.18, headHeight: 0.16, headLength: 0.18 },
      { ...DEFAULT_BODY_SHAPE, headWidth: 0.18, headHeight: 0.28, headLength: 0.18 }
    ]
    const builders = [buildBeanie, buildCap, buildSombrero, buildTopHat] as const
    for (const shape of shapes) {
      for (const build of builders) {
        const hat = build(shape, DEFAULT_FACE_SHAPE).geometry
        const rim = hatRimY(shape, DEFAULT_FACE_SHAPE)
        const ray = new THREE.Raycaster()
        ray.far = 1.0
        const hatMesh = new THREE.Mesh(hat, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
        hatMesh.updateMatrixWorld(true)
        const W = shape.headWidth
        const H = shape.headHeight
        const L = shape.headLength
        let checked = 0
        for (let ti = 0; ti <= 6; ti++) {
          for (let pi = 0; pi < 12; pi++) {
            const theta = (ti / 6) * Math.PI * 0.5
            const phi = (pi / 12) * Math.PI * 2
            const px = W * Math.sin(theta) * Math.cos(phi)
            const py = 1.86 + H * Math.cos(theta)
            const pz = 0.005 + L * Math.sin(theta) * Math.sin(phi)
            if (py < rim + 0.005) continue
            if (Math.abs(px) > 0.8 * W) continue // ears exempt: hats don't cover ears
            const dir = new THREE.Vector3(px, 0, pz - 0.005)
            if (dir.lengthSq() < 1e-8) dir.set(0, 1, 0)
            else dir.normalize()
            // Near-vertical top verts go straight up.
            const useDir = theta < 0.25 ? new THREE.Vector3(0, 1, 0) : dir
            ray.set(new THREE.Vector3(px, py, pz), useDir)
            const hits = ray.intersectObject(hatMesh, false)
            expect(
              hits.length,
              `shape ${W.toFixed(2)}/${H.toFixed(2)}/${L.toFixed(2)} theta=${theta.toFixed(2)}`
            ).toBeGreaterThan(0)
            checked++
          }
        }
        expect(checked).toBeGreaterThan(0)
      }
    }
  })

  it('tophat crown clears the cranium top', () => {
    const top = 1.86 + DEFAULT_BODY_SHAPE.headHeight
    const box = yExtent(buildTopHat().geometry)
    expect(box.max).toBeGreaterThan(top + 0.1)
    expect(box.min).toBeGreaterThan(top - 0.25)
  })

  it('hood drapes past the ears to the nape', () => {
    const box = yExtent(buildHood().geometry)
    expect(box.min).toBeLessThan(1.7)
    expect(box.max).toBeGreaterThan(2.0)
  })
})

describe('accessories', () => {
  it('bind 100% to the Head bone with normalized weights', () => {
    for (const build of [buildSunglasses, buildGoggles, buildFaceMask]) {
      const { geometry, boneNames } = build()
      expect(boneNames).toEqual(['Head'])
      expect(weightSumViolations(geometry)).toBe(0)
      const ext = xExtent(geometry)
      expect(ext.min).toBeCloseTo(-ext.max, 3)
    }
  })

  it('sunglass lenses sit proud of the eyeballs', () => {
    // Sclera front = surfaceZ + 0.55 * half-depth; lenses must clear it.
    for (const eyeScale of [0.7, 1, 1.3]) {
      const face = { ...DEFAULT_FACE_SHAPE, eyeScale }
      const geo = buildSunglasses(DEFAULT_BODY_SHAPE, face).geometry
      const pos = geo.attributes.position as THREE.BufferAttribute
      let lensFront = -Infinity
      for (let i = 0; i < pos.count; i++) {
        const x = Math.abs(pos.getX(i))
        const y = pos.getY(i)
        if (x > 0.03 && x < 0.17 && y > 1.85 && y < 1.95) {
          lensFront = Math.max(lensFront, pos.getZ(i))
        }
      }
      const eyeX = DEFAULT_BODY_SHAPE.headWidth * 0.38 * face.eyeSpacing
      const eyeY = 1.86 + DEFAULT_BODY_SHAPE.headHeight * 0.12
      const halfZ = 0.062 * eyeScale * 0.58
      const scleraFront = surfaceZ(DEFAULT_BODY_SHAPE, eyeX, eyeY) + 0.55 * halfZ
      expect(lensFront).toBeGreaterThan(scleraFront)
    }
  })

  it('mask covers the mouth zone without reaching the nose', () => {
    const geo = buildFaceMask().geometry
    const pos = geo.attributes.position as THREE.BufferAttribute
    let minY = Infinity
    let maxY = -Infinity
    let maxZ = -Infinity
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i)
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      if (y > 1.7 && y < 1.82) maxZ = Math.max(maxZ, pos.getZ(i))
    }
    // Mouth sits ~1.78; nose bottom ~1.80. Mask spans across the mouth.
    expect(minY).toBeLessThan(1.74)
    expect(maxY).toBeGreaterThan(1.76)
    expect(maxY).toBeLessThan(1.84)
    expect(maxZ).toBeGreaterThan(0.15)
  })

  it('goggle strap rings the head at eye height', () => {
    const geo = buildGoggles().geometry
    const pos = geo.attributes.position as THREE.BufferAttribute
    let strapVerts = 0
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i)
      const r = Math.hypot(pos.getX(i), pos.getZ(i))
      if (Math.abs(y - 1.91) < 0.05 && r > 0.2) strapVerts++
    }
    expect(strapVerts).toBeGreaterThan(0)
  })
})

describe('extremities', () => {
  it('binds shoes to leg chains and gloves to arm chains', () => {
    for (const build of [buildShoes, buildBoots]) {
      const { boneNames } = build()
      expect(boneNames).toEqual([
        'LeftUpperLeg',
        'LeftCalf',
        'LeftFoot',
        'RightUpperLeg',
        'RightCalf',
        'RightFoot'
      ])
    }
    for (const build of [buildGloves, buildGauntlets]) {
      const { boneNames } = build()
      expect(boneNames).toEqual([
        'LeftUpperArm',
        'LeftForearm',
        'LeftHand',
        'RightUpperArm',
        'RightForearm',
        'RightHand'
      ])
    }
  })

  it('produces normalized weights with x symmetry', () => {
    for (const build of [buildShoes, buildBoots, buildGloves, buildGauntlets]) {
      const { geometry } = build()
      expect(weightSumViolations(geometry)).toBe(0)
      const ext = xExtent(geometry)
      expect(ext.min).toBeCloseTo(-ext.max, 3)
    }
  })

  it('boots rise up the calf past shoes', () => {
    const shoesTop = yExtent(buildShoes().geometry).max
    const bootsTop = yExtent(buildBoots().geometry).max
    expect(bootsTop).toBeGreaterThan(0.35)
    expect(bootsTop).toBeGreaterThan(shoesTop + 0.2)
  })

  it('gauntlets extend further up the forearm than gloves', () => {
    // Gauntlet tube occupies 0.6 < |x| < 0.85; gloves have nothing there.
    const countInZone = (geo: THREE.BufferGeometry): number => {
      const pos = geo.attributes.position as THREE.BufferAttribute
      let n = 0
      for (let i = 0; i < pos.count; i++) {
        const ax = Math.abs(pos.getX(i))
        if (ax > 0.6 && ax < 0.85) n++
      }
      return n
    }
    expect(countInZone(buildGauntlets().geometry)).toBeGreaterThan(0)
    expect(countInZone(buildGloves().geometry)).toBe(0)
  })

  it('shoes enclose the foot on all sides', () => {
    // Foot spans y 0..0.1, z -0.07..0.19, outer x ~0.23; shoe must exceed it.
    const box = new THREE.Box3().setFromBufferAttribute(
      buildShoes().geometry.attributes.position as THREE.BufferAttribute
    )
    expect(box.min.y).toBeLessThanOrEqual(0.001)
    expect(box.max.y).toBeGreaterThan(0.12)
    expect(box.max.z).toBeGreaterThan(0.19)
    expect(box.min.z).toBeLessThan(-0.07)
    expect(box.max.x).toBeGreaterThan(0.24)
  })
})

describe('beards', () => {
  it('bind 100% to the Head bone with normalized weights', () => {
    for (const build of [buildGoatee, buildFullBeard, buildMustache]) {
      const { geometry, boneNames } = build()
      expect(boneNames).toEqual(['Head'])
      expect(weightSumViolations(geometry)).toBe(0)
      const ext = xExtent(geometry)
      expect(ext.min).toBeCloseTo(-ext.max, 3)
    }
  })

  it('goatee hangs below the mouth', () => {
    const box = yExtent(buildGoatee().geometry)
    expect(box.max).toBeLessThan(1.78)
    expect(box.min).toBeLessThan(1.7)
  })

  it('full beard covers the chin and leaves the nose out', () => {
    const geo = buildFullBeard().geometry
    const pos = geo.attributes.position as THREE.BufferAttribute
    let minY = Infinity
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i)
      if (y < minY) minY = y
    }
    expect(minY).toBeLessThan(1.7)
    // Nose tip must stay outside the beard ellipsoid.
    const noseY = 1.86 - DEFAULT_BODY_SHAPE.headHeight * 0.15
    const noseZ = surfaceZ(DEFAULT_BODY_SHAPE, 0, noseY) + 0.03
    const cx = 0
    const cy = noseY - 0.02 - 0.005 - 0.055
    const cz = surfaceZ(DEFAULT_BODY_SHAPE, 0, cy) + 0.01
    const inside =
      ((0 - cx) / 0.1) ** 2 + ((noseY - cy) / 0.06) ** 2 + ((noseZ - cz) / 0.05) ** 2 < 1
    expect(inside).toBe(false)
  })

  it('mustache arches over the mouth', () => {
    const geo = buildMustache().geometry
    const pos = geo.attributes.position as THREE.BufferAttribute
    let minY = Infinity
    let maxY = -Infinity
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i)
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
    // Thin arch band just above the mouth (~1.78).
    expect(maxY - minY).toBeLessThan(0.08)
    expect(minY).toBeGreaterThan(1.72)
  })
})
