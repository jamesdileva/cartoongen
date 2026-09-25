import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { makeLathe, makeSweep, type SweepStation } from './GeometryKernel'
import { applySkinAttributes, computeSkinBindings, type BoneSegment } from './SkinWeights'
import { torsoProfile } from './BodyParts'
import { CRANIUM_CENTER_Y, CRANIUM_CENTER_Z, surfaceZ } from './FaceFeatures'
import { DEFAULT_BODY_SHAPE, type BodyShape } from '../../../shared/types/bodyShape'
import {
  DEFAULT_FACE_SHAPE,
  sanitizeFaceShape,
  type FaceShape
} from '../../../shared/types/faceShape'
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

export const TOP_LENGTH_DEFAULT = 0

/** Hem height for the shared length param: hip 0.9 -> crop 1.25. */
export function hemYOf(topLength: number): number {
  return 0.9 + clamp01(topLength) * 0.35
}

interface TorsoShell {
  stations: SweepStation[]
  phiStart: number
  phiLength: number
}

/**
 * Shared torso shell for all tops. Rules follow station height: waist scales
 * with belly, chest clears the bust silhouette, hip clears pelvis + butt.
 * openFrontGap skips a front wedge (jackets/vests), in radians of half-angle.
 */
function torsoShellStations(
  shape: BodyShape,
  bust: number,
  belly: number,
  butt: number,
  hemY: number,
  openFrontGap = 0
): TorsoShell {
  const bellyScale = bellyScaleOf(belly)
  const pelvisHalfW = 0.32 * shape.hipWidth + CLOTH_OFFSET
  const bustSamples = bustFrontSamples(shape, bust)
  const buttSamples = buttRearSamples(shape, butt)
  const buttDepthFloor = buttRearDepth(shape, butt)

  const stationOf = (y: number, w: number, d: number): SweepStation => {
    const isWaist = y >= 1.0 && y <= 1.18
    // Bust ellipsoids reach y ≈ 1.335 + bustR ≈ 1.42 — include the y=1.44
    // shoulder station so interpolation never sags below the bust top.
    const isChest = y >= 1.2 && y <= 1.44
    // Butt ellipsoids reach y ≈ 0.925 + buttR ≈ 1.045 at butt=1 — include
    // the y=1.06 waist station so the hip depth carries through the butt top.
    const isHip = y <= 1.06
    const halfW = Math.max(w * (isWaist ? bellyScale : 1) + CLOTH_OFFSET, isHip ? pelvisHalfW : 0)
    let halfD = d * (isWaist ? bellyScale : 1) + CLOTH_OFFSET
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
    return { center: [0, y, 0], width: halfW * 2, height: halfD * 2 }
  }

  const stations = torsoProfile(shape)
    .filter((st) => st.y > hemY)
    .map((st) => stationOf(st.y, st.w, st.d))

  // Hem station lerps the body profile at hemY so cropped tops end cleanly.
  const prof = torsoProfile(shape)
  let hi = prof.findIndex((st) => st.y >= hemY)
  if (hi < 0) hi = prof.length - 1
  const lo = Math.max(0, hi - 1)
  const span = prof[hi].y - prof[lo].y || 1
  const t = Math.max(0, Math.min(1, (hemY - prof[lo].y) / span))
  const hemW = prof[lo].w + (prof[hi].w - prof[lo].w) * t
  const hemD = prof[lo].d + (prof[hi].d - prof[lo].d) * t
  stations.unshift(stationOf(hemY, hemW, hemD))

  return {
    stations,
    phiStart: Math.PI / 2 + openFrontGap,
    phiLength: Math.PI * 2 - openFrontGap * 2
  }
}

/** Waist ring dims shared by pants waistbands and the dwarf belt. */
export function waistDims(
  shape: BodyShape,
  belly: number,
  butt: number,
  hipHalfD: number,
  pelvisHalfW: number
): { halfW: number; halfD: number } {
  const bellyScale = bellyScaleOf(belly)
  return {
    halfW:
      Math.max(0.255 * shape.waistTaper * bellyScale + 0.025, pelvisHalfW * 0.92) + CLOTH_OFFSET,
    halfD: Math.max(0.19 * bellyScale, 0.2 + 0.02 * butt, hipHalfD * 0.85) + CLOTH_OFFSET
  }
}

/** Torso + clavicle + arm segments for top skinning. */
function topSegments(clavEnd: number, armStart: number, longSleeves: boolean): BoneSegment[] {
  const segs: BoneSegment[] = [
    { name: 'Root', start: [0, 0.86, 0], end: [0, 1.15, 0] },
    { name: 'Spine', start: [0, 1.15, 0], end: [0, 1.3, 0] },
    { name: 'Spine1', start: [0, 1.3, 0], end: [0, 1.45, 0] },
    { name: 'Spine2', start: [0, 1.45, 0], end: [0, 1.6, 0] },
    { name: 'LeftClavicle', start: [-0.1, 1.47, 0], end: [-(clavEnd + 0.02), 1.46, 0] },
    { name: 'RightClavicle', start: [0.1, 1.47, 0], end: [clavEnd + 0.02, 1.46, 0] },
    // Start upperarm inboard of the deltoid so sleeve verts bind primarily to
    // the arm (tracks muscleMass) while still blending to clavicle at the cap.
    { name: 'LeftUpperArm', start: [-armStart, 1.5, 0], end: [-0.66, 1.5, 0] },
    { name: 'RightUpperArm', start: [armStart, 1.5, 0], end: [0.66, 1.5, 0] }
  ]
  if (longSleeves) {
    segs.push(
      { name: 'LeftForearm', start: [-0.66, 1.5, 0], end: [-0.91, 1.51, 0] },
      { name: 'RightForearm', start: [0.66, 1.5, 0], end: [0.91, 1.51, 0] }
    )
  }
  return segs
}

