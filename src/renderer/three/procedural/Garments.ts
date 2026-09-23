import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { makeSweep } from './GeometryKernel'
import { applySkinAttributes, computeSkinBindings, type BoneSegment } from './SkinWeights'
import { torsoProfile } from './BodyParts'
import { DEFAULT_BODY_SHAPE, type BodyShape } from '../../../shared/types/bodyShape'
import type { AssetEntry } from '../../../shared/types/asset'
import type { CharacterDNA } from '../../../shared/types/dna'
import { sanitizeBodyShape } from '../../../shared/types/bodyShape'

/** Radius offset (meters) from the body surface so cloth does not z-fight skin. */
const CLOTH_OFFSET = 0.01

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

export function isProceduralAssetId(id: string): boolean {
  return id.startsWith('proc:')
}

export interface GarmentBuildResult {
  geometry: THREE.BufferGeometry
  boneNames: string[]
}

const BUST_DEFAULT = 0.15
const BUTT_DEFAULT = 0.2

function bellyScaleOf(belly: number): number {
  return 0.75 + belly * 0.6
}

/**
 * Torso-hugging shell offset outside the body surface, with short
 * sleeve stubs over the upper arms. Clearance accounts for the pelvis
 * ellipsoid (0.32 * hipWidth) so hips never poke through the hem.
 */
export function buildTShirt(
  shape: BodyShape = DEFAULT_BODY_SHAPE,
  bust = BUST_DEFAULT,
  belly = 0.5
): GarmentBuildResult {
  const bellyScale = bellyScaleOf(belly)
  const bustR = 0.02 + 0.075 * bust
  const bustFront =
    (0.155 + 0.045 * bust) * shape.chestDepth + bustR * 0.78
  // Bust peaks sit off-center (x ≈ ±(0.085+0.03*bust)). On an elliptical
  // ring the z at that x is reduced, so deepen the ring until the peak clears.
  const bustX = 0.085 + 0.03 * bust
  const pelvisHalfW = 0.32 * shape.hipWidth + CLOTH_OFFSET
  const chestHalfW = 0.305 * shape.shoulderWidth + CLOTH_OFFSET
  const ellipseAtBust = Math.sqrt(
    Math.max(1e-4, 1 - Math.min(0.95, (bustX / chestHalfW) ** 2))
  )
  const chestHalfDNeeded = (bustFront + CLOTH_OFFSET) / ellipseAtBust

  const stations = torsoProfile(shape)
    .filter((st) => st.y >= 0.96 && st.y <= 1.585)
    .map((st) => {
      const isWaist = st.y >= 1.0 && st.y <= 1.18
      const isChest = st.y >= 1.2 && st.y <= 1.4
      // Below the ribs the hem must clear the pelvis, not just the waist tube.
      const isHip = st.y <= 1.05
      const halfW = Math.max(
        st.w * (isWaist ? bellyScale : 1) + CLOTH_OFFSET,
        isHip ? pelvisHalfW : 0
      )
      let halfD = st.d * (isWaist ? bellyScale : 1) + CLOTH_OFFSET
      if (isChest) halfD = Math.max(halfD, chestHalfDNeeded)
      if (isHip) halfD = Math.max(halfD, 0.23 * shape.hipWidth + CLOTH_OFFSET)
      return {
        center: [0, st.y, 0] as [number, number, number],
        width: halfW * 2,
        height: halfD * 2
      }
    })

  // Hem sits on the pelvis band so the shirt never floats above the hips.
  if (stations.length > 0 && stations[0].center[1] > 0.9) {
    stations.unshift({
      center: [0, 0.9, 0],
      width: pelvisHalfW * 2,
      height: (0.23 * shape.hipWidth + CLOTH_OFFSET) * 2
    })
  }

  const body = makeSweep(stations, 20)

  const sleeveLen = 0.58
  const armStart = 0.34
  const sleeves: THREE.BufferGeometry[] = []
  for (const side of [-1, 1] as const) {
    sleeves.push(
      makeSweep(
        [
          {
            center: [side * armStart, 1.5, 0],
            width: 0.15 + CLOTH_OFFSET * 2,
            height: 0.15 + CLOTH_OFFSET * 2
          },
          {
            center: [side * 0.46, 1.495, 0],
            width: 0.14 + CLOTH_OFFSET * 2,
            height: 0.14 + CLOTH_OFFSET * 2
          },
          {
            center: [side * sleeveLen, 1.495, 0],
            width: 0.13 + CLOTH_OFFSET * 2,
            height: 0.13 + CLOTH_OFFSET * 2
          }
        ],
        14,
        false,
        true
      )
    )
  }

  const merged = mergeGeometries([body, ...sleeves])
  if (!merged) {
    throw new Error('buildTShirt: mergeGeometries returned null')
  }

  const clavEnd = 0.36 * shape.shoulderWidth
  const segments: BoneSegment[] = [
    { name: 'Root', start: [0, 0.86, 0], end: [0, 1.15, 0] },
    { name: 'Spine', start: [0, 1.15, 0], end: [0, 1.3, 0] },
    { name: 'Spine1', start: [0, 1.3, 0], end: [0, 1.45, 0] },
    { name: 'Spine2', start: [0, 1.45, 0], end: [0, 1.6, 0] },
    {
      name: 'LeftClavicle',
      start: [-0.1, 1.47, 0],
      end: [-(clavEnd + 0.02), 1.46, 0]
    },
    {
      name: 'RightClavicle',
      start: [0.1, 1.47, 0],
      end: [clavEnd + 0.02, 1.46, 0]
    },
    { name: 'LeftUpperArm', start: [-0.36, 1.5, 0], end: [-0.6, 1.5, 0] },
    { name: 'RightUpperArm', start: [0.36, 1.5, 0], end: [0.6, 1.5, 0] }
  ]

  const binding = computeSkinBindings(merged.attributes.position.array as Float32Array, segments)
  applySkinAttributes(merged, binding)

  return {
    geometry: merged,
    boneNames: segments.map((s) => s.name)
  }
}

