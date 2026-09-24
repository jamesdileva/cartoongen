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
/** Max muscleMass remap (ProportionManager range [0.8, 1.3]) — sleeves need rest room. */
const MUSCLE_HEADROOM = 1.12

function bellyScaleOf(belly: number): number {
  return 0.75 + belly * 0.6
}

/** Rear z projection of the body butt ellipsoids (matches buildTorso). */
export function buttRearDepth(shape: BodyShape, butt: number): number {
  return 0.13 + 0.055 * butt + 0.055 * shape.hipWidth + 0.065 * butt
}

/**
 * Half-depth so an elliptical cloth ring (halfW) clears a body profile.
 * For each sampled (x, depth) on the body silhouette, the ring's z at that x
 * is halfD * sqrt(1 - (x/halfW)^2) — solve for the worst case.
 */
function halfDForProfile(halfW: number, samples: Array<{ x: number; depth: number }>): number {
  let need = 0
  for (const { x, depth } of samples) {
    const ell = Math.sqrt(Math.max(1e-4, 1 - Math.min(0.98, (x / halfW) ** 2)))
    need = Math.max(need, (depth + CLOTH_OFFSET) / ell)
  }
  return need
}

/** Sample rear silhouette of both butt ellipsoids (matches buildTorso). */
function buttRearSamples(shape: BodyShape, butt: number): Array<{ x: number; depth: number }> {
  const buttR = 0.055 * shape.hipWidth + 0.065 * butt
  const rx = buttR * 1.15
  const rz = buttR
  const cz = 0.13 + 0.055 * butt
  const cx = 0.095 * shape.hipWidth
  const samples: Array<{ x: number; depth: number }> = []
  for (const side of [-1, 1]) {
    for (let u = -1; u <= 1.0001; u += 0.1) {
      const x = side * (cx + u * rx)
      samples.push({ x, depth: cz + rz * Math.sqrt(Math.max(0, 1 - u * u)) })
    }
  }
  return samples
}

/** Sample front silhouette of both bust ellipsoids (matches buildTorso). */
function bustFrontSamples(shape: BodyShape, bust: number): Array<{ x: number; depth: number }> {
  const bustR = 0.02 + 0.075 * bust
  const rx = bustR
  const rz = bustR * 0.78
  const cz = (0.155 + 0.045 * bust) * shape.chestDepth
  const cx = 0.085 + 0.03 * bust
  const samples: Array<{ x: number; depth: number }> = []
  for (const side of [-1, 1]) {
    for (let u = -1; u <= 1.0001; u += 0.1) {
      const x = side * (cx + u * rx)
      samples.push({ x, depth: cz + rz * Math.sqrt(Math.max(0, 1 - u * u)) })
    }
  }
  return samples
}

/**
 * Torso-hugging shell offset outside the body surface, with short
 * sleeve stubs over the upper arms. Clearance accounts for the pelvis
 * ellipsoid (0.32 * hipWidth) so hips never poke through the hem.
 */