function bindTop(parts: THREE.BufferGeometry[], segments: BoneSegment[]): GarmentBuildResult {
  const merged = mergeGeometries(parts)
  if (!merged) {
    throw new Error('bindTop: mergeGeometries returned null')
  }
  const binding = computeSkinBindings(merged.attributes.position.array as Float32Array, segments)
  applySkinAttributes(merged, binding)
  return { geometry: merged, boneNames: segments.map((s) => s.name) }
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
  butt = BUTT_DEFAULT,
  topLength = TOP_LENGTH_DEFAULT
): GarmentBuildResult {
  const { stations, phiStart, phiLength } = torsoShellStations(
    shape,
    bust,
    belly,
    butt,
    hemYOf(topLength)
  )
  const body = makeSweep(stations, 20, false, false, phiStart, phiLength)

  const clavEnd = 0.36 * shape.shoulderWidth
  const armStart = sleeveArmStart(shape)
  const sleeves = shortSleeves(shape, armStart)
  return bindTop([body, ...sleeves], topSegments(clavEnd, armStart, false))
}

/** Inboard sleeve start so the open ring tucks under the body shell. */
function sleeveArmStart(shape: BodyShape): number {
  const deltoidCx = 0.36 * shape.shoulderWidth + 0.005
  // Open ring must sit inside the body shell half-width at shoulder height
  // (~0.283 * shoulderWidth) so the tube tucks under cloth, not float outside.
  const bodyHalfShoulder = 0.283 * shape.shoulderWidth + CLOTH_OFFSET
  return Math.max(0.2, Math.min(deltoidCx - 0.095 - CLOTH_OFFSET, bodyHalfShoulder - 0.005))
}

/**
 * Short sleeve stubs encapsulating the deltoid ellipsoid (rx=0.095,
 * ry=0.115, rz=0.1) with cloth offset. Horizontal sweep: width → Z,
 * height → Y. Muscle headroom covers upperarm xz bone scale out-growing
 * a clavicle-weighted sleeve ring.
 */
function shortSleeves(shape: BodyShape, armStart: number): THREE.BufferGeometry[] {
  const clavEnd = 0.36 * shape.shoulderWidth
  const deltoidCx = clavEnd + 0.005
  const deltoidCy = 1.465
  const shoulderHalfY = 0.115 + CLOTH_OFFSET * 1.5
  const shoulderHalfZ = 0.1 + CLOTH_OFFSET * 1.5
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
  return sleeves
}

/** Full-length arm tubes from deltoid to wrist, tracking arm radii. */
function longSleeves(shape: BodyShape, armStart: number): THREE.BufferGeometry[] {
  const clavEnd = 0.36 * shape.shoulderWidth
  const deltoidCx = clavEnd + 0.005
  const deltoidCy = 1.465
  const shoulderHalfY = 0.115 + CLOTH_OFFSET * 1.5
  const shoulderHalfZ = 0.1 + CLOTH_OFFSET * 1.5
  const r = (armR: number): number => armR * MUSCLE_HEADROOM + CLOTH_OFFSET
  const sleeves: THREE.BufferGeometry[] = []
  for (const side of [-1, 1] as const) {
    const s = side
    sleeves.push(
      makeSweep(
        [
          {
            center: [s * armStart, deltoidCy, 0],
            width: shoulderHalfZ * 2,
            height: shoulderHalfY * 2
          },
          {
            center: [s * deltoidCx, deltoidCy, 0],
            width: shoulderHalfZ * 2,
            height: shoulderHalfY * 2
          },
          { center: [s * 0.58, 1.495, 0], width: r(0.0625) * 2, height: r(0.0625) * 2 },
          { center: [s * 0.72, 1.5, 0], width: r(0.055) * 2, height: r(0.055) * 2 },
          { center: [s * 0.86, 1.505, 0], width: r(0.044) * 2, height: r(0.044) * 2 },
          { center: [s * 0.93, 1.51, 0], width: r(0.0375) * 2, height: r(0.0375) * 2 }
        ],
        14,
        false,
        true
      )
    )
    // Wrist cuff ring.
    const cuff = new THREE.TorusGeometry(r(0.0375) + 0.008, 0.02, 10, 20)
    cuff.rotateY(Math.PI / 2)
    cuff.translate(s * 0.9, 1.508, 0)
    sleeves.push(cuff)
  }
  return sleeves
}

/** Collar ring standing at the neck base. */
function collarRing(): THREE.BufferGeometry {
  const collar = new THREE.TorusGeometry(0.145, 0.03, 10, 24)
  collar.rotateX(Math.PI / 2)
  collar.translate(0, 1.575, 0.005)
  return collar
}

/** Long-sleeve shirt: torso shell + arm tubes to the wrist with cuffs. */
export function buildLongsleeve(
  shape: BodyShape = DEFAULT_BODY_SHAPE,
  bust = BUST_DEFAULT,
  belly = 0.5,
  butt = BUTT_DEFAULT,
  topLength = TOP_LENGTH_DEFAULT
): GarmentBuildResult {
  const { stations, phiStart, phiLength } = torsoShellStations(
    shape,
    bust,
    belly,
    butt,
    hemYOf(topLength)
  )
  const body = makeSweep(stations, 20, false, false, phiStart, phiLength)
  const clavEnd = 0.36 * shape.shoulderWidth
  const armStart = sleeveArmStart(shape)
  const sleeves = longSleeves(shape, armStart)
  return bindTop([body, ...sleeves], topSegments(clavEnd, armStart, true))
}