/**
 * Hip shell + two leg tubes down to the ankle. Hip shell clears the pelvis
 * ellipsoid (0.32 * hipWidth) and butt rear projection so skin never pokes
 * through at the sides or back.
 */
export function buildJeans(
  shape: BodyShape = DEFAULT_BODY_SHAPE,
  butt = BUTT_DEFAULT
): GarmentBuildResult {
  const pelvisHalfW = 0.32 * shape.hipWidth + CLOTH_OFFSET
  // Butt ellipsoid rear from buildTorso: center -(0.13+0.055*butt), r ≈ 0.055*hipWidth+0.065*butt
  const buttRear =
    0.13 + 0.055 * butt + 0.055 * shape.hipWidth + 0.065 * butt
  const hipHalfD = Math.max(0.215, buttRear) + CLOTH_OFFSET
  const waistHalfW = Math.max(0.28 * shape.waistTaper, pelvisHalfW * 0.92) + CLOTH_OFFSET

  const hip = makeSweep(
    [
      {
        center: [0, 1.06, 0],
        width: waistHalfW * 2,
        height: (0.2 + CLOTH_OFFSET + 0.02 * butt) * 2
      },
      {
        center: [0, 0.96, 0],
        width: pelvisHalfW * 2,
        height: hipHalfD * 2
      },
      {
        center: [0, 0.88, 0],
        width: pelvisHalfW * 2,
        height: hipHalfD * 2
      },
      {
        center: [0, 0.8, 0],
        width: (0.3 * shape.hipWidth + CLOTH_OFFSET) * 2,
        height: hipHalfD * 2 * 0.92
      }
    ],
    20
  )

  const legs: THREE.BufferGeometry[] = []
  for (const side of [-1, 1] as const) {
    const s = side
    legs.push(
      makeSweep(
        [
          { center: [s * 0.18, 0.88, 0], width: 0.21 + CLOTH_OFFSET * 2, height: 0.21 + CLOTH_OFFSET * 2 },
          { center: [s * 0.18, 0.72, 0], width: 0.185 + CLOTH_OFFSET * 2, height: 0.185 + CLOTH_OFFSET * 2 },
          { center: [s * 0.18, 0.56, 0], width: 0.155 + CLOTH_OFFSET * 2, height: 0.155 + CLOTH_OFFSET * 2 },
          { center: [s * 0.18, 0.5, 0], width: 0.165 + CLOTH_OFFSET * 2, height: 0.165 + CLOTH_OFFSET * 2 },
          { center: [s * 0.18, 0.4, 0], width: 0.145 + CLOTH_OFFSET * 2, height: 0.145 + CLOTH_OFFSET * 2 },
          { center: [s * 0.18, 0.24, 0], width: 0.1 + CLOTH_OFFSET * 2, height: 0.1 + CLOTH_OFFSET * 2 },
          { center: [s * 0.18, 0.13, 0], width: 0.075 + CLOTH_OFFSET * 2, height: 0.075 + CLOTH_OFFSET * 2 }
        ],
        14,
        false,
        true
      )
    )
  }

  const merged = mergeGeometries([hip, ...legs])
  if (!merged) {
    throw new Error('buildJeans: mergeGeometries returned null')
  }

  const segments: BoneSegment[] = [
    { name: 'Root', start: [0, 0.86, 0], end: [0, 1.15, 0] },
    { name: 'Spine', start: [0, 1.15, 0], end: [0, 1.3, 0] },
    { name: 'LeftUpperLeg', start: [-0.18, 0.86, 0], end: [-0.18, 0.5, 0] },
    { name: 'LeftCalf', start: [-0.18, 0.5, 0], end: [-0.18, 0.12, 0] },
    { name: 'RightUpperLeg', start: [0.18, 0.86, 0], end: [0.18, 0.5, 0] },
    { name: 'RightCalf', start: [0.18, 0.5, 0], end: [0.18, 0.12, 0] }
  ]

  const binding = computeSkinBindings(merged.attributes.position.array as Float32Array, segments)
  applySkinAttributes(merged, binding)

  return {
    geometry: merged,
    boneNames: segments.map((s) => s.name)
  }
}