export function buildTShirt(
  shape: BodyShape = DEFAULT_BODY_SHAPE,
  bust = BUST_DEFAULT,
  belly = 0.5,
  butt = BUTT_DEFAULT
): GarmentBuildResult {
  const bellyScale = bellyScaleOf(belly)
  const pelvisHalfW = 0.32 * shape.hipWidth + CLOTH_OFFSET
  const bustSamples = bustFrontSamples(shape, bust)
  const buttSamples = buttRearSamples(shape, butt)
  const buttDepthFloor = buttRearDepth(shape, butt)

  const stations = torsoProfile(shape)
    .filter((st) => st.y >= 0.96 && st.y <= 1.585)
    .map((st) => {
      const isWaist = st.y >= 1.0 && st.y <= 1.18
      // Bust ellipsoids reach y ≈ 1.335 + bustR ≈ 1.42 — include the y=1.44
      // shoulder station so interpolation never sags below the bust top.
      const isChest = st.y >= 1.2 && st.y <= 1.44
      // Butt ellipsoids reach y ≈ 0.925 + buttR ≈ 1.045 at butt=1 — include
      // the y=1.06 waist station so the hip depth carries through the butt top.
      const isHip = st.y <= 1.06
      const halfW = Math.max(
        st.w * (isWaist ? bellyScale : 1) + CLOTH_OFFSET,
        isHip ? pelvisHalfW : 0
      )
      let halfD = st.d * (isWaist ? bellyScale : 1) + CLOTH_OFFSET
      // Per-station ellipse: narrower stations need more depth for the same
      // body silhouette — never reuse a wider station's correction.
      if (isChest) halfD = Math.max(halfD, halfDForProfile(halfW, bustSamples))
      if (isHip) {
        halfD = Math.max(
          halfD,
          0.23 + CLOTH_OFFSET,
          halfDForProfile(halfW, buttSamples),
          buttDepthFloor + CLOTH_OFFSET
        )
      }
      return {
        center: [0, st.y, 0] as [number, number, number],
        width: halfW * 2,
        height: halfD * 2
      }
    })

  // Hem sits on the pelvis band so the shirt never floats above the hips.
  if (stations.length > 0 && stations[0].center[1] > 0.9) {
    const hemHalfD = Math.max(
      0.23 + CLOTH_OFFSET,
      halfDForProfile(pelvisHalfW, buttSamples),
      buttDepthFloor + CLOTH_OFFSET
    )
    stations.unshift({
      center: [0, 0.9, 0],
      width: pelvisHalfW * 2,
      height: hemHalfD * 2
    })
  }

  const body = makeSweep(stations, 20)

  // Sleeves encapsulate the body deltoid ellipsoid (rx=0.095, ry=0.115, rz=0.1
  // centered at x=clavEnd+0.005, y=CLAVICLE_Y-0.005) with cloth offset.
  // Horizontal sweep: width → Z, height → Y. Muscle headroom covers upperarm
  // xz bone scale out-growing a clavicle-weighted sleeve ring.
  const clavEnd = 0.36 * shape.shoulderWidth
  const deltoidCx = clavEnd + 0.005
  const deltoidCy = 1.465
  const shoulderHalfY = 0.115 + CLOTH_OFFSET * 1.5
  const shoulderHalfZ = 0.1 + CLOTH_OFFSET * 1.5
  // Open ring must sit inside the body shell half-width at shoulder height
  // (~0.283 * shoulderWidth) so the tube tucks under cloth, not float outside.
  const bodyHalfShoulder = 0.283 * shape.shoulderWidth + CLOTH_OFFSET
  const armStart = Math.max(
    0.2,
    Math.min(deltoidCx - 0.095 - CLOTH_OFFSET, bodyHalfShoulder - 0.005)
  )
  const sleeveLen = 0.58
  const upperArmR = 0.075 * MUSCLE_HEADROOM + CLOTH_OFFSET
  const sleeves: THREE.BufferGeometry[] = []
  for (const side of [-1, 1] as const) {
    sleeves.push(
      makeSweep(
        [
          {
            // Inboard of the deltoid so the open ring tucks under the body shell.
            center: [side * armStart, deltoidCy, 0],
            width: shoulderHalfZ * 2,
            height: shoulderHalfY * 2
          },
          {
            // Over the deltoid center — full Y/Z to contain the cap.
            center: [side * deltoidCx, deltoidCy, 0],
            width: shoulderHalfZ * 2,
            height: shoulderHalfY * 2
          },
          {
            center: [side * Math.max(sleeveLen, deltoidCx + 0.1), 1.495, 0],
            width: (upperArmR + 0.01) * 2,
            height: (upperArmR + 0.01) * 2
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
    // Start upperarm inboard of the deltoid so sleeve verts bind primarily to
    // the arm (tracks muscleMass) while still blending to clavicle at the cap.
    { name: 'LeftUpperArm', start: [-armStart, 1.5, 0], end: [-0.66, 1.5, 0] },
    { name: 'RightUpperArm', start: [armStart, 1.5, 0], end: [0.66, 1.5, 0] }
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
  butt = BUTT_DEFAULT,
  belly = 0.5
): GarmentBuildResult {
  const bellyScale = bellyScaleOf(belly)
  const pelvisHalfW = 0.32 * shape.hipWidth + CLOTH_OFFSET
  const buttSamples = buttRearSamples(shape, butt)
  // Pelvis ellipsoid rear z radius is fixed 0.23 (see buildTorso) — floor must
  // match it or skin pokes through the seat even at butt=0. Off-center butt
  // needs more than the centerline depth on an elliptical ring.
  const hipHalfD = Math.max(
    0.23 + CLOTH_OFFSET,
    halfDForProfile(pelvisHalfW, buttSamples),
    buttRearDepth(shape, butt) + CLOTH_OFFSET
  )
  // Waist must track the belly-scaled body tube (0.255/0.19 stations), or fat
  // characters poke out the sides/back of the waistband.
  const waistHalfW =
    Math.max(0.255 * shape.waistTaper * bellyScale + 0.025, pelvisHalfW * 0.92) + CLOTH_OFFSET
  // Waist station must stay close to hip depth: butt geometry tops out near
  // y=1.045, and a shallow y=1.06 station interpolates below the butt peak.
  const waistHalfD = Math.max(0.19 * bellyScale, 0.2 + 0.02 * butt, hipHalfD * 0.85) + CLOTH_OFFSET
  const legR = MUSCLE_HEADROOM

  const hip = makeSweep(
    [
      {
        center: [0, 1.06, 0],
        width: waistHalfW * 2,
        height: waistHalfD * 2
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
        // Seat must reach past the pelvis bottom (y=0.76) and butt bottom
        // (≈0.79 at butt=1) — ending at 0.8 leaves skin exposed between legs.
        center: [0, 0.74, 0],
        width: (0.3 * shape.hipWidth + CLOTH_OFFSET) * 2,
        height: hipHalfD * 2 * 0.92
      }
    ],
    20
  )

  const legs: THREE.BufferGeometry[] = []
  const legStation = (r: number): { width: number; height: number } => ({
    width: (r * legR + CLOTH_OFFSET) * 2,
    height: (r * legR + CLOTH_OFFSET) * 2
  })
  for (const side of [-1, 1] as const) {
    const s = side
    legs.push(
      makeSweep(
        [
          { center: [s * 0.18, 0.88, 0], ...legStation(0.105) },
          { center: [s * 0.18, 0.72, 0], ...legStation(0.0925) },
          { center: [s * 0.18, 0.56, 0], ...legStation(0.0775) },
          { center: [s * 0.18, 0.5, 0], ...legStation(0.0825) },
          { center: [s * 0.18, 0.4, 0], ...legStation(0.0725) },
          { center: [s * 0.18, 0.24, 0], ...legStation(0.05) },
          { center: [s * 0.18, 0.13, 0], ...legStation(0.0375) }
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
      const butt = clamp01(dna.morphs?.butt ?? BUTT_DEFAULT)
      return buildTShirt(shape, bust, belly, butt)
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
      const belly = clamp01(dna.morphs?.bellySize ?? 0.5)
      return buildJeans(shape, butt, belly)
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