/** Tank top: torso shell + shoulder straps, no sleeves. */
export function buildTank(
  shape: BodyShape = DEFAULT_BODY_SHAPE,
  bust = BUST_DEFAULT,
  belly = 0.5,
  butt = BUTT_DEFAULT,
  topLength = TOP_LENGTH_DEFAULT
): GarmentBuildResult {
  const { stations, phiStart, phiLength } = torsoShellStations(
    shape,
    bust,
    belly,
    butt,
    hemYOf(topLength)
  )
  const body = makeSweep(stations, 20, false, false, phiStart, phiLength)
  // Straps arc over the shoulders, clearing the bust peak in front.
  const bustR = 0.02 + 0.075 * bust
  const peakZ = (0.155 + 0.045 * bust) * shape.chestDepth + bustR * 0.78
  const strapX = 0.085 + 0.03 * bust + 0.02
  const strapR = 0.035
  const straps: THREE.BufferGeometry[] = []
  for (const side of [-1, 1] as const) {
    const s = side
    straps.push(
      makeSweep(
        [
          { center: [s * strapX, 1.34, peakZ + 0.04], width: strapR * 2, height: strapR * 2 },
          { center: [s * (strapX + 0.03), 1.5, 0.1], width: strapR * 2, height: strapR * 2 },
          { center: [s * (strapX + 0.04), 1.585, 0], width: strapR * 2, height: strapR * 2 },
          { center: [s * (strapX + 0.03), 1.5, -0.1], width: strapR * 2, height: strapR * 2 },
          { center: [s * strapX, 1.34, -(0.19 + 0.04)], width: strapR * 2, height: strapR * 2 }
        ],
        10
      )
    )
  }
  const clavEnd = 0.36 * shape.shoulderWidth
  const armStart = sleeveArmStart(shape)
  return bindTop([body, ...straps], topSegments(clavEnd, armStart, false))
}

/** Open-front jacket: partial torso shell + collar + long sleeves, leather. */
export function buildJacket(
  shape: BodyShape = DEFAULT_BODY_SHAPE,
  bust = BUST_DEFAULT,
  belly = 0.5,
  butt = BUTT_DEFAULT,
  topLength = TOP_LENGTH_DEFAULT
): GarmentBuildResult {
  const { stations, phiStart, phiLength } = torsoShellStations(
    shape,
    bust,
    belly,
    butt,
    hemYOf(topLength),
    0.55
  )
  const body = makeSweep(stations, 20, false, false, phiStart, phiLength)
  const clavEnd = 0.36 * shape.shoulderWidth
  const armStart = sleeveArmStart(shape)
  const sleeves = longSleeves(shape, armStart)
  return bindTop([body, collarRing(), ...sleeves], topSegments(clavEnd, armStart, true))
}

/** Open-front vest: partial torso shell, sleeveless, no collar. */
export function buildVest(
  shape: BodyShape = DEFAULT_BODY_SHAPE,
  bust = BUST_DEFAULT,
  belly = 0.5,
  butt = BUTT_DEFAULT,
  topLength = TOP_LENGTH_DEFAULT
): GarmentBuildResult {
  const { stations, phiStart, phiLength } = torsoShellStations(
    shape,
    bust,
    belly,
    butt,
    hemYOf(topLength),
    0.55
  )
  const body = makeSweep(stations, 20, false, false, phiStart, phiLength)
  const clavEnd = 0.36 * shape.shoulderWidth
  const armStart = sleeveArmStart(shape)
  return bindTop([body], topSegments(clavEnd, armStart, false))
}

/** Polo shirt: t-shirt torso + collar ring + short sleeves. */
export function buildPolo(
  shape: BodyShape = DEFAULT_BODY_SHAPE,
  bust = BUST_DEFAULT,
  belly = 0.5,
  butt = BUTT_DEFAULT,
  topLength = TOP_LENGTH_DEFAULT
): GarmentBuildResult {
  const { stations, phiStart, phiLength } = torsoShellStations(
    shape,
    bust,
    belly,
    butt,
    hemYOf(topLength)
  )
  const body = makeSweep(stations, 20, false, false, phiStart, phiLength)
  const clavEnd = 0.36 * shape.shoulderWidth
  const armStart = sleeveArmStart(shape)
  const sleeves = shortSleeves(shape, armStart)
  return bindTop([body, collarRing(), ...sleeves], topSegments(clavEnd, armStart, false))
}

// ---------------------------------------------------------------------------
// Archetype outfits (Sprint 23). One-piece shirt-slot garments.
// ---------------------------------------------------------------------------

/** Wide bell sleeves flaring to the wrist with flared cuffs. */
function bellSleeves(shape: BodyShape, armStart: number): THREE.BufferGeometry[] {
  const clavEnd = 0.36 * shape.shoulderWidth
  const deltoidCx = clavEnd + 0.005
  const deltoidCy = 1.465
  const shoulderHalfY = 0.115 + CLOTH_OFFSET * 1.5
  const shoulderHalfZ = 0.1 + CLOTH_OFFSET * 1.5
  const r = (armR: number): number => armR * MUSCLE_HEADROOM + CLOTH_OFFSET
  const sleeves: THREE.BufferGeometry[] = []
  for (const side of [-1, 1] as const) {
    const s = side
    sleeves.push(
      makeSweep(
        [
          {
            center: [s * armStart, deltoidCy, 0],
            width: shoulderHalfZ * 2,
            height: shoulderHalfY * 2
          },
          {
            center: [s * deltoidCx, deltoidCy, 0],
            width: shoulderHalfZ * 2,
            height: shoulderHalfY * 2
          },
          { center: [s * 0.58, 1.495, 0], width: r(0.0625) * 2, height: r(0.0625) * 2 },
          { center: [s * 0.72, 1.5, 0], width: r(0.06) * 2, height: r(0.06) * 2 },
          { center: [s * 0.86, 1.505, 0], width: r(0.075) * 2, height: r(0.075) * 2 },
          { center: [s * 0.95, 1.51, 0], width: r(0.095) * 2, height: r(0.095) * 2 }
        ],
        14,
        false,
        true
      )
    )
    const cuff = new THREE.TorusGeometry(r(0.095) + 0.008, 0.024, 10, 20)
    cuff.rotateY(Math.PI / 2)
    cuff.translate(s * 0.92, 1.508, 0)
    sleeves.push(cuff)
  }
  return sleeves
}