export interface ProceduralAssetDef {
  id: string
  slotId: string
  label: string
  tags: string[]
  build: (dna: CharacterDNA) => GarmentBuildResult
  materialId: string
}

export const PROCEDURAL_ASSETS: ProceduralAssetDef[] = [
  {
    id: 'proc:tshirt',
    slotId: 'shirt',
    label: 'T-Shirt',
    tags: ['shirt', 'chest', 'procedural'],
    materialId: 'cloth',
    build: (dna) => {
      const shape = sanitizeBodyShape(dna.bodyShape)
      const bust = clamp01(dna.morphs?.bust ?? BUST_DEFAULT)
      const belly = clamp01(dna.morphs?.bellySize ?? 0.5)
      return buildTShirt(shape, bust, belly)
    }
  },
  {
    id: 'proc:jeans',
    slotId: 'pants',
    label: 'Jeans',
    tags: ['pants', 'legs', 'procedural'],
    materialId: 'cloth',
    build: (dna) => {
      const shape = sanitizeBodyShape(dna.bodyShape)
      const butt = clamp01(dna.morphs?.butt ?? BUTT_DEFAULT)
      return buildJeans(shape, butt)
    }
  }
]

export function findProceduralAsset(id: string): ProceduralAssetDef | undefined {
  return PROCEDURAL_ASSETS.find((a) => a.id === id)
}

export function getProceduralAssetEntries(): AssetEntry[] {
  return PROCEDURAL_ASSETS.map((a) => ({
    id: a.id,
    slotId: a.slotId,
    path: '',
    tags: [...a.tags],
    version: 1,
    created: '1970-01-01T00:00:00.000Z',
    label: a.label
  }))
}

/** True when a DNA change requires rebuilding an equipped procedural garment. */
export function garmentDependsOnKey(assetId: string, key: 'torso' | 'head'): boolean {
  if (assetId === 'proc:tshirt') return key === 'torso'
  if (assetId === 'proc:jeans') return key === 'torso'
  return false
}