/**
 * Mage robe: torso shell flowing into a floor-length flared skirt,
 * bell sleeves, standing collar. Fixed hem (a cropped floor robe is nonsense).
 */
export function buildMageRobe(
  shape: BodyShape = DEFAULT_BODY_SHAPE,
  bust = BUST_DEFAULT,
  belly = 0.5,
  butt = BUTT_DEFAULT
): GarmentBuildResult {
  const { stations: torsoStations } = torsoShellStations(shape, bust, belly, butt, 0.9)
  // Skirt flares past the legs (0.18 + leg radius + muscle + offset) and the
  // feet below; butt/pelvis need full hip depth down past y=0.74.
  const pelvisHalfW = 0.32 * shape.hipWidth + CLOTH_OFFSET
  const hipHalfD = Math.max(
    0.23 + CLOTH_OFFSET,
    halfDForProfile(pelvisHalfW, buttRearSamples(shape, butt)),
    buttRearDepth(shape, butt) + CLOTH_OFFSET
  )
  const skirt: SweepStation[] = [
    {
      center: [0, 0.74, 0],
      width: (0.3 * shape.hipWidth + CLOTH_OFFSET) * 2,
      height: hipHalfD * 2 * 0.92
    },
    { center: [0, 0.55, 0], width: 0.68, height: hipHalfD * 2 * 0.95 },
    { center: [0, 0.35, 0], width: 0.74, height: 0.68 },
    { center: [0, 0.18, 0], width: 0.8, height: 0.7 },
    { center: [0, 0.06, 0], width: 0.84, height: 0.72 }
  ]
  // Torso stations ascend from the 0.9 hem; the skirt list above descends,
  // so reverse it to keep one continuous ascending path (else the sweep
  // jumps from the neck back down and cuts a diagonal sheet).
  const skirtAscending = [...skirt].reverse()
  const body = makeSweep([...skirtAscending, ...torsoStations], 20)
  const clavEnd = 0.36 * shape.shoulderWidth
  const armStart = sleeveArmStart(shape)
  const sleeves = bellSleeves(shape, armStart)
  return bindTop([body, collarRing(), ...sleeves], topSegments(clavEnd, armStart, true))
}

/** Lerp the torso profile width/depth at an arbitrary height. */
function profileAt(shape: BodyShape, y: number): { w: number; d: number } {
  const prof = torsoProfile(shape)
  let hi = prof.findIndex((st) => st.y >= y)
  if (hi < 0) hi = prof.length - 1
  const lo = Math.max(0, hi - 1)
  const span = prof[hi].y - prof[lo].y || 1
  const t = Math.max(0, Math.min(1, (y - prof[lo].y) / span))
  return {
    w: prof[lo].w + (prof[hi].w - prof[lo].w) * t,
    d: prof[lo].d + (prof[hi].d - prof[lo].d) * t
  }
}

/**
 * Elven tunic: fitted long top (fixed mid-thigh hem) + V collar accent
 * riding on the upper-chest tube surface.
 */
export function buildElvenTunic(
  shape: BodyShape = DEFAULT_BODY_SHAPE,
  bust = BUST_DEFAULT,
  belly = 0.5,
  butt = BUTT_DEFAULT,
  topLength = TOP_LENGTH_DEFAULT
): GarmentBuildResult {
  const hemY = 0.68 + clamp01(topLength) * 0.25
  const { stations, phiStart, phiLength } = torsoShellStations(shape, bust, belly, butt, hemY)
  const body = makeSweep(stations, 20, false, false, phiStart, phiLength)
  // V accent: bottom in the cleavage dip (tube surface), arms rising outward.
  const vBottom = profileAt(shape, 1.43).d + CLOTH_OFFSET + 0.015
  const vTop = profileAt(shape, 1.5).d + CLOTH_OFFSET + 0.01
  const vR = 0.016
  const accent = makeSweep(
    [
      { center: [-0.09, 1.5, vTop], width: vR * 2, height: vR * 2 },
      { center: [0, 1.43, vBottom], width: vR * 2, height: vR * 2 },
      { center: [0.09, 1.5, vTop], width: vR * 2, height: vR * 2 }
    ],
    8
  )
  const clavEnd = 0.36 * shape.shoulderWidth
  const armStart = sleeveArmStart(shape)
  const sleeves = shortSleeves(shape, armStart)
  return bindTop([body, accent, ...sleeves], topSegments(clavEnd, armStart, false))
}

/**
 * Dwarf vest: open-front chest piece + elliptical belt torus at the waist.
 * Bare arms; belly-tracked so stocky bodies stay covered.
 */
export function buildDwarfVest(
  shape: BodyShape = DEFAULT_BODY_SHAPE,
  bust = BUST_DEFAULT,
  belly = 0.5,
  butt = BUTT_DEFAULT,
  topLength = TOP_LENGTH_DEFAULT
): GarmentBuildResult {
  const { stations, phiStart, phiLength } = torsoShellStations(
    shape,
    bust,
    belly,
    butt,
    hemYOf(topLength),
    0.6
  )
  const body = makeSweep(stations, 20, false, false, phiStart, phiLength)
  // Elliptical belt: torus scaled to the belly-tracked waist ring + margin.
  const pelvisHalfW = 0.32 * shape.hipWidth + CLOTH_OFFSET
  const hipHalfD = Math.max(
    0.23 + CLOTH_OFFSET,
    halfDForProfile(pelvisHalfW, buttRearSamples(shape, butt)),
    buttRearDepth(shape, butt) + CLOTH_OFFSET
  )
  const { halfW: beltW, halfD: beltD } = waistDims(shape, belly, butt, hipHalfD, pelvisHalfW)
  const belt = new THREE.TorusGeometry(1, 0.022, 10, 28)
  belt.rotateX(Math.PI / 2)
  belt.scale(beltW + 0.02, 1, beltD + 0.02)
  belt.translate(0, 1.0, 0)
  const clavEnd = 0.36 * shape.shoulderWidth
  const armStart = sleeveArmStart(shape)
  return bindTop([body, belt], topSegments(clavEnd, armStart, false))
}

/**
 * Shared hip shell for all full pants: waist tracks the belly-scaled body
 * tube, hip depth clears pelvis + full butt silhouette, seat reaches y=0.74.
 */
function hipShellStations(
  shape: BodyShape,
  butt: number,
  belly: number
): { stations: SweepStation[]; pelvisHalfW: number; hipHalfD: number } {
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
  const { halfW: waistHalfW, halfD: waistHalfD } = waistDims(
    shape,
    belly,
    butt,
    hipHalfD,
    pelvisHalfW
  )
  return {
    stations: [
      { center: [0, 1.06, 0], width: waistHalfW * 2, height: waistHalfD * 2 },
      { center: [0, 0.96, 0], width: pelvisHalfW * 2, height: hipHalfD * 2 },
      { center: [0, 0.88, 0], width: pelvisHalfW * 2, height: hipHalfD * 2 },
      {
        // Seat must reach past the pelvis bottom (y=0.76) and butt bottom
        // (≈0.79 at butt=1) — ending at 0.8 leaves skin exposed between legs.
        center: [0, 0.74, 0],
        width: (0.3 * shape.hipWidth + CLOTH_OFFSET) * 2,
        height: hipHalfD * 2 * 0.92
      }
    ],
    pelvisHalfW,
    hipHalfD
  }
}

const PANTS_SEGMENTS: BoneSegment[] = [
  { name: 'Root', start: [0, 0.86, 0], end: [0, 1.15, 0] },
  { name: 'Spine', start: [0, 1.15, 0], end: [0, 1.3, 0] },
  { name: 'LeftUpperLeg', start: [-0.18, 0.86, 0], end: [-0.18, 0.5, 0] },
  { name: 'LeftCalf', start: [-0.18, 0.5, 0], end: [-0.18, 0.12, 0] },
  { name: 'RightUpperLeg', start: [0.18, 0.86, 0], end: [0.18, 0.5, 0] },
  { name: 'RightCalf', start: [0.18, 0.5, 0], end: [0.18, 0.12, 0] }
]

function bindPants(parts: THREE.BufferGeometry[]): GarmentBuildResult {
  const merged = mergeGeometries(parts)
  if (!merged) {
    throw new Error('bindPants: mergeGeometries returned null')
  }
  const binding = computeSkinBindings(
    merged.attributes.position.array as Float32Array,
    PANTS_SEGMENTS
  )
  applySkinAttributes(merged, binding)
  return { geometry: merged, boneNames: PANTS_SEGMENTS.map((s) => s.name) }
}

interface LegStation {
  y: number
  r: number
}

/** Paired leg tubes at x=+/-0.18 with muscle headroom + cloth offset. */
function legPair(
  stations: LegStation[],
  offset: number,
  radiusScale = 1,
  capEnd = true
): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  for (const side of [-1, 1] as const) {
    out.push(
      makeSweep(
        stations.map(({ y, r }) => ({
          center: [side * 0.18, y, 0] as [number, number, number],
          width: (r * MUSCLE_HEADROOM * radiusScale + offset) * 2,
          height: (r * MUSCLE_HEADROOM * radiusScale + offset) * 2
        })),
        14,
        false,
        capEnd
      )
    )
  }
  return out
}

/** Flat cuff ring around a leg tube (hem/cuff accent). */
function cuffRing(cx: number, y: number, tubeR: number, tube = 0.018): THREE.BufferGeometry {
  const geo = new THREE.TorusGeometry(tubeR + 0.008, tube, 10, 20)
  geo.rotateX(Math.PI / 2)
  geo.translate(cx, y, 0)
  return geo
}

const FULL_LEG_STATIONS: LegStation[] = [
  { y: 0.88, r: 0.105 },
  { y: 0.72, r: 0.0925 },
  { y: 0.56, r: 0.0775 },
  { y: 0.5, r: 0.0825 },
  { y: 0.4, r: 0.0725 },
  { y: 0.24, r: 0.05 },
  { y: 0.13, r: 0.0375 }
]

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
  const { stations } = hipShellStations(shape, butt, belly)
  const hip = makeSweep(stations, 20)
  return bindPants([hip, ...legPair(FULL_LEG_STATIONS, CLOTH_OFFSET)])
}

/** Hip shell + thigh tubes cut mid-thigh with hem cuffs. Legs below are bare. */
export function buildShorts(
  shape: BodyShape = DEFAULT_BODY_SHAPE,
  butt = BUTT_DEFAULT,
  belly = 0.5
): GarmentBuildResult {
  const { stations } = hipShellStations(shape, butt, belly)
  const hip = makeSweep(stations, 20)
  const thigh: LegStation[] = [
    { y: 0.88, r: 0.105 },
    { y: 0.72, r: 0.0925 },
    { y: 0.6, r: 0.085 },
    { y: 0.52, r: 0.085 }
  ]
  const legs = legPair(thigh, CLOTH_OFFSET)
  const cuffs: THREE.BufferGeometry[] = []
  for (const side of [-1, 1]) {
    cuffs.push(cuffRing(side * 0.18, 0.52, 0.085 * MUSCLE_HEADROOM + CLOTH_OFFSET))
  }
  return bindPants([hip, ...legs, ...cuffs])
}

/** Hip shell + wide baggy tubes with ankle cuffs. */
export function buildBaggy(
  shape: BodyShape = DEFAULT_BODY_SHAPE,
  butt = BUTT_DEFAULT,
  belly = 0.5
): GarmentBuildResult {
  const { stations } = hipShellStations(shape, butt, belly)
  const hip = makeSweep(stations, 20)
  const legs = legPair(FULL_LEG_STATIONS, CLOTH_OFFSET, 1.4)
  const cuffs: THREE.BufferGeometry[] = []
  for (const side of [-1, 1]) {
    cuffs.push(cuffRing(side * 0.18, 0.17, 0.0375 * MUSCLE_HEADROOM * 1.4 + CLOTH_OFFSET, 0.022))
  }
  return bindPants([hip, ...legs, ...cuffs])
}

/** Hip shell + body-hugging spandex tubes (tight offset, slim silhouette). */
export function buildTights(
  shape: BodyShape = DEFAULT_BODY_SHAPE,
  butt = BUTT_DEFAULT,
  belly = 0.5
): GarmentBuildResult {
  const TIGHT_OFFSET = 0.004
  const { stations } = hipShellStations(shape, butt, belly)
  const hip = makeSweep(stations, 20)
  return bindPants([hip, ...legPair(FULL_LEG_STATIONS, TIGHT_OFFSET, 0.92)])
}

// ---------------------------------------------------------------------------
// Hats (helmet slot). Authored in world coordinates, bound 100% to the Head
// bone (rigid follow, same trick as the cranium) so they track headSize and
// head-shape rebuilds with zero drift. Brims sit above the eye tops, which
// move with eyeScale — hence the FaceShape parameter.
// ---------------------------------------------------------------------------

const HEAD_SEGMENTS: BoneSegment[] = [{ name: 'Head', start: [0, 1.75, 0], end: [0, 2.08, 0] }]

function bindHat(parts: THREE.BufferGeometry[]): GarmentBuildResult {
  const merged = mergeGeometries(parts)
  if (!merged) {
    throw new Error('bindHat: mergeGeometries returned null')
  }
  const binding = computeSkinBindings(
    merged.attributes.position.array as Float32Array,
    HEAD_SEGMENTS
  )
  applySkinAttributes(merged, binding)
  return { geometry: merged, boneNames: HEAD_SEGMENTS.map((s) => s.name) }
}

/** Y of the eye tops for a shape + face (hat brims must stay above this). */
function eyeTopY(shape: BodyShape, face: FaceShape): number {
  return CRANIUM_CENTER_Y + shape.headHeight * 0.12 + 0.062 * face.eyeScale + 0.01
}

/**
 * Brim/rim Y shared by all hats, exported for the clearance probe. Every hat
 * sits above the eye tops so randomized eyes are never covered.
 */
export function hatRimY(shape: BodyShape, face: FaceShape): number {
  return eyeTopY(shape, face) + 0.005
}

/** Skull-hugging shell + folded brim torus. */
export function buildBeanie(
  shape: BodyShape = DEFAULT_BODY_SHAPE,
  face: FaceShape = DEFAULT_FACE_SHAPE
): GarmentBuildResult {
  const rx = shape.headWidth + 0.02
  const ry = shape.headHeight + 0.02
  const rz = shape.headLength + 0.02
  const rimY = hatRimY(shape, face)
  const cosTheta = Math.max(-0.9, Math.min(0.9, (rimY - CRANIUM_CENTER_Y) / ry))
  const thetaLength = Math.acos(cosTheta)
  const shell = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, thetaLength)
  shell.scale(rx, ry, rz)
  shell.translate(0, CRANIUM_CENTER_Y, CRANIUM_CENTER_Z)
  const ringR = rx * Math.sin(thetaLength) + 0.005
  const brim = new THREE.TorusGeometry(ringR, 0.028, 10, 24)
  brim.rotateX(Math.PI / 2)
  brim.translate(0, rimY, CRANIUM_CENTER_Z)
  return bindHat([shell, brim])
}

/** Dome + flat front brim disc + top button. */
export function buildCap(
  shape: BodyShape = DEFAULT_BODY_SHAPE,
  face: FaceShape = DEFAULT_FACE_SHAPE
): GarmentBuildResult {
  const rimY = hatRimY(shape, face)
  const rx = shape.headWidth + 0.015
  const ry = shape.headHeight * 0.75 + 0.02
  const rz = shape.headLength + 0.015
  // Dome segment just past the equator; translate so its rim lands on rimY.
  const thetaLength = Math.PI * 0.52
  const dome = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, thetaLength)
  dome.scale(rx, ry, rz)
  dome.translate(0, rimY - Math.cos(thetaLength) * ry, CRANIUM_CENTER_Z)
  // Brim: flat disc extending forward from the forehead surface, tilted down.
  const brim = new THREE.CircleGeometry(0.11, 20)
  brim.rotateX(-Math.PI / 2 + 0.12)
  brim.translate(0, rimY - 0.005, surfaceZ(shape, 0, rimY) + 0.12)
  const button = new THREE.SphereGeometry(0.02, 10, 8)
  button.translate(0, rimY - Math.cos(thetaLength) * ry + ry + 0.005, CRANIUM_CENTER_Z)
  return bindHat([dome, brim, button])
}

/** Wide lathe brim with upturned edge + tall crown. */
export function buildSombrero(
  shape: BodyShape = DEFAULT_BODY_SHAPE,
  face: FaceShape = DEFAULT_FACE_SHAPE
): GarmentBuildResult {
  const rimY = hatRimY(shape, face)
  // Tall crown, same center as the cranium but larger on every axis, so the
  // skull is strictly inside by construction.
  const rx = shape.headWidth + 0.015
  const ry = shape.headHeight * 1.15 + 0.01
  const rz = shape.headLength + 0.015
  const cosTheta = Math.max(-0.9, Math.min(0.9, (rimY - CRANIUM_CENTER_Y) / ry))
  const thetaLength = Math.acos(cosTheta)
  const crown = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, thetaLength)
  crown.scale(rx, ry, rz)
  crown.translate(0, CRANIUM_CENTER_Y, CRANIUM_CENTER_Z)
  // Brim: flat disc out to 0.30 with an upturned lip, via lathe profile.
  const brim = makeLathe(
    [
      [0.02, rimY + 0.012],
      [0.15, rimY + 0.006],
      [0.3, rimY],
      [0.345, rimY + 0.025]
    ],
    28
  )
  return bindHat([crown, brim])
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
      const topLength = clamp01(dna.morphs?.topLength ?? TOP_LENGTH_DEFAULT)
      return buildTShirt(shape, bust, belly, butt, topLength)
    }
  },
  {
    id: 'proc:longsleeve',
    slotId: 'shirt',
    label: 'Long-Sleeve Shirt',
    tags: ['shirt', 'chest', 'procedural'],
    materialId: 'cloth',
    build: (dna) => {
      const shape = sanitizeBodyShape(dna.bodyShape)
      const bust = clamp01(dna.morphs?.bust ?? BUST_DEFAULT)
      const belly = clamp01(dna.morphs?.bellySize ?? 0.5)
      const butt = clamp01(dna.morphs?.butt ?? BUTT_DEFAULT)
      const topLength = clamp01(dna.morphs?.topLength ?? TOP_LENGTH_DEFAULT)
      return buildLongsleeve(shape, bust, belly, butt, topLength)
    }
  },
  {
    id: 'proc:tank',
    slotId: 'shirt',
    label: 'Tank Top',
    tags: ['shirt', 'chest', 'procedural'],
    materialId: 'cloth',
    build: (dna) => {
      const shape = sanitizeBodyShape(dna.bodyShape)
      const bust = clamp01(dna.morphs?.bust ?? BUST_DEFAULT)
      const belly = clamp01(dna.morphs?.bellySize ?? 0.5)
      const butt = clamp01(dna.morphs?.butt ?? BUTT_DEFAULT)
      const topLength = clamp01(dna.morphs?.topLength ?? TOP_LENGTH_DEFAULT)
      return buildTank(shape, bust, belly, butt, topLength)
    }
  },
  {
    id: 'proc:jacket',
    slotId: 'shirt',
    label: 'Jacket',
    tags: ['shirt', 'jacket', 'procedural'],
    materialId: 'leather',
    build: (dna) => {
      const shape = sanitizeBodyShape(dna.bodyShape)
      const bust = clamp01(dna.morphs?.bust ?? BUST_DEFAULT)
      const belly = clamp01(dna.morphs?.bellySize ?? 0.5)
      const butt = clamp01(dna.morphs?.butt ?? BUTT_DEFAULT)
      const topLength = clamp01(dna.morphs?.topLength ?? TOP_LENGTH_DEFAULT)
      return buildJacket(shape, bust, belly, butt, topLength)
    }
  },
  {
    id: 'proc:vest',
    slotId: 'shirt',
    label: 'Vest',
    tags: ['shirt', 'vest', 'procedural'],
    materialId: 'cloth',
    build: (dna) => {
      const shape = sanitizeBodyShape(dna.bodyShape)
      const bust = clamp01(dna.morphs?.bust ?? BUST_DEFAULT)
      const belly = clamp01(dna.morphs?.bellySize ?? 0.5)
      const butt = clamp01(dna.morphs?.butt ?? BUTT_DEFAULT)
      const topLength = clamp01(dna.morphs?.topLength ?? TOP_LENGTH_DEFAULT)
      return buildVest(shape, bust, belly, butt, topLength)
    }
  },
  {
    id: 'proc:polo',
    slotId: 'shirt',
    label: 'Polo Shirt',
    tags: ['shirt', 'chest', 'procedural'],
    materialId: 'cloth',
    build: (dna) => {
      const shape = sanitizeBodyShape(dna.bodyShape)
      const bust = clamp01(dna.morphs?.bust ?? BUST_DEFAULT)
      const belly = clamp01(dna.morphs?.bellySize ?? 0.5)
      const butt = clamp01(dna.morphs?.butt ?? BUTT_DEFAULT)
      const topLength = clamp01(dna.morphs?.topLength ?? TOP_LENGTH_DEFAULT)
      return buildPolo(shape, bust, belly, butt, topLength)
    }
  },
  {
    id: 'proc:mage_robe',
    slotId: 'shirt',
    label: 'Mage Robe',
    tags: ['shirt', 'robe', 'procedural'],
    materialId: 'cloth',
    build: (dna) => {
      const shape = sanitizeBodyShape(dna.bodyShape)
      const bust = clamp01(dna.morphs?.bust ?? BUST_DEFAULT)
      const belly = clamp01(dna.morphs?.bellySize ?? 0.5)
      const butt = clamp01(dna.morphs?.butt ?? BUTT_DEFAULT)
      return buildMageRobe(shape, bust, belly, butt)
    }
  },
  {
    id: 'proc:elven_tunic',
    slotId: 'shirt',
    label: 'Elven Tunic',
    tags: ['shirt', 'tunic', 'procedural'],
    materialId: 'cloth',
    build: (dna) => {
      const shape = sanitizeBodyShape(dna.bodyShape)
      const bust = clamp01(dna.morphs?.bust ?? BUST_DEFAULT)
      const belly = clamp01(dna.morphs?.bellySize ?? 0.5)
      const butt = clamp01(dna.morphs?.butt ?? BUTT_DEFAULT)
      const topLength = clamp01(dna.morphs?.topLength ?? TOP_LENGTH_DEFAULT)
      return buildElvenTunic(shape, bust, belly, butt, topLength)
    }
  },
  {
    id: 'proc:dwarf_vest',
    slotId: 'shirt',
    label: 'Dwarf Vest',
    tags: ['shirt', 'vest', 'procedural'],
    materialId: 'leather',
    build: (dna) => {
      const shape = sanitizeBodyShape(dna.bodyShape)
      const bust = clamp01(dna.morphs?.bust ?? BUST_DEFAULT)
      const belly = clamp01(dna.morphs?.bellySize ?? 0.5)
      const butt = clamp01(dna.morphs?.butt ?? BUTT_DEFAULT)
      const topLength = clamp01(dna.morphs?.topLength ?? TOP_LENGTH_DEFAULT)
      return buildDwarfVest(shape, bust, belly, butt, topLength)
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
  },
  {
    id: 'proc:shorts',
    slotId: 'pants',
    label: 'Shorts',
    tags: ['pants', 'legs', 'procedural'],
    materialId: 'cloth',
    build: (dna) => {
      const shape = sanitizeBodyShape(dna.bodyShape)
      const butt = clamp01(dna.morphs?.butt ?? BUTT_DEFAULT)
      const belly = clamp01(dna.morphs?.bellySize ?? 0.5)
      return buildShorts(shape, butt, belly)
    }
  },
  {
    id: 'proc:baggy',
    slotId: 'pants',
    label: 'Baggy Pants',
    tags: ['pants', 'legs', 'procedural'],
    materialId: 'cloth',
    build: (dna) => {
      const shape = sanitizeBodyShape(dna.bodyShape)
      const butt = clamp01(dna.morphs?.butt ?? BUTT_DEFAULT)
      const belly = clamp01(dna.morphs?.bellySize ?? 0.5)
      return buildBaggy(shape, butt, belly)
    }
  },
  {
    id: 'proc:tights',
    slotId: 'pants',
    label: 'Tights',
    tags: ['pants', 'legs', 'procedural'],
    materialId: 'cloth',
    build: (dna) => {
      const shape = sanitizeBodyShape(dna.bodyShape)
      const butt = clamp01(dna.morphs?.butt ?? BUTT_DEFAULT)
      const belly = clamp01(dna.morphs?.bellySize ?? 0.5)
      return buildTights(shape, butt, belly)
    }
  },
  {
    id: 'proc:beanie',
    slotId: 'helmet',
    label: 'Beanie',
    tags: ['hat', 'procedural'],
    materialId: 'cloth',
    build: (dna) => {
      const shape = sanitizeBodyShape(dna.bodyShape)
      const face = sanitizeFaceShape(dna.face)
      return buildBeanie(shape, face)
    }
  },
  {
    id: 'proc:cap',
    slotId: 'helmet',
    label: 'Baseball Cap',
    tags: ['hat', 'procedural'],
    materialId: 'cloth',
    build: (dna) => {
      const shape = sanitizeBodyShape(dna.bodyShape)
      const face = sanitizeFaceShape(dna.face)
      return buildCap(shape, face)
    }
  },
  {
    id: 'proc:sombrero',
    slotId: 'helmet',
    label: 'Sombrero',
    tags: ['hat', 'procedural'],
    materialId: 'leather',
    build: (dna) => {
      const shape = sanitizeBodyShape(dna.bodyShape)
      const face = sanitizeFaceShape(dna.face)
      return buildSombrero(shape, face)
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

export type GarmentKey = 'torso' | 'head' | 'face'

/** True when a DNA change requires rebuilding an equipped procedural garment. */
export function garmentDependsOnKey(assetId: string, key: GarmentKey): boolean {
  if (
    assetId === 'proc:tshirt' ||
    assetId === 'proc:longsleeve' ||
    assetId === 'proc:tank' ||
    assetId === 'proc:jacket' ||
    assetId === 'proc:vest' ||
    assetId === 'proc:polo' ||
    assetId === 'proc:mage_robe' ||
    assetId === 'proc:elven_tunic' ||
    assetId === 'proc:dwarf_vest' ||
    assetId === 'proc:jeans' ||
    assetId === 'proc:shorts' ||
    assetId === 'proc:baggy' ||
    assetId === 'proc:tights'
  )
    return key === 'torso'
  if (assetId === 'proc:beanie' || assetId === 'proc:cap' || assetId === 'proc:sombrero')
    return key === 'head' || key === 'face'
  return false
}
