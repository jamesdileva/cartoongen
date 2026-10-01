import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {
  makeEllipsoid,
  makeLathe,
  makeSweep,
  translateGeometry,
  type SweepStation
} from './GeometryKernel'
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
/**
 * Max muscleMass remap (ProportionManager range [0.8, 1.3]) - sleeves and
 * legs are authored with room for the full range so max-muscle bodies never
 * poke through. Slightly roomier at rest; correctness over tightness.
 */
const MUSCLE_HEADROOM = 1.3

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

/**
 * Torso + clavicle + arm segments for top skinning. clavReachX extends the
 * clavicle capsules toward the sleeve so the deltoid cap region binds
 * clavicle-dominant and tracks shoulderWidth-driven deltoid slide instead
 * of staying behind on the upper arm. Defaults to legacy reach (no sleeves).
 * Pass the sleeve outer x to cover the cuff region.
 */
function topSegments(
  clavEnd: number,
  armStart: number,
  longSleeves: boolean,
  clavReachX: number | null = null
): BoneSegment[] {
  const reach = clavReachX ?? clavEnd + 0.02
  // Short sleeves end at the deltoid: cap the upperarm proxy past the cap so
  // the whole cap region binds clavicle-dominant and tracks deltoid slide as
  // one unit. Long sleeves keep the legacy reach (elbow handoff to forearm).
  const upperEnd = longSleeves ? 0.66 : clavEnd + 0.15
  // Upperarm proxy starts at the deltoid cap (not the tuck): inboard cloth
  // then binds clavicle-dominant and no longer shrinks away from the
  // muscle-inert deltoid when muscleMass drops. The arm mesh keeps its own
  // full-length segments, so arm muscle tracking is unaffected.
  const upperStart = clavEnd + 0.005
  const segs: BoneSegment[] = [
    { name: 'Root', start: [0, 0.86, 0], end: [0, 1.15, 0] },
    { name: 'Spine', start: [0, 1.15, 0], end: [0, 1.3, 0] },
    { name: 'Spine1', start: [0, 1.3, 0], end: [0, 1.45, 0] },
    { name: 'Spine2', start: [0, 1.45, 0], end: [0, 1.6, 0] },
    { name: 'LeftClavicle', start: [-0.1, 1.47, 0], end: [-reach, 1.46, 0] },
    { name: 'RightClavicle', start: [0.1, 1.47, 0], end: [reach, 1.46, 0] },
    // Upperarm proxy ends past the deltoid cap: sleeve verts beyond it bind
    // clavicle-dominant and track shoulderWidth-driven deltoid slide as one
    // unit with the deltoid meat (which is ~91% clavicle). The arm mesh
    // itself keeps its own full-length segments, so muscle tracking is
    // unaffected - static headroom covers thickness instead.
    { name: 'LeftUpperArm', start: [-upperStart, 1.5, 0], end: [-upperEnd, 1.5, 0] },
    { name: 'RightUpperArm', start: [upperStart, 1.5, 0], end: [upperEnd, 1.5, 0] }
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
  const { sleeves, outerX } = shortSleeves(shape, armStart)
  return bindTop([body, ...sleeves], topSegments(clavEnd, armStart, false, outerX + 0.03))
}

/** Inboard sleeve start so the open ring tucks under the body shell. */
function sleeveArmStart(shape: BodyShape): number {
  const deltoidCx = 0.36 * shape.shoulderWidth + 0.005
  // Open ring must sit inside the body shell half-width at shoulder height
  // (~0.283 * shoulderWidth) so the tube tucks under cloth, not float outside.
  // Tucked DEEP (10cm margin): under shoulderWidth morph the clavicle-bound
  // ring slides outboard, and a shallow tuck exits the shell edge leaving an
  // armpit sliver. The extra hidden tube stays inside the torso volume.
  const bodyHalfShoulder = 0.283 * shape.shoulderWidth + CLOTH_OFFSET
  return Math.max(0.2, Math.min(deltoidCx - 0.095 - CLOTH_OFFSET, bodyHalfShoulder - 0.1))
}

/**
 * Short sleeve stubs encapsulating the deltoid ellipsoid (rx=0.095,
 * ry=0.115, rz=0.1) with cloth offset. Horizontal sweep: width → Z,
 * height → Y. Muscle headroom covers upperarm xz bone scale out-growing
 * a clavicle-weighted sleeve ring.
 */
function shortSleeves(
  shape: BodyShape,
  armStart: number
): { sleeves: THREE.BufferGeometry[]; outerX: number } {
  const clavEnd = 0.36 * shape.shoulderWidth
  const deltoidCx = clavEnd + 0.005
  const deltoidCy = 1.465
  const shoulderHalfY = 0.125 + CLOTH_OFFSET
  const shoulderHalfZ = 0.115 + CLOTH_OFFSET
  const sleeveLen = 0.62
  const upperArmR = 0.075 * MUSCLE_HEADROOM + CLOTH_OFFSET
  // Cuff flares slightly past the morphed deltoid cap (shoulderWidth slide
  // outruns the half-clavicle-bound outer ring at extreme combos).
  const cuffR = upperArmR + 0.015
  // Outer edge clears the morphed deltoid pole: the pole outruns the
  // half-tracked cuff by ~0.4x slide, so rest margin must exceed that.
  // Shape-relative (no fixed floor beyond the 0.62 style length).
  const outerX = Math.max(sleeveLen, deltoidCx + 0.19)
  // Cuff mouth clears the morphed deltoid cap radially: the ball sits
  // high/forward in the opening at extreme combos.
  const mouthR = cuffR + 0.02
  // Mid-cap ring: the displaced deltoid ball (lower-outer quadrant) hangs
  // below the slim arm tube, so the cap stays fat past deltoid center.
  const midX = deltoidCx + 0.12
  // Inboard ring runs slightly large: it lives hidden under the shell, and
  // the extra margin covers the armpit corner where shell edge meets sleeve
  // under opposing morph shear (skinny + wide slide).
  const inHalfY = shoulderHalfY + 0.02
  const inHalfZ = shoulderHalfZ + 0.02
  const sleeves: THREE.BufferGeometry[] = []
  for (const side of [-1, 1] as const) {
    sleeves.push(
      makeSweep(
        [
          {
            // Inboard of the deltoid so the open ring tucks under the body shell.
            center: [side * armStart, deltoidCy, 0],
            width: inHalfZ * 2,
            height: inHalfY * 2
          },
          {
            // Over the deltoid center - full Y/Z to contain the cap.
            center: [side * deltoidCx, deltoidCy, 0],
            width: shoulderHalfZ * 2,
            height: shoulderHalfY * 2
          },
          {
            // Past the deltoid cap - keeps the slid ball inside the fat zone.
            center: [side * midX, deltoidCy, 0],
            width: shoulderHalfZ * 2,
            height: shoulderHalfY * 2
          },
          {
            center: [side * outerX, 1.495, 0],
            width: (mouthR + 0.01) * 2,
            height: (mouthR + 0.01) * 2
          }
        ],
        14,
        false,
        true
      )
    )
  }
  return { sleeves, outerX }
}

/** Full-length arm tubes from deltoid to wrist, tracking arm radii. */
function longSleeves(shape: BodyShape, armStart: number): THREE.BufferGeometry[] {
  const clavEnd = 0.36 * shape.shoulderWidth
  const deltoidCx = clavEnd + 0.005
  const deltoidCy = 1.465
  const shoulderHalfY = 0.125 + CLOTH_OFFSET
  const shoulderHalfZ = 0.115 + CLOTH_OFFSET
  const r = (armR: number): number => armR * MUSCLE_HEADROOM + CLOTH_OFFSET
  // Inboard ring runs large (hidden under shell): covers the armpit corner
  // where shell edge meets sleeve under opposing morph shear.
  const inHalfY = shoulderHalfY + 0.02
  const inHalfZ = shoulderHalfZ + 0.02
  const sleeves: THREE.BufferGeometry[] = []
  for (const side of [-1, 1] as const) {
    const s = side
    sleeves.push(
      makeSweep(
        [
          {
            center: [s * armStart, deltoidCy, 0],
            width: inHalfZ * 2,
            height: inHalfY * 2
          },
          {
            center: [s * deltoidCx, deltoidCy, 0],
            width: shoulderHalfZ * 2,
            height: shoulderHalfY * 2
          },
          // Past the deltoid cap: the slid ball's lower-outer quadrant hangs
          // below the slim arm tube (mid-cap ring, same as short sleeves).
          {
            center: [s * (deltoidCx + 0.12), deltoidCy, 0],
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

/** Collar ring standing at the neck base. Sized past max neckWidth. */
function collarRing(): THREE.BufferGeometry {
  const collar = new THREE.TorusGeometry(0.155, 0.03, 10, 24)
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
  return bindTop([body, ...sleeves], topSegments(clavEnd, armStart, true, clavEnd + 0.105))
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
  return bindTop(
    [body, collarRing(), ...sleeves],
    topSegments(clavEnd, armStart, true, clavEnd + 0.105)
  )
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
  const { sleeves, outerX } = shortSleeves(shape, armStart)
  return bindTop(
    [body, collarRing(), ...sleeves],
    topSegments(clavEnd, armStart, false, outerX + 0.03)
  )
}

// ---------------------------------------------------------------------------
// Archetype outfits (Sprint 23). One-piece shirt-slot garments.
// ---------------------------------------------------------------------------

/** Wide bell sleeves flaring to the wrist with flared cuffs. */
function bellSleeves(shape: BodyShape, armStart: number): THREE.BufferGeometry[] {
  const clavEnd = 0.36 * shape.shoulderWidth
  const deltoidCx = clavEnd + 0.005
  const deltoidCy = 1.465
  const shoulderHalfY = 0.125 + CLOTH_OFFSET
  const shoulderHalfZ = 0.115 + CLOTH_OFFSET
  const r = (armR: number): number => armR * MUSCLE_HEADROOM + CLOTH_OFFSET
  // Inboard ring runs large (hidden under shell): covers the armpit corner
  // where shell edge meets sleeve under opposing morph shear.
  const inHalfY = shoulderHalfY + 0.02
  const inHalfZ = shoulderHalfZ + 0.02
  const sleeves: THREE.BufferGeometry[] = []
  for (const side of [-1, 1] as const) {
    const s = side
    sleeves.push(
      makeSweep(
        [
          {
            center: [s * armStart, deltoidCy, 0],
            width: inHalfZ * 2,
            height: inHalfY * 2
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
  return bindTop(
    [body, collarRing(), ...sleeves],
    topSegments(clavEnd, armStart, true, clavEnd + 0.105)
  )
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
  const { sleeves, outerX } = shortSleeves(shape, armStart)
  return bindTop([body, accent, ...sleeves], topSegments(clavEnd, armStart, false, outerX + 0.03))
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

// ---------------------------------------------------------------------------
// Sprint 31 tops: sweater, belted tunic, dress, long coat, tabard. All reuse
// torsoShellStations + bindTop; long-sleeved ones reuse longSleeves().
// ---------------------------------------------------------------------------

/** Chunky sweater: torso shell + long sleeves + high ribbed collar + hem band. */
export function buildSweater(
  shape: BodyShape = DEFAULT_BODY_SHAPE,
  bust = BUST_DEFAULT,
  belly = 0.5,
  butt = BUTT_DEFAULT,
  topLength = TOP_LENGTH_DEFAULT
): GarmentBuildResult {
  const hemY = hemYOf(topLength)
  const { stations, phiStart, phiLength } = torsoShellStations(shape, bust, belly, butt, hemY)
  // Sweaters knit chunky: grow every station a centimeter past cloth dims.
  const chunky = stations.map((st) => ({
    center: st.center,
    width: st.width + 0.02,
    height: st.height + 0.02
  }))
  const body = makeSweep(chunky, 20, false, false, phiStart, phiLength)
  // Ribbed hem band hugging the hem station.
  const hem = chunky[0]
  const hemBand = makeSweep(
    [
      { center: [0, hemY + 0.005, 0], width: hem.width + 0.012, height: hem.height + 0.012 },
      { center: [0, hemY + 0.06, 0], width: hem.width + 0.016, height: hem.height + 0.016 }
    ],
    20
  )
  // High collar standing past the neck base.
  const collar = new THREE.TorusGeometry(0.145, 0.035, 10, 24)
  collar.rotateX(Math.PI / 2)
  collar.translate(0, 1.6, 0.005)
  const clavEnd = 0.36 * shape.shoulderWidth
  const armStart = sleeveArmStart(shape)
  const sleeves = longSleeves(shape, armStart)
  return bindTop([body, hemBand, collar, ...sleeves], topSegments(clavEnd, armStart, true, clavEnd + 0.105))
}

/** Belted tunic: short-sleeved shell with a waist belt. Respects topLength. */
export function buildBeltedTunic(
  shape: BodyShape = DEFAULT_BODY_SHAPE,
  bust = BUST_DEFAULT,
  belly = 0.5,
  butt = BUTT_DEFAULT,
  topLength = TOP_LENGTH_DEFAULT
): GarmentBuildResult {
  const hemY = Math.min(hemYOf(topLength), 1.15)
  const { stations, phiStart, phiLength } = torsoShellStations(shape, bust, belly, butt, hemY)
  const body = makeSweep(stations, 20, false, false, phiStart, phiLength)
  const pelvisHalfW = 0.32 * shape.hipWidth + CLOTH_OFFSET
  const hipHalfD = Math.max(
    0.23 + CLOTH_OFFSET,
    halfDForProfile(pelvisHalfW, buttRearSamples(shape, butt)),
    buttRearDepth(shape, butt) + CLOTH_OFFSET
  )
  const { halfW: beltW, halfD: beltD } = waistDims(shape, belly, butt, hipHalfD, pelvisHalfW)
  const belt = new THREE.TorusGeometry(1, 0.024, 10, 28)
  belt.rotateX(Math.PI / 2)
  belt.scale(beltW + 0.022, 1, beltD + 0.022)
  // Belt rides the waist but never below the hem.
  belt.translate(0, Math.max(1.09, hemY + 0.04), 0)
  const clavEnd = 0.36 * shape.shoulderWidth
  const armStart = sleeveArmStart(shape)
  const { sleeves, outerX } = shortSleeves(shape, armStart)
  return bindTop([body, belt, ...sleeves], topSegments(clavEnd, armStart, false, outerX + 0.03))
}

/**
 * Dress: fitted bodice shell flaring into a skirt past the knees. Legs
 * below are bare by design (pair with tights); shirt slot like the robe.
 */
export function buildDress(
  shape: BodyShape = DEFAULT_BODY_SHAPE,
  bust = BUST_DEFAULT,
  belly = 0.5,
  butt = BUTT_DEFAULT
): GarmentBuildResult {
  const hemY = 0.55
  const { stations, phiStart, phiLength } = torsoShellStations(shape, bust, belly, butt, 0.95)
  const bodice = makeSweep(stations, 20, false, false, phiStart, phiLength)
  // Skirt flares from the hip shell past the knee; waist sash on top.
  // Depths track hipHalfD (pelvis + full butt silhouette), not fixed numbers.
  const pelvisHalfW = 0.32 * shape.hipWidth + CLOTH_OFFSET
  const hipHalfD = Math.max(
    0.23 + CLOTH_OFFSET,
    halfDForProfile(pelvisHalfW, buttRearSamples(shape, butt)),
    buttRearDepth(shape, butt) + CLOTH_OFFSET
  )
  const skirtFlare = (y: number, wFlare: number, dFlare: number): SweepStation => ({
    center: [0, y, 0],
    width: (pelvisHalfW + 0.02 + wFlare) * 2,
    height: (hipHalfD + 0.02 + dFlare) * 2
  })
  const skirt = makeSweep(
    [
      skirtFlare(0.98, 0.0, 0.0),
      skirtFlare(0.8, 0.05, 0.04),
      skirtFlare(0.66, 0.1, 0.07),
      skirtFlare(hemY, 0.14, 0.09)
    ],
    24
  )
  const { halfW: sashW, halfD: sashD } = waistDims(shape, belly, butt, 0.3, pelvisHalfW)
  const sash = new THREE.TorusGeometry(1, 0.02, 10, 28)
  sash.rotateX(Math.PI / 2)
  sash.scale(sashW + 0.018, 1, sashD + 0.018)
  sash.translate(0, 1.06, 0)
  const clavEnd = 0.36 * shape.shoulderWidth
  const armStart = sleeveArmStart(shape)
  return bindTop([bodice, skirt, sash], topSegments(clavEnd, armStart, false))
}

/** Long leather duster: torso shell + long sleeves + flared skirt to the knees. */
export function buildLongCoat(
  shape: BodyShape = DEFAULT_BODY_SHAPE,
  bust = BUST_DEFAULT,
  belly = 0.5,
  butt = BUTT_DEFAULT
): GarmentBuildResult {
  const hemY = 0.62
  const { stations, phiStart, phiLength } = torsoShellStations(shape, bust, belly, butt, 0.95)
  const body = makeSweep(stations, 20, false, false, phiStart, phiLength)
  const pelvisHalfW = 0.32 * shape.hipWidth + CLOTH_OFFSET
  const hipHalfD = Math.max(
    0.23 + CLOTH_OFFSET,
    halfDForProfile(pelvisHalfW, buttRearSamples(shape, butt)),
    buttRearDepth(shape, butt) + CLOTH_OFFSET
  )
  const skirt = makeSweep(
    [0.98, 0.8, hemY].map((y, i) => ({
      center: [0, y, 0] as [number, number, number],
      width: (pelvisHalfW + 0.025 + i * 0.035) * 2,
      height: (hipHalfD + 0.025 + i * 0.03) * 2
    })),
    24
  )
  // Turned-up collar standing proud of the neck.
  const collar = new THREE.TorusGeometry(0.16, 0.032, 10, 24)
  collar.rotateX(Math.PI / 2)
  collar.translate(0, 1.6, 0.005)
  const clavEnd = 0.36 * shape.shoulderWidth
  const armStart = sleeveArmStart(shape)
  const sleeves = longSleeves(shape, armStart)
  return bindTop([body, skirt, collar, ...sleeves], topSegments(clavEnd, armStart, true, clavEnd + 0.105))
}

/**
 * Crusader tabard: sleeveless long shell to the knees + waist belt +
 * shoulder flaps. Worn over plate by design (clearance matches the shell).
 */
export function buildTabard(
  shape: BodyShape = DEFAULT_BODY_SHAPE,
  bust = BUST_DEFAULT,
  belly = 0.5,
  butt = BUTT_DEFAULT
): GarmentBuildResult {
  const hemY = 0.72
  const { stations, phiStart, phiLength } = torsoShellStations(shape, bust, belly, butt, hemY)
  const body = makeSweep(stations, 20, false, false, phiStart, phiLength)
  const pelvisHalfW = 0.32 * shape.hipWidth + CLOTH_OFFSET
  const hipHalfD = Math.max(
    0.23 + CLOTH_OFFSET,
    halfDForProfile(pelvisHalfW, buttRearSamples(shape, butt)),
    buttRearDepth(shape, butt) + CLOTH_OFFSET
  )
  const { halfW: beltW, halfD: beltD } = waistDims(shape, belly, butt, hipHalfD, pelvisHalfW)
  const belt = new THREE.TorusGeometry(1, 0.024, 10, 28)
  belt.rotateX(Math.PI / 2)
  belt.scale(beltW + 0.022, 1, beltD + 0.022)
  belt.translate(0, 1.02, 0)
  // Shoulder flaps capping the deltoids.
  const flaps: THREE.BufferGeometry[] = []
  for (const side of [-1, 1] as const) {
    const flap = makeEllipsoid(0.11, 0.05, 0.12, 14, 10)
    translateGeometry(flap, side * (0.36 * shape.shoulderWidth + 0.005), 1.56, 0)
    flaps.push(flap)
  }
  const clavEnd = 0.36 * shape.shoulderWidth
  const armStart = sleeveArmStart(shape)
  return bindTop([body, belt, ...flaps], topSegments(clavEnd, armStart, false))
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
// Sprint 31 pants: kilt, leggings, overalls.
// ---------------------------------------------------------------------------

/**
 * Pleated kilt: flared shell to the knee with pressed pleat ridges.
 * Bare legs below by design (like shorts).
 */
export function buildKilt(
  shape: BodyShape = DEFAULT_BODY_SHAPE,
  butt = BUTT_DEFAULT,
  belly = 0.5
): GarmentBuildResult {
  const { stations } = hipShellStations(shape, butt, belly)
  const hip = makeSweep(stations, 20)
  const pelvisHalfW = 0.32 * shape.hipWidth + CLOTH_OFFSET
  const flare = makeSweep(
    [
      { center: [0, 0.82, 0], width: (pelvisHalfW + 0.04) * 2, height: 0.54 },
      { center: [0, 0.68, 0], width: (pelvisHalfW + 0.09) * 2, height: 0.58 },
      { center: [0, 0.56, 0], width: (pelvisHalfW + 0.13) * 2, height: 0.6 }
    ],
    24
  )
  // Pleat ridges: thin vertical fins pressed around the flare.
  const pleats: THREE.BufferGeometry[] = []
  const pleatCount = 10
  for (let i = 0; i < pleatCount; i++) {
    const a = (i / pleatCount) * Math.PI * 2
    const px = Math.cos(a)
    const pz = Math.sin(a)
    const fin = new THREE.BoxGeometry(0.018, 0.26, 0.03)
    fin.translate(0, 0, 0)
    // Stand the fin radially on the flare surface, top tucked under the hip.
    const m = new THREE.Matrix4()
    const rot = new THREE.Matrix4().makeRotationY(-a + Math.PI / 2)
    m.copy(rot)
    m.setPosition(px * (pelvisHalfW + 0.1), 0.68, pz * 0.29)
    fin.applyMatrix4(m)
    pleats.push(fin)
  }
  // Waistband ring.
  const { halfW: beltW, halfD: beltD } = waistDims(shape, belly, butt, 0.29, pelvisHalfW)
  const waistband = new THREE.TorusGeometry(1, 0.02, 10, 28)
  waistband.rotateX(Math.PI / 2)
  waistband.scale(beltW + 0.02, 1, beltD + 0.02)
  waistband.translate(0, 1.0, 0)
  return bindPants([hip, flare, waistband, ...pleats])
}

/** Leggings: second-skin tubes + high waistband + ankle cuffs + stirrups. */
export function buildLeggings(
  shape: BodyShape = DEFAULT_BODY_SHAPE,
  butt = BUTT_DEFAULT,
  belly = 0.5
): GarmentBuildResult {
  const TIGHT_OFFSET = 0.004
  const { stations } = hipShellStations(shape, butt, belly)
  const hip = makeSweep(stations, 20)
  const legs = legPair(FULL_LEG_STATIONS, TIGHT_OFFSET, 0.92)
  const pelvisHalfW = 0.32 * shape.hipWidth + CLOTH_OFFSET
  const { halfW: beltW, halfD: beltD } = waistDims(shape, belly, butt, 0.29, pelvisHalfW)
  const waistband = new THREE.TorusGeometry(1, 0.024, 10, 28)
  waistband.rotateX(Math.PI / 2)
  waistband.scale(beltW + 0.016, 1, beltD + 0.016)
  waistband.translate(0, 1.04, 0)
  const extras: THREE.BufferGeometry[] = [waistband]
  for (const side of [-1, 1] as const) {
    // Ankle cuff + stirrup strap under the arch.
    const cuff = new THREE.TorusGeometry(0.0375 * MUSCLE_HEADROOM + TIGHT_OFFSET + 0.008, 0.016, 8, 18)
    cuff.translate(side * 0.18, 0.16, 0)
    extras.push(cuff)
    const stirrup = new THREE.BoxGeometry(0.03, 0.02, 0.16)
    stirrup.translate(side * 0.18, 0.012, 0.05)
    extras.push(stirrup)
  }
  return bindPants([hip, ...legs, ...extras])
}

/**
 * Bib overalls: work pants + chest bib + shoulder straps. Straps ride to
 * mid-chest (Spine-bound, same region as the chest they hug) with buttons.
 */
export function buildOveralls(
  shape: BodyShape = DEFAULT_BODY_SHAPE,
  butt = BUTT_DEFAULT,
  belly = 0.5
): GarmentBuildResult {
  const { stations } = hipShellStations(shape, butt, belly)
  const hip = makeSweep(stations, 20)
  const legs = legPair(FULL_LEG_STATIONS, CLOTH_OFFSET)
  // Bib panel up the front to mid-chest.
  const bellyScale = bellyScaleOf(belly)
  const bib = makeSweep(
    [
      { center: [0, 1.0, 0.16 * bellyScale], width: 0.3, height: 0.1 },
      { center: [0, 1.15, 0.185 * bellyScale], width: 0.28, height: 0.1 },
      { center: [0, 1.3, 0.19 * bellyScale], width: 0.26, height: 0.1 }
    ],
    12
  )
  const parts: THREE.BufferGeometry[] = [hip, ...legs, bib]
  // Chest front tracks the belly-scaled profile so straps hug the surface.
  const chestFront = (y: number): number =>
    profileAt(shape, y).d * (y >= 1.0 && y <= 1.18 ? bellyScale : 1) + CLOTH_OFFSET + 0.03
  for (const side of [-1, 1] as const) {
    // Strap up the chest front, over the trapezius crest, down the back.
    parts.push(
      makeSweep(
        [
          { center: [side * 0.11, 1.3, chestFront(1.3)], width: 0.07, height: 0.05 },
          { center: [side * 0.12, 1.45, chestFront(1.45)], width: 0.07, height: 0.05 },
          { center: [side * 0.14, 1.6, 0.05], width: 0.07, height: 0.05 },
          { center: [side * 0.14, 1.62, -0.04], width: 0.07, height: 0.05 },
          { center: [side * 0.13, 1.5, -0.17], width: 0.07, height: 0.05 },
          { center: [side * 0.12, 1.35, -(chestFront(1.35) - 0.02)], width: 0.07, height: 0.05 }
        ],
        8
      )
    )
    const button = new THREE.SphereGeometry(0.022, 10, 8)
    button.translate(side * 0.11, 1.28, 0.2 * bellyScale + 0.045)
    parts.push(button)
  }
  return bindPants(parts)
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

// ---------------------------------------------------------------------------
// Face accessories (head slot) + more hats (helmet slot). Eye geometry
// follows buildFace: eyeX = W*0.38*spacing at eyeWorldY.
// ---------------------------------------------------------------------------

function accessoryEye(shape: BodyShape, face: FaceShape): { eyeX: number; eyeY: number } {
  return {
    eyeX: shape.headWidth * 0.38 * face.eyeSpacing,
    eyeY: CRANIUM_CENTER_Y + shape.headHeight * 0.12
  }
}

/** Sunglasses: dark lens discs proud of the eyes + bridge + temples. */
export function buildSunglasses(
  shape: BodyShape = DEFAULT_BODY_SHAPE,
  face: FaceShape = DEFAULT_FACE_SHAPE
): GarmentBuildResult {
  const { eyeX, eyeY } = accessoryEye(shape, face)
  const parts: THREE.BufferGeometry[] = []
  for (const side of [-1, 1]) {
    const lens = new THREE.SphereGeometry(1, 18, 12)
    lens.scale(0.05, 0.038, 0.022)
    const lz = surfaceZ(shape, side * eyeX, eyeY) + 0.008
    lens.translate(side * eyeX, eyeY, lz)
    parts.push(lens)
    const temple = makeSweep(
      [
        { center: [side * (eyeX + 0.04), eyeY, lz - 0.01], width: 0.016, height: 0.016 },
        { center: [side * shape.headWidth * 0.7, eyeY + 0.03, -0.08], width: 0.016, height: 0.016 },
        { center: [side * shape.headWidth * 0.85, eyeY + 0.04, -0.12], width: 0.016, height: 0.016 }
      ],
      8
    )
    parts.push(temple)
  }
  const bridge = makeSweep(
    [
      {
        center: [-eyeX + 0.02, eyeY + 0.005, surfaceZ(shape, -eyeX + 0.02, eyeY) + 0.008],
        width: 0.016,
        height: 0.016
      },
      {
        center: [0, eyeY + 0.018, surfaceZ(shape, 0, eyeY + 0.018) + 0.008],
        width: 0.016,
        height: 0.016
      },
      {
        center: [eyeX - 0.02, eyeY + 0.005, surfaceZ(shape, eyeX - 0.02, eyeY) + 0.008],
        width: 0.016,
        height: 0.016
      }
    ],
    8
  )
  parts.push(bridge)
  return bindHat(parts)
}

/** Ski goggles: wide lens band + strap around the head. */
export function buildGoggles(
  shape: BodyShape = DEFAULT_BODY_SHAPE,
  face: FaceShape = DEFAULT_FACE_SHAPE
): GarmentBuildResult {
  const { eyeX, eyeY } = accessoryEye(shape, face)
  const band = new THREE.SphereGeometry(1, 24, 12)
  band.scale(eyeX + 0.06, 0.055, 0.035)
  band.translate(0, eyeY, surfaceZ(shape, 0, eyeY) + 0.005)
  const strap = new THREE.TorusGeometry(shape.headWidth + 0.015, 0.018, 10, 28)
  strap.rotateX(Math.PI / 2)
  strap.translate(0, eyeY, CRANIUM_CENTER_Z)
  return bindHat([band, strap])
}

/** Face mask: shell over mouth/chin, tucked under the nose. */
export function buildFaceMask(
  shape: BodyShape = DEFAULT_BODY_SHAPE,
  face: FaceShape = DEFAULT_FACE_SHAPE
): GarmentBuildResult {
  // Mirror buildFace anchoring: mouth sits 2cm below the nose bottom edge.
  const noseWorldY = CRANIUM_CENTER_Y - shape.headHeight * 0.15
  const noseBottomY = noseWorldY - 0.05 * face.noseSize
  const centerY = noseBottomY - 0.005 - 0.055
  const mask = new THREE.SphereGeometry(1, 20, 14)
  mask.scale(0.1, 0.06, 0.05)
  mask.translate(0, centerY, surfaceZ(shape, 0, centerY) + 0.01)
  return bindHat([mask])
}

/** Top hat: tall straight crown containing the upper skull + flat brim. */
export function buildTopHat(
  shape: BodyShape = DEFAULT_BODY_SHAPE,
  face: FaceShape = DEFAULT_FACE_SHAPE
): GarmentBuildResult {
  const rimY = hatRimY(shape, face)
  // Crown radius clears the cranium at every overlapping height (widest low).
  const cr = shape.headWidth + 0.015
  const crown = new THREE.CylinderGeometry(cr, cr, 0.22, 24)
  crown.translate(0, rimY + 0.11, CRANIUM_CENTER_Z)
  const brim = new THREE.CylinderGeometry(cr + 0.12, cr + 0.12, 0.008, 28)
  brim.translate(0, rimY, CRANIUM_CENTER_Z)
  return bindHat([crown, brim])
}

/** Hood: long shell to the nape with a wide face opening. */
export function buildHood(shape: BodyShape = DEFAULT_BODY_SHAPE): GarmentBuildResult {
  const shell = new THREE.SphereGeometry(
    1,
    24,
    16,
    Math.PI / 2 + 0.85,
    Math.PI * 2 - 0.85 * 2,
    0,
    Math.PI * 0.85
  )
  shell.scale(shape.headWidth + 0.03, shape.headHeight + 0.03, shape.headLength + 0.03)
  shell.translate(0, CRANIUM_CENTER_Y, CRANIUM_CENTER_Z)
  return bindHat([shell])
}

// ---------------------------------------------------------------------------
// Hair (hair slot). Shells leave a face wedge open around +Z. Sphere phi
// convention: +Z surface sits at phi=PI/2, so the excluded wedge centers
// there (same convention as open-front sweeps).
// ---------------------------------------------------------------------------

const HAIR_SEGMENTS: BoneSegment[] = [{ name: 'Head', start: [0, 1.75, 0], end: [0, 2.08, 0] }]

function bindHair(parts: THREE.BufferGeometry[]): GarmentBuildResult {
  const merged = mergeGeometries(parts)
  if (!merged) {
    throw new Error('bindHair: mergeGeometries returned null')
  }
  const binding = computeSkinBindings(
    merged.attributes.position.array as Float32Array,
    HAIR_SEGMENTS
  )
  applySkinAttributes(merged, binding)
  return { geometry: merged, boneNames: HAIR_SEGMENTS.map((s) => s.name) }
}

/** Partial sphere shell around the cranium with a face wedge cut out. */
function hairShell(
  shape: BodyShape,
  growX: number,
  growY: number,
  growZ: number,
  thetaLength: number,
  gapHalf: number
): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(
    1,
    24,
    16,
    Math.PI / 2 + gapHalf,
    Math.PI * 2 - gapHalf * 2,
    0,
    thetaLength
  )
  geo.scale(shape.headWidth + growX, shape.headHeight + growY, shape.headLength + growZ)
  geo.translate(0, CRANIUM_CENTER_Y, CRANIUM_CENTER_Z)
  return geo
}

/** Short crop: skull-hugging shell over ears to the nape, face open. */
export function buildCropHair(shape: BodyShape = DEFAULT_BODY_SHAPE): GarmentBuildResult {
  return bindHair([hairShell(shape, 0.05, 0.015, 0.03, Math.PI * 0.72, 0.7)])
}

/** Ponytail: cap plus a tail sweep rooted under the crown. */
export function buildPonytail(shape: BodyShape = DEFAULT_BODY_SHAPE): GarmentBuildResult {
  const cap = hairShell(shape, 0.03, 0.015, 0.02, Math.PI * 0.55, 0.7)
  // Tail root starts inside the skull (hidden joint), emerging below the cap.
  // Widths/heights are full extents (diameter).
  const tail = makeSweep(
    [
      { center: [0, 2.06, -0.17], width: 0.1, height: 0.1 },
      { center: [0, 1.9, -0.23], width: 0.096, height: 0.096 },
      { center: [0, 1.68, -0.27], width: 0.084, height: 0.084 },
      { center: [0, 1.5, -0.28], width: 0.068, height: 0.068 },
      { center: [0, 1.38, -0.27], width: 0.056, height: 0.056 }
    ],
    12,
    false,
    true
  )
  const tie = new THREE.TorusGeometry(0.055, 0.015, 10, 20)
  tie.rotateX(Math.PI / 2)
  tie.translate(0, 1.84, -0.25)
  return bindHair([cap, tail, tie])
}

/** Mohawk: thin fin rooted into the crown, shaved sides by design. */
export function buildMohawk(shape: BodyShape = DEFAULT_BODY_SHAPE): GarmentBuildResult {
  const top = CRANIUM_CENTER_Y + shape.headHeight
  const fin = new THREE.SphereGeometry(1, 12, 10)
  fin.scale(0.028, 0.1, 0.17)
  // Bottom sits 0.07 below the crown (embedded root, never floats).
  fin.translate(0, top + 0.03, CRANIUM_CENTER_Z - 0.01)
  return bindHair([fin])
}

/** Rear depth of the butt ellipsoid at height y (or -Infinity above it). */
function buttRearAtY(shape: BodyShape, butt: number, y: number): number {
  const buttR = 0.055 * shape.hipWidth + 0.065 * butt
  const dy = (y - 0.925) / buttR
  if (Math.abs(dy) >= 1) return -Infinity
  return 0.13 + 0.055 * butt + buttR * Math.sqrt(1 - dy * dy)
}

/**
 * Long hair: skull shell plus a mane panel down the back. The panel front
 * clears tube, belly-scaled waist, and butt; only the Head bone carries it.
 */
export function buildLongHair(
  shape: BodyShape = DEFAULT_BODY_SHAPE,
  butt = BUTT_DEFAULT,
  belly = 0.5
): GarmentBuildResult {
  const shell = hairShell(shape, 0.035, 0.015, 0.03, Math.PI * 0.8, 0.7)
  const bellyScale = bellyScaleOf(belly)
  const stations: SweepStation[] = []
  for (const y of [1.95, 1.7, 1.5, 1.3, 1.12]) {
    const tubeD = profileAt(shape, y).d * (y >= 1.0 && y <= 1.18 ? bellyScale : 1)
    const front = Math.max(tubeD, buttRearAtY(shape, butt, y)) + 0.035
    stations.push({
      center: [0, y, -(front + 0.0375)],
      width: 0.3,
      height: 0.075
    })
  }
  const fall = makeSweep(stations, 14, false, true)
  return bindHair([shell, fall])
}

// ---------------------------------------------------------------------------
// Sprint 31 hair: bun, bob, pigtails, fade.
// ---------------------------------------------------------------------------

/** Topknot bun: crop shell + knot sphere + tie ring. */
export function buildBunHair(shape: BodyShape = DEFAULT_BODY_SHAPE): GarmentBuildResult {
  const cap = hairShell(shape, 0.05, 0.015, 0.03, Math.PI * 0.72, 0.7)
  const top = CRANIUM_CENTER_Y + shape.headHeight
  const knot = new THREE.SphereGeometry(0.075, 16, 12)
  knot.scale(1, 0.9, 1)
  knot.translate(0, top + 0.045, CRANIUM_CENTER_Z - 0.02)
  const tie = new THREE.TorusGeometry(0.062, 0.014, 8, 20)
  tie.rotateX(Math.PI / 2)
  tie.translate(0, top - 0.01, CRANIUM_CENTER_Z - 0.02)
  return bindHair([cap, knot, tie])
}

/** Bob: jaw-length shell with a nape fall, face open. */
export function buildBobHair(shape: BodyShape = DEFAULT_BODY_SHAPE): GarmentBuildResult {
  const shell = hairShell(shape, 0.055, 0.02, 0.035, Math.PI * 0.86, 0.72)
  // Nape panel down to the shoulders behind the jaw.
  const fall = makeSweep(
    [
      { center: [0, 1.78, -0.2], width: 0.3, height: 0.08 },
      { center: [0, 1.64, -0.24], width: 0.32, height: 0.08 },
      { center: [0, 1.52, -0.26], width: 0.3, height: 0.07 }
    ],
    14,
    false,
    true
  )
  return bindHair([shell, fall])
}

/** Pigtails: cap shell + twin side tails with ties. */
export function buildPigtailsHair(shape: BodyShape = DEFAULT_BODY_SHAPE): GarmentBuildResult {
  const cap = hairShell(shape, 0.045, 0.015, 0.028, Math.PI * 0.62, 0.68)
  const parts: THREE.BufferGeometry[] = [cap]
  const top = CRANIUM_CENTER_Y + shape.headHeight
  for (const side of [-1, 1] as const) {
    const rootX = side * (shape.headWidth + 0.02)
    // Tails hang behind the shoulder line (z < -0.15) so wide/muscled
    // deltoids never clip them.
    parts.push(
      makeSweep(
        [
          { center: [rootX, top - 0.02, -0.05], width: 0.085, height: 0.085 },
          { center: [side * (shape.headWidth + 0.09), 1.82, -0.16], width: 0.075, height: 0.075 },
          { center: [side * (shape.headWidth + 0.11), 1.62, -0.2], width: 0.06, height: 0.06 },
          { center: [side * (shape.headWidth + 0.1), 1.46, -0.22], width: 0.048, height: 0.048 }
        ],
        10,
        false,
        true
      )
    )
    const tie = new THREE.TorusGeometry(0.045, 0.013, 8, 18)
    tie.rotateX(Math.PI / 2)
    tie.translate(rootX, top - 0.03, -0.06)
    parts.push(tie)
  }
  return bindHair(parts)
}

/** Fade: buzz-short shell hugging the skull, ears out by design. */
export function buildFadeHair(shape: BodyShape = DEFAULT_BODY_SHAPE): GarmentBuildResult {
  return bindHair([hairShell(shape, 0.018, 0.008, 0.014, Math.PI * 0.58, 0.66)])
}

// ---------------------------------------------------------------------------
// Extremities + facial hair (Sprint 26). Shoes follow Foot, gloves follow
// Hand (both rigid: no rebuild needed beyond torso refreshes); beards ride
// the Head bone and track face/nose/mouth anchors like the face itself.
// ---------------------------------------------------------------------------

const FOOT_SEGMENTS: BoneSegment[] = [
  { name: 'LeftUpperLeg', start: [-0.18, 0.86, 0], end: [-0.18, 0.5, 0] },
  { name: 'LeftCalf', start: [-0.18, 0.5, 0], end: [-0.18, 0.12, 0] },
  { name: 'LeftFoot', start: [-0.18, 0.1, -0.02], end: [-0.18, 0.05, 0.2] },
  { name: 'RightUpperLeg', start: [0.18, 0.86, 0], end: [0.18, 0.5, 0] },
  { name: 'RightCalf', start: [0.18, 0.5, 0], end: [0.18, 0.12, 0] },
  { name: 'RightFoot', start: [0.18, 0.1, -0.02], end: [0.18, 0.05, 0.2] }
]

const HAND_SEGMENTS: BoneSegment[] = [
  { name: 'LeftUpperArm', start: [-0.36, 1.5, 0], end: [-0.66, 1.5, 0] },
  { name: 'LeftForearm', start: [-0.66, 1.5, 0], end: [-0.91, 1.51, 0] },
  { name: 'LeftHand', start: [-0.91, 1.51, 0], end: [-1.06, 1.51, 0] },
  { name: 'RightUpperArm', start: [0.36, 1.5, 0], end: [0.66, 1.5, 0] },
  { name: 'RightForearm', start: [0.66, 1.5, 0], end: [0.91, 1.51, 0] },
  { name: 'RightHand', start: [0.91, 1.51, 0], end: [1.06, 1.51, 0] }
]

function bindFeet(parts: THREE.BufferGeometry[]): GarmentBuildResult {
  const merged = mergeGeometries(parts)
  if (!merged) {
    throw new Error('bindFeet: mergeGeometries returned null')
  }
  const binding = computeSkinBindings(
    merged.attributes.position.array as Float32Array,
    FOOT_SEGMENTS
  )
  applySkinAttributes(merged, binding)
  return { geometry: merged, boneNames: FOOT_SEGMENTS.map((s) => s.name) }
}

function bindHands(parts: THREE.BufferGeometry[]): GarmentBuildResult {
  const merged = mergeGeometries(parts)
  if (!merged) {
    throw new Error('bindHands: mergeGeometries returned null')
  }
  const binding = computeSkinBindings(
    merged.attributes.position.array as Float32Array,
    HAND_SEGMENTS
  )
  applySkinAttributes(merged, binding)
  return { geometry: merged, boneNames: HAND_SEGMENTS.map((s) => s.name) }
}

/** Foot last profile (matches buildLeg): [y, z, w, d]. */
const FOOT_PROFILE: Array<[number, number, number, number]> = [
  [0.055, -0.02, 0.095, 0.1],
  [0.045, 0.03, 0.088, 0.075],
  [0.045, 0.09, 0.09, 0.062],
  [0.04, 0.15, 0.078, 0.045]
]

function footShell(offset: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  for (const side of [-1, 1] as const) {
    // Toe and heel extensions past the foot extremities: flat end caps
    // coplanar with foot tips read as misses, so the shoe overhangs both.
    const stations: SweepStation[] = [
      { center: [side * 0.18, 0.07, -0.055], width: 0.12 + offset * 2, height: 0.13 + offset * 2 },
      ...FOOT_PROFILE.map(([y, z, w, d]) => ({
        center: [side * 0.18, y, z] as [number, number, number],
        width: w + offset * 2,
        height: d + offset * 2
      })),
      { center: [side * 0.18, 0.04, 0.195], width: 0.07 + offset * 2, height: 0.05 + offset * 2 }
    ]
    out.push(makeSweep(stations, 12, true, true))
    // Sole slab under the foot.
    const sole = new THREE.BoxGeometry(0.13 + offset, 0.035, 0.34)
    sole.translate(side * 0.18, 0.0175, 0.055)
    out.push(sole)
  }
  return out
}

/** Low shoes: foot-last shell + sole. */
export function buildShoes(): GarmentBuildResult {
  return bindFeet(footShell(0.02))
}

/** Boots: foot shell + sole + calf shaft with cuff. */
export function buildBoots(): GarmentBuildResult {
  const parts = footShell(0.02)
  for (const side of [-1, 1] as const) {
    // Shaft clears max-muscle calves (0.0925 * 1.3); boots run roomy.
    const shaft = makeSweep(
      [
        { center: [side * 0.18, 0.1, 0], width: 0.25, height: 0.24 },
        { center: [side * 0.18, 0.24, 0], width: 0.24, height: 0.23 },
        { center: [side * 0.18, 0.38, 0], width: 0.25, height: 0.24 }
      ],
      14,
      false,
      true
    )
    parts.push(shaft)
    const cuff = new THREE.TorusGeometry(0.13, 0.022, 10, 20)
    cuff.rotateX(Math.PI / 2)
    cuff.translate(side * 0.18, 0.38, 0)
    parts.push(cuff)
  }
  return bindFeet(parts)
}

/** Palm + thumb shell dimensions (matches buildArm mitten). */
function gloveShell(offset: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  for (const side of [-1, 1] as const) {
    const s = side
    const palm = makeEllipsoid(0.07 + offset, 0.055 + offset, 0.028 + offset, 16, 12)
    translateGeometry(palm, s * 1.005, 1.505, 0)
    out.push(palm)
    const thumb = makeEllipsoid(0.034 + offset, 0.024 + offset, 0.024 + offset, 10, 8)
    translateGeometry(thumb, s * 0.972, 1.487, -0.042)
    out.push(thumb)
    const cuff = new THREE.TorusGeometry(0.055 + offset, 0.02, 10, 20)
    cuff.rotateY(Math.PI / 2)
    cuff.translate(s * 0.92, 1.508, 0)
    out.push(cuff)
  }
  return out
}

/** Work gloves: palm shell + wrist cuff. */
export function buildGloves(): GarmentBuildResult {
  return bindHands(gloveShell(0.012))
}

/** Gauntlets: gloves + forearm cuff tube. */
export function buildGauntlets(): GarmentBuildResult {
  const parts = gloveShell(0.012)
  for (const side of [-1, 1] as const) {
    const s = side
    parts.push(
      makeSweep(
        [
          { center: [s * 0.9, 1.508, 0], width: 0.15, height: 0.14 },
          { center: [s * 0.78, 1.505, 0], width: 0.14, height: 0.13 },
          { center: [s * 0.7, 1.502, 0], width: 0.15, height: 0.14 }
        ],
        12,
        false,
        true
      )
    )
  }
  return bindHands(parts)
}

/**
 * Sandals (Sprint 31): sole + toe strap + ankle strap. Open footwear by
 * design — exempt from the closed toe/heel bands in the probe.
 */
export function buildSandals(): GarmentBuildResult {
  const parts: THREE.BufferGeometry[] = []
  for (const side of [-1, 1] as const) {
    const sole = new THREE.BoxGeometry(0.15, 0.03, 0.36)
    sole.translate(side * 0.18, 0.015, 0.055)
    parts.push(sole)
    // Toe strap across the ball + ankle strap ring.
    const toeStrap = new THREE.BoxGeometry(0.13, 0.025, 0.035)
    toeStrap.translate(side * 0.18, 0.075, 0.1)
    parts.push(toeStrap)
    const ankle = new THREE.TorusGeometry(0.075, 0.014, 8, 18)
    ankle.rotateX(Math.PI / 2)
    ankle.translate(side * 0.18, 0.09, -0.01)
    parts.push(ankle)
  }
  return bindFeet(parts)
}

/**
 * Bracers (Sprint 31): tooled forearm cuffs with lace rings, hands bare
 * by design — exempt from the fingers band in the probe.
 */
export function buildBracers(): GarmentBuildResult {
  const parts: THREE.BufferGeometry[] = []
  for (const side of [-1, 1] as const) {
    const s = side
    parts.push(
      makeSweep(
        [
          { center: [s * 0.88, 1.508, 0], width: 0.125, height: 0.115 },
          { center: [s * 0.76, 1.505, 0], width: 0.135, height: 0.125 },
          { center: [s * 0.66, 1.502, 0], width: 0.14, height: 0.13 }
        ],
        12,
        false,
        true
      )
    )
    for (const lx of [0.7, 0.78, 0.86]) {
      const lace = new THREE.TorusGeometry(0.068, 0.01, 8, 18)
      lace.rotateY(Math.PI / 2)
      lace.translate(s * lx, 1.505, 0)
      parts.push(lace)
    }
  }
  return bindHands(parts)
}

/** Mouth anchor (mirrors buildFace): always 2cm below the nose bottom edge. */
function beardMouthY(shape: BodyShape, face: FaceShape): number {
  const noseWorldY = CRANIUM_CENTER_Y - shape.headHeight * 0.15
  const noseBottomY = noseWorldY - 0.05 * face.noseSize
  return noseBottomY - 0.02
}

/** Goatee: chin tuft below the mouth. */
export function buildGoatee(
  shape: BodyShape = DEFAULT_BODY_SHAPE,
  face: FaceShape = DEFAULT_FACE_SHAPE
): GarmentBuildResult {
  const mouthY = beardMouthY(shape, face)
  const tuft = makeEllipsoid(0.035, 0.05, 0.03, 12, 10)
  translateGeometry(tuft, 0, mouthY - 0.055, surfaceZ(shape, 0, mouthY - 0.055) + 0.005)
  return bindHat([tuft])
}

/** Full beard: shell over jaw front and chin, mouth tucked inside. */
export function buildFullBeard(
  shape: BodyShape = DEFAULT_BODY_SHAPE,
  face: FaceShape = DEFAULT_FACE_SHAPE
): GarmentBuildResult {
  const mouthY = beardMouthY(shape, face)
  const beard = makeEllipsoid(shape.headWidth * 0.52, 0.1, 0.1, 18, 14)
  translateGeometry(beard, 0, mouthY - 0.04, surfaceZ(shape, 0, mouthY - 0.04))
  return bindHat([beard])
}

/** Mustache: hair torus arched over the mouth. */
export function buildMustache(
  shape: BodyShape = DEFAULT_BODY_SHAPE,
  face: FaceShape = DEFAULT_FACE_SHAPE
): GarmentBuildResult {
  const mouthY = beardMouthY(shape, face)
  const radius = 0.055 * face.mouthWidth
  const arc = new THREE.TorusGeometry(radius, 0.013, 8, 16, Math.PI * 0.8)
  // Upper-half arch (frown orientation) centered over the mouth.
  arc.rotateZ(Math.PI * 0.1)
  arc.translate(0, mouthY + 0.028, surfaceZ(shape, 0, mouthY + 0.028) + 0.008)
  return bindHat([arc])
}

/**
 * Stubble (Sprint 31): five-o'clock shadow — a thin shell over the jaw
 * front and chin, deliberately shorter than the full beard.
 */
export function buildStubble(
  shape: BodyShape = DEFAULT_BODY_SHAPE,
  face: FaceShape = DEFAULT_FACE_SHAPE
): GarmentBuildResult {
  const mouthY = beardMouthY(shape, face)
  const jaw = makeEllipsoid(shape.headWidth * 0.46, 0.075, 0.075, 16, 12)
  translateGeometry(jaw, 0, mouthY - 0.045, surfaceZ(shape, 0, mouthY - 0.045) + 0.002)
  return bindHat([jaw])
}

// ---------------------------------------------------------------------------
// Plate armour (Sprint 27). Single-slot harness pieces in metal: cuirass +
// pauldrons + gorget (shirt), full leg harness (pants), closed armet
// (helmet, full_face tag so the dormant face-hiding rules fire live).
// ---------------------------------------------------------------------------

/**
 * Plate cuirass: torso shell + sternum ridge + fauld flare + pauldron caps
 * + gorget collar. Merged into one shirt-slot asset (slots hold one asset).
 */
/**
 * Plate cuirass v2 (Sprint 29): torso shell + sternum ridge + lame
 * articulation + trim + fauld flare + 2-layer pauldrons + gorget +
 * full arm harness (rerebraces + couters + vambraces meeting the
 * gauntlet cuff). Merged into one shirt-slot asset (slots hold one asset).
 */
export function buildPlate(
  shape: BodyShape = DEFAULT_BODY_SHAPE,
  bust = BUST_DEFAULT,
  belly = 0.5,
  butt = BUTT_DEFAULT,
  topLength = TOP_LENGTH_DEFAULT
): GarmentBuildResult {
  const bellyScale = bellyScaleOf(belly)
  const hemY = hemYOf(topLength)
  const { stations, phiStart, phiLength } = torsoShellStations(
    shape,
    bust,
    belly,
    butt,
    hemY
  )
  const body = makeSweep(stations, 20, false, false, phiStart, phiLength)
  // Sternum ridge riding the chest tube surface (belly-scaled at waist).
  const ridgeZ = (y: number): number => {
    const d = profileAt(shape, y).d * (y >= 1.0 && y <= 1.18 ? bellyScale : 1)
    return d + CLOTH_OFFSET + 0.015
  }
  const ridge = makeSweep(
    [
      { center: [0, 1.5, ridgeZ(1.5)], width: 0.05, height: 0.05 },
      { center: [0, 1.3, ridgeZ(1.3)], width: 0.05, height: 0.05 },
      { center: [0, 1.1, ridgeZ(1.1)], width: 0.045, height: 0.045 }
    ],
    10
  )
  // Lame articulation: flared bands overlapping the waist + fauld tops.
  // Each band is a short closed sweep standing proud of the shell below it.
  const lameBand = (y: number, flare: number): THREE.BufferGeometry => {
    const p = profileAt(shape, y)
    const bellyK = y >= 1.0 && y <= 1.18 ? bellyScale : 1
    const halfW = (p.w + CLOTH_OFFSET) * bellyK + flare
    const halfD = (p.d + CLOTH_OFFSET) * bellyK + flare
    return makeSweep(
      [
        { center: [0, y, 0], width: halfW * 2, height: halfD * 2 },
        { center: [0, y + 0.055, 0], width: (halfW + 0.012) * 2, height: (halfD + 0.012) * 2 }
      ],
      20
    )
  }
  // Hem + collar trim bands (same sweep-band pattern, tighter to the shell).
  const hemStation = stations[0]
  const hemTrim = makeSweep(
    [
      { center: [0, hemY + 0.005, 0], width: hemStation.width + 0.016, height: hemStation.height + 0.016 },
      { center: [0, hemY + 0.05, 0], width: hemStation.width + 0.02, height: hemStation.height + 0.02 }
    ],
    20
  )
  // Faulds: hip shell stations flared past the seat.
  const { stations: hipStations, pelvisHalfW, hipHalfD } = hipShellStations(shape, butt, belly)
  const faulds = makeSweep(
    [
      hipStations[0],
      hipStations[1],
      hipStations[2],
      {
        center: [0, 0.8, 0],
        width: (pelvisHalfW + 0.03) * 2,
        height: (hipHalfD + 0.03) * 2
      }
    ],
    20
  )
  // Pauldrons: two layered caps per shoulder, sized past max-muscle meat.
  const clavEnd = 0.36 * shape.shoulderWidth
  const pauldrons: THREE.BufferGeometry[] = []
  for (const side of [-1, 1] as const) {
    const inner = makeEllipsoid(0.13, 0.15, 0.125, 16, 12)
    translateGeometry(inner, side * (clavEnd + 0.005), 1.47, 0)
    pauldrons.push(inner)
    const outer = makeEllipsoid(0.15, 0.14, 0.14, 16, 12)
    translateGeometry(outer, side * (clavEnd + 0.075), 1.5, 0)
    pauldrons.push(outer)
  }
  const gorget = new THREE.TorusGeometry(0.16, 0.032, 10, 24)
  gorget.rotateX(Math.PI / 2)
  gorget.translate(0, 1.6, 0.005)
  // Arm harness: rerebrace tubes (deltoid -> elbow) + elbow couters +
  // vambrace tubes (elbow -> wrist, tucking under the gauntlet cuff at 0.7).
  // Proud of cloth dims (+0.012) with muscle headroom like sleeve tubes.
  const armR = (r: number): number => r * MUSCLE_HEADROOM + CLOTH_OFFSET + 0.012
  const arms: THREE.BufferGeometry[] = []
  for (const side of [-1, 1] as const) {
    const s = side
    arms.push(
      makeSweep(
        [
          { center: [s * (clavEnd - 0.05), 1.47, 0], width: 0.23, height: 0.24 },
          { center: [s * (clavEnd + 0.12), 1.485, 0], width: armR(0.0625) * 2, height: armR(0.0625) * 2 },
          { center: [s * 0.52, 1.495, 0], width: armR(0.058) * 2, height: armR(0.058) * 2 },
          { center: [s * 0.64, 1.5, 0], width: armR(0.052) * 2, height: armR(0.052) * 2 }
        ],
        14,
        false,
        true
      )
    )
    const couter = new THREE.SphereGeometry(1, 14, 10)
    couter.scale(0.08, 0.08, 0.075)
    couter.translate(s * 0.66, 1.5, 0.005)
    arms.push(couter)
    arms.push(
      makeSweep(
        [
          { center: [s * 0.62, 1.5, 0], width: armR(0.052) * 2, height: armR(0.052) * 2 },
          { center: [s * 0.72, 1.503, 0], width: armR(0.046) * 2, height: armR(0.046) * 2 },
          { center: [s * 0.82, 1.506, 0], width: armR(0.04) * 2, height: armR(0.04) * 2 },
          // Wrist end tucks inside the gauntlet cuff tube (half ~0.07).
          { center: [s * 0.9, 1.508, 0], width: 0.11, height: 0.11 }
        ],
        14,
        false,
        true
      )
    )
  }
  const armStart = sleeveArmStart(shape)
  return bindTop(
    [body, ridge, lameBand(1.02, 0.02), lameBand(1.1, 0.022), hemTrim, faulds, collarRing(), gorget, ...pauldrons, ...arms],
    topSegments(clavEnd, armStart, true, clavEnd + 0.23)
  )
}

/**
 * Plate legs: hip shell + thigh cuisses + knee cops + shin greaves to the
 * ankle. Boots cover the feet below (separate slot, no conflict).
 */
export function buildPlateLegs(
  shape: BodyShape = DEFAULT_BODY_SHAPE,
  butt = BUTT_DEFAULT,
  belly = 0.5
): GarmentBuildResult {
  const { stations } = hipShellStations(shape, butt, belly)
  const hip = makeSweep(stations, 20)
  // Plate stands a centimeter proud of cloth dims but shares the
  // muscle-tracking leg tubes, so cuisses follow thigh morphs.
  const legs: THREE.BufferGeometry[] = []
  for (const side of [-1, 1] as const) {
    const s = side
    legs.push(
      makeSweep(
        FULL_LEG_STATIONS.map(({ y, r }) => ({
          center: [s * 0.18, y, 0] as [number, number, number],
          width: (r * MUSCLE_HEADROOM + CLOTH_OFFSET + 0.01) * 2,
          height: (r * MUSCLE_HEADROOM + CLOTH_OFFSET + 0.01) * 2
        })),
        14,
        false,
        true
      )
    )
    // Knee cop (poleyn) over the knee bulge.
    const knee = new THREE.SphereGeometry(1, 14, 10)
    knee.scale(0.095, 0.095, 0.095)
    knee.translate(s * 0.18, 0.5, 0.045)
    legs.push(knee)
  }
  return bindPants([hip, ...legs])
}

/** Nose tip front for armet clearance (mirrors buildFace nose). */
function noseFrontZ(shape: BodyShape, face: FaceShape): number {
  const noseWorldY = CRANIUM_CENTER_Y - shape.headHeight * 0.15
  return surfaceZ(shape, 0, noseWorldY) + 0.03 * face.noseSize
}

/** Shared helm extents shape (single source for builder, probe, tests). */
export interface HelmExtents {
  cx: number
  cy: number
  cz: number
  rx: number
  ry: number
  rz: number
}

/** Eye-line height shared by all closed helms (mirrors buildFace). */
function helmEyeY(shape: BodyShape): number {
  return CRANIUM_CENTER_Y + shape.headHeight * 0.12
}

/** Theta on the unit sphere for a world height (helm shells are scaled spheres). */
function helmThetaOf(e: HelmExtents, y: number): number {
  return Math.acos(Math.max(-1, Math.min(1, (y - e.cy) / e.ry)))
}

/** Ellipsoid shell band between two world heights. */
function helmShell(e: HelmExtents, yTop: number, yBot: number): THREE.BufferGeometry {
  const t0 = helmThetaOf(e, yTop)
  const g = new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, t0, helmThetaOf(e, yBot) - t0)
  g.scale(e.rx, e.ry, e.rz)
  g.translate(e.cx, e.cy, e.cz)
  return g
}

/**
 * Rear filler closing a front-only gap. Sphere phi puts +Z front at
 * phi=PI/2; the filler is the complementary arc, extended slightly past
 * the gap edges to overlap (a real slit does not wrap the skull).
 */
function helmFiller(
  e: HelmExtents,
  yTop: number,
  yBot: number,
  halfAngle: number
): THREE.BufferGeometry {
  const t0 = helmThetaOf(e, yTop)
  const g = new THREE.SphereGeometry(
    1, 20, 4, Math.PI / 2 + halfAngle, Math.PI * 2 - halfAngle * 2, t0, helmThetaOf(e, yBot) - t0
  )
  g.scale(e.rx, e.ry, e.rz)
  g.translate(e.cx, e.cy, e.cz)
  return g
}

/** Front surface Z of a helm ellipsoid at height y (x=0 centerline). */
function helmFrontZ(e: HelmExtents, y: number): number {
  const k = Math.max(1 - ((y - e.cy) / e.ry) ** 2, 0.02)
  return e.cz + e.rz * Math.sqrt(k)
}

/** Armet extents (single source for builder, probe, and tests). */
export function armetExtents(shape: BodyShape, face: FaceShape): HelmExtents {
  const front = noseFrontZ(shape, face) + 0.04
  const rear = CRANIUM_CENTER_Z - shape.headLength - 0.04
  const top = CRANIUM_CENTER_Y + shape.headHeight + 0.05
  const bottom = 1.56
  return {
    cx: 0,
    cy: (top + bottom) / 2,
    cz: (front + rear) / 2,
    rx: shape.headWidth + 0.05,
    ry: (top - bottom) / 2,
    rz: (front - rear) / 2
  }
}

/**
 * Closed armet v2 (Sprint 29): three ellipsoid shells with REAL gaps — a
 * sight slit at eye level and a breath vent at mouth level. The hidden
 * face behind the gaps reads dark, so the slits need no second material.
 * Bevor ridge down the visor front, larger crest comb. Tagged full_face
 * (hides procedural features via rules) + hat (hides hair).
 */
export function buildArmet(
  shape: BodyShape = DEFAULT_BODY_SHAPE,
  face: FaceShape = DEFAULT_FACE_SHAPE,
  plume = false
): GarmentBuildResult {
  const e = armetExtents(shape, face)
  const eyeY = helmEyeY(shape)
  const top = CRANIUM_CENTER_Y + shape.headHeight + 0.05
  const mouthY = beardMouthY(shape, face)
  const parts: THREE.BufferGeometry[] = [
    // Crown: pole down past the brow, ending above the sight slit.
    helmShell(e, top + 0.01, eyeY + 0.014),
    // Visor: below the slit, ending above the breath vent.
    helmShell(e, eyeY - 0.014, mouthY + 0.03),
    // Bevor: below the vent, closing under the chin.
    helmShell(e, mouthY + 0.012, 1.55)
  ]
  parts.push(helmFiller(e, eyeY + 0.02, eyeY - 0.02, 0.65))
  parts.push(helmFiller(e, mouthY + 0.036, mouthY + 0.006, 0.6))
  // Bevor ridge: raised band down the visor front center.
  const bevor = makeSweep(
    [
      { center: [0, eyeY - 0.03, helmFrontZ(e, eyeY - 0.03) + 0.008], width: 0.045, height: 0.045 },
      { center: [0, mouthY + 0.1, helmFrontZ(e, mouthY + 0.1) + 0.008], width: 0.045, height: 0.045 },
      { center: [0, mouthY + 0.045, helmFrontZ(e, mouthY + 0.045) + 0.008], width: 0.04, height: 0.04 }
    ],
    10
  )
  parts.push(bevor)
  // Crest comb along the crown, taller than the Sprint 27 nub.
  const comb = new THREE.BoxGeometry(0.035, 0.09, 0.34)
  comb.translate(0, e.cy + e.ry - 0.02, e.cz)
  parts.push(comb)
  if (plume) {
    // Parade plume: swept feather-crest arcing back from the comb.
    const plumeGeos: THREE.BufferGeometry[] = []
    const steps = 6
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1)
      const seg = makeEllipsoid(0.028 - t * 0.008, 0.075 - t * 0.02, 0.05 - t * 0.012, 10, 8)
      translateGeometry(
        seg,
        0,
        e.cy + e.ry + 0.03 + Math.sin(t * Math.PI * 0.55) * 0.1,
        e.cz + 0.1 - t * 0.3
      )
      plumeGeos.push(seg)
    }
    parts.push(...plumeGeos)
  }
  return bindHat(parts)
}

// ---------------------------------------------------------------------------
// Sprint 30 helms: sallet, great bascinet, great helm, kettle hat. All share
// the helmShell/helmFiller helpers (real front-only gaps) and bind rigid to
// Head. Closed war helms carry full_face + hat; the kettle hat is open-face.
// ---------------------------------------------------------------------------

/** Sallet extents: armet-like envelope with an extended rear (tail). */
export function salletExtents(shape: BodyShape, face: FaceShape): HelmExtents {
  const front = noseFrontZ(shape, face) + 0.05
  const rear = CRANIUM_CENTER_Z - shape.headLength - 0.1
  const top = CRANIUM_CENTER_Y + shape.headHeight + 0.05
  const bottom = 1.56
  return {
    cx: 0,
    cy: (top + bottom) / 2,
    cz: (front + rear) / 2,
    rx: shape.headWidth + 0.045,
    ry: (top - bottom) / 2,
    rz: (front - rear) / 2
  }
}

/**
 * Sleek single-piece helm with an elongated tail guarding the neck and a
 * low central ridge over the crown. Sight slit + breath vent like the armet.
 */
export function buildSallet(
  shape: BodyShape = DEFAULT_BODY_SHAPE,
  face: FaceShape = DEFAULT_FACE_SHAPE
): GarmentBuildResult {
  const e = salletExtents(shape, face)
  const eyeY = helmEyeY(shape)
  const top = CRANIUM_CENTER_Y + shape.headHeight + 0.05
  const mouthY = beardMouthY(shape, face)
  const parts: THREE.BufferGeometry[] = [
    helmShell(e, top + 0.01, eyeY + 0.014),
    helmShell(e, eyeY - 0.014, mouthY + 0.03),
    helmShell(e, mouthY + 0.012, 1.55)
  ]
  parts.push(helmFiller(e, eyeY + 0.02, eyeY - 0.02, 0.65))
  parts.push(helmFiller(e, mouthY + 0.036, mouthY + 0.006, 0.6))
  // Tail: flattened shell sweeping down-back over the neck.
  const tail = makeEllipsoid(e.rx * 0.8, 0.13, 0.17, 18, 12)
  translateGeometry(tail, 0, 1.68, e.cz - e.rz * 0.55)
  parts.push(tail)
  // Crown ridge running nose-to-tail over the top.
  const topY = (z: number): number => {
    const k = Math.max(1 - ((z - e.cz) / e.rz) ** 2, 0.02)
    return e.cy + e.ry * Math.sqrt(k)
  }
  const ridge = makeSweep(
    [0.1, -0.05, -0.2].map((z) => ({
      center: [0, topY(e.cz + z) + 0.004, e.cz + z] as [number, number, number],
      width: 0.028,
      height: 0.05
    })),
    8
  )
  parts.push(ridge)
  return bindHat(parts)
}

/** Great bascinet envelope: tight skull + projecting snout. */
export function bascinetExtents(shape: BodyShape, face: FaceShape): HelmExtents {
  const base = armetExtents(shape, face)
  const front = noseFrontZ(shape, face) + 0.13
  return {
    ...base,
    cz: (front + (base.cz - base.rz)) / 2,
    rz: (front - (base.cz - base.rz)) / 2
  }
}

/**
 * Rounded skull with a pointed snout visor. The snout cone projects past
 * the nose from an armet-tight shell set; side breath slits flank the cone
 * (vent gap covered in the middle by the cone base).
 */
export function buildGreatBascinet(
  shape: BodyShape = DEFAULT_BODY_SHAPE,
  face: FaceShape = DEFAULT_FACE_SHAPE
): GarmentBuildResult {
  const t = armetExtents(shape, face)
  const eyeY = helmEyeY(shape)
  const top = CRANIUM_CENTER_Y + shape.headHeight + 0.05
  const mouthY = beardMouthY(shape, face)
  const parts: THREE.BufferGeometry[] = [
    helmShell(t, top + 0.01, eyeY + 0.014),
    helmShell(t, eyeY - 0.014, mouthY + 0.05),
    helmShell(t, mouthY + 0.032, 1.55)
  ]
  parts.push(helmFiller(t, eyeY + 0.02, eyeY - 0.02, 0.65))
  parts.push(helmFiller(t, mouthY + 0.056, mouthY + 0.026, 0.6))
  // Snout: cone apex past the nose, base embedded in the visor front.
  // Slim base + low axis keep the cone out of the sight-slit channel.
  const noseFront = noseFrontZ(shape, face)
  const snoutY = mouthY + 0.05
  const snout = new THREE.ConeGeometry(0.06, 0.15, 18)
  snout.rotateX(Math.PI / 2)
  snout.translate(0, snoutY, noseFront + 0.04)
  parts.push(snout)
  // Low comb over the rounded skull.
  const comb = new THREE.BoxGeometry(0.03, 0.05, 0.3)
  comb.translate(0, t.cy + t.ry - 0.01, t.cz)
  parts.push(comb)
  return bindHat(parts)
}

/** Great helm envelope (tapered crusader bucket). */
export function greatHelmExtents(shape: BodyShape, face: FaceShape): HelmExtents {
  void face
  const top = CRANIUM_CENTER_Y + shape.headHeight + 0.055
  const bottom = 1.58
  const r = shape.headWidth + 0.115
  return {
    cx: 0,
    cy: (top + bottom) / 2,
    cz: CRANIUM_CENTER_Z,
    rx: r,
    ry: (top - bottom) / 2,
    rz: r
  }
}

/**
 * Crusader great helm: tapered flat-topped bucket with a real sight slit
 * and breath vent (front-only cylinder gaps), reinforcing front cross and
 * rim bands. Chunky radius clears the biggest noses by construction.
 */
export function buildGreatHelm(
  shape: BodyShape = DEFAULT_BODY_SHAPE,
  face: FaceShape = DEFAULT_FACE_SHAPE
): GarmentBuildResult {
  const top = CRANIUM_CENTER_Y + shape.headHeight + 0.055
  const bottom = 1.58
  const rTop = shape.headWidth + 0.09
  const rBot = shape.headWidth + 0.115
  const cz = CRANIUM_CENTER_Z
  const radiusAt = (y: number): number => {
    const t = Math.max(0, Math.min(1, (top - y) / (top - bottom)))
    return rTop + (rBot - rTop) * t
  }
  const eyeY = helmEyeY(shape)
  const mouthY = beardMouthY(shape, face)
  const ventTop = mouthY + 0.032
  const ventBot = mouthY + 0.014
  const barrel = (yTop: number, yBot: number): THREE.BufferGeometry => {
    const g = new THREE.CylinderGeometry(radiusAt(yTop), radiusAt(yBot), yTop - yBot, 24, 1, true)
    g.translate(0, (yTop + yBot) / 2, cz)
    return g
  }
  // Cylinder theta puts +Z front at theta=0; the filler is the complement.
  const cylFiller = (yTop: number, yBot: number, halfAngle: number): THREE.BufferGeometry => {
    const g = new THREE.CylinderGeometry(
      radiusAt(yTop) + 0.002, radiusAt(yBot) + 0.002, yTop - yBot + 0.012, 20, 1, true,
      halfAngle, Math.PI * 2 - halfAngle * 2
    )
    g.translate(0, (yTop + yBot) / 2, cz)
    return g
  }
  const parts: THREE.BufferGeometry[] = [
    barrel(top, eyeY + 0.02),
    barrel(eyeY - 0.02, ventTop),
    barrel(ventBot, bottom)
  ]
  parts.push(cylFiller(eyeY + 0.026, eyeY - 0.026, 0.6))
  parts.push(cylFiller(ventTop + 0.006, ventBot - 0.006, 0.55))
  // Flat lid + rim bands.
  const lid = new THREE.CircleGeometry(rTop, 24)
  lid.rotateX(-Math.PI / 2)
  lid.translate(0, top, cz)
  parts.push(lid)
  for (const [ry, rr] of [[top - 0.01, rTop + 0.004], [bottom + 0.01, rBot + 0.004]] as const) {
    const band = new THREE.TorusGeometry(rr, 0.016, 8, 28)
    band.rotateX(Math.PI / 2)
    band.translate(0, ry, cz)
    parts.push(band)
  }
  // Reinforcing front cross, proud of the barrel surface.
  const crossV = new THREE.BoxGeometry(0.045, top - bottom - 0.06, 0.02)
  crossV.translate(0, (top + bottom) / 2, cz + rBot + 0.002)
  parts.push(crossV)
  const crossH = new THREE.BoxGeometry(0.3, 0.045, 0.02)
  crossH.translate(0, eyeY - 0.06, cz + radiusAt(eyeY - 0.06) + 0.004)
  parts.push(crossH)
  return bindHat(parts)
}

/** Kettle hat extents (brim radius + dome top). */
export function kettleExtents(shape: BodyShape, face: FaceShape): HelmExtents {
  const top = CRANIUM_CENTER_Y + (shape.headHeight * 0.9 + 0.02)
  void face
  return {
    cx: 0,
    cy: top,
    cz: CRANIUM_CENTER_Z,
    rx: shape.headWidth + 0.185,
    ry: 0.02,
    rz: shape.headWidth + 0.185
  }
}

/** Open-face infantry kettle hat: wide flared brim + dome. Hat tag only. */
export function buildKettleHat(
  shape: BodyShape = DEFAULT_BODY_SHAPE,
  face: FaceShape = DEFAULT_FACE_SHAPE
): GarmentBuildResult {
  const brimY = eyeTopY(shape, face) + 0.008
  const brim = new THREE.CylinderGeometry(
    shape.headWidth + 0.17, shape.headWidth + 0.185, 0.02, 28
  )
  brim.translate(0, brimY, CRANIUM_CENTER_Z)
  const domeR = { rx: shape.headWidth + 0.02, ry: shape.headHeight * 0.9 + 0.02, rz: shape.headLength + 0.02 }
  const t0 = Math.acos(Math.max(-1, Math.min(1, (brimY - CRANIUM_CENTER_Y) / domeR.ry)))
  const dome = new THREE.SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, t0)
  dome.scale(domeR.rx, domeR.ry, domeR.rz)
  dome.translate(0, CRANIUM_CENTER_Y, CRANIUM_CENTER_Z)
  return bindHat([brim, dome])
}

// ---------------------------------------------------------------------------
// Sprint 31 hats: crown, boater, circlet, wizard hat.
// ---------------------------------------------------------------------------

/**
 * Royal crown: skull-hugging band (sphere section, like hair shells) +
 * spike cones + closed cap with orb. Sits high (baseY above the brows);
 * the cap keeps cranium containment green unlike open circlets.
 */
export function buildCrown(
  shape: BodyShape = DEFAULT_BODY_SHAPE,
  face: FaceShape = DEFAULT_FACE_SHAPE
): GarmentBuildResult {
  void face
  const baseY = CRANIUM_CENTER_Y + shape.headHeight * 0.65
  const grow = 0.025
  const thetaTop = Math.acos(
    Math.max(-1, Math.min(1, (baseY + 0.035 - CRANIUM_CENTER_Y) / (shape.headHeight + grow)))
  )
  const thetaBot = Math.acos(
    Math.max(-1, Math.min(1, (baseY - 0.035 - CRANIUM_CENTER_Y) / (shape.headHeight + grow)))
  )
  const band = new THREE.SphereGeometry(
    1, 28, 6, 0, Math.PI * 2, thetaTop, thetaBot - thetaTop
  )
  band.scale(shape.headWidth + grow, shape.headHeight + grow, shape.headLength + grow)
  band.translate(0, CRANIUM_CENTER_Y, CRANIUM_CENTER_Z)
  const parts: THREE.BufferGeometry[] = [band]
  // Spikes rooted on the band surface, aimed along the skull normal.
  const thetaMid = (thetaTop + thetaBot) / 2
  const up = new THREE.Vector3(0, 1, 0)
  const spikes = 6
  for (let i = 0; i < spikes; i++) {
    const a = (i / spikes) * Math.PI * 2
    const px = (shape.headWidth + grow) * Math.sin(thetaMid) * Math.cos(a)
    const py = CRANIUM_CENTER_Y + (shape.headHeight + grow) * Math.cos(thetaMid)
    const pz = CRANIUM_CENTER_Z + (shape.headLength + grow) * Math.sin(thetaMid) * Math.sin(a)
    const spike = new THREE.ConeGeometry(0.022, 0.075, 8)
    spike.translate(0, 0.0375, 0)
    const normal = new THREE.Vector3(px, py - CRANIUM_CENTER_Y, pz - CRANIUM_CENTER_Z).normalize()
    spike.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, normal))
    spike.translate(px, py, pz)
    parts.push(spike)
  }
  // Cap dome overlapping the band top + orb.
  const capGrow = grow + 0.008
  const cap = new THREE.SphereGeometry(1, 24, 8, 0, Math.PI * 2, 0, thetaTop + 0.1)
  cap.scale(shape.headWidth + capGrow, shape.headHeight + capGrow, shape.headLength + capGrow)
  cap.translate(0, CRANIUM_CENTER_Y, CRANIUM_CENTER_Z)
  parts.push(cap)
  const orb = new THREE.SphereGeometry(0.028, 12, 10)
  orb.translate(0, CRANIUM_CENTER_Y + shape.headHeight + capGrow + 0.015, CRANIUM_CENTER_Z)
  parts.push(orb)
  return bindHat(parts)
}

/** Boater: flat-topped straw cylinder + wide flat brim + band. Cloth. */
export function buildBoaterHat(
  shape: BodyShape = DEFAULT_BODY_SHAPE,
  face: FaceShape = DEFAULT_FACE_SHAPE
): GarmentBuildResult {
  const brimY = hatRimY(shape, face) + 0.008
  const crownR = shape.headWidth + 0.03
  const crown = new THREE.CylinderGeometry(crownR, crownR + 0.008, 0.13, 24)
  crown.translate(0, brimY + 0.065, CRANIUM_CENTER_Z)
  const lid = new THREE.CircleGeometry(crownR, 24)
  lid.rotateX(-Math.PI / 2)
  lid.translate(0, brimY + 0.13, CRANIUM_CENTER_Z)
  const brim = new THREE.CylinderGeometry(crownR + 0.13, crownR + 0.14, 0.016, 28)
  brim.translate(0, brimY, CRANIUM_CENTER_Z)
  const band = new THREE.TorusGeometry(crownR + 0.004, 0.018, 8, 24)
  band.rotateX(Math.PI / 2)
  band.translate(0, brimY + 0.03, CRANIUM_CENTER_Z)
  return bindHat([brim, crown, lid, band])
}

/**
 * Circlet: thin gold band + front gem. Open-top adornment by design —
 * exempt from cranium containment in the probe (covers nothing above).
 */
export function buildCirclet(shape: BodyShape = DEFAULT_BODY_SHAPE): GarmentBuildResult {
  const bandY = hatRimY(shape, DEFAULT_FACE_SHAPE) + 0.03
  const bandR = shape.headWidth + 0.015
  // Slight forehead dip: scale the ring's front down via shear-free tilt.
  const band = new THREE.TorusGeometry(bandR, 0.012, 8, 28)
  band.rotateX(Math.PI / 2)
  band.translate(0, bandY, CRANIUM_CENTER_Z)
  const gem = new THREE.BoxGeometry(0.034, 0.042, 0.02)
  gem.rotateZ(Math.PI / 4)
  gem.translate(0, bandY + 0.005, CRANIUM_CENTER_Z + bandR + 0.008)
  return bindHat([band, gem])
}

/** Wizard hat: wide brim + tall bent cone + band. Cloth. */
export function buildWizardHat(
  shape: BodyShape = DEFAULT_BODY_SHAPE,
  face: FaceShape = DEFAULT_FACE_SHAPE
): GarmentBuildResult {
  const brimY = hatRimY(shape, face) + 0.008
  const baseR = shape.headWidth + 0.035
  const brim = new THREE.CylinderGeometry(baseR + 0.13, baseR + 0.15, 0.02, 28)
  brim.translate(0, brimY, CRANIUM_CENTER_Z)
  // Floppy cone: base radius tracks the skull width AT BRIM HEIGHT (fixed
  // radii poke through on wide/tall heads), tapering up with a backward lean.
  const tB = Math.max(-0.9, Math.min(0.9, (brimY - CRANIUM_CENTER_Y) / shape.headHeight))
  const coneR = shape.headWidth * Math.sqrt(1 - tB * tB) + 0.025
  const parts: THREE.BufferGeometry[] = [brim]
  const segs: Array<[number, number, number, number]> = [
    // [rBottom, rTop, height, leanBack] as coneR fractions (tip absolute)
    [1.04, 0.8, 0.12, 0.0],
    [0.8, 0.58, 0.12, 0.03],
    [0.58, 0.34, 0.12, 0.07],
    [0.34, 0.03, 0.11, 0.12]
  ]
  let y = brimY + 0.01
  for (const [fB, fT, h, lean] of segs) {
    const rB = fB > 1 ? coneR + 0.005 : coneR * fB
    const rT = fT < 0.1 ? 0.008 : coneR * fT
    const cone = new THREE.CylinderGeometry(rT, rB, h, 20)
    cone.translate(0, y + h / 2, CRANIUM_CENTER_Z - lean)
    parts.push(cone)
    y += h
  }
  const band = new THREE.TorusGeometry(baseR + 0.004, 0.02, 8, 24)
  band.rotateX(Math.PI / 2)
  band.translate(0, brimY + 0.035, CRANIUM_CENTER_Z)
  parts.push(band)
  return bindHat(parts)
}

// ---------------------------------------------------------------------------
// Sprint 32: cape (back slot) + wings. First assets in both slots.
// ---------------------------------------------------------------------------

/** Body rear depth at height y: torso tube, belly-scaled waist, or butt. */
function capeBodyRear(shape: BodyShape, belly: number, butt: number, y: number): number {
  const bellyScale = bellyScaleOf(belly)
  const tubeD = profileAt(shape, y).d * (y >= 1.0 && y <= 1.18 ? bellyScale : 1)
  return Math.max(tubeD, buttRearAtY(shape, butt, y), 0.2)
}

/**
 * Draped cape: open-front shell hanging from the shoulders to the calves.
 * The front wedge stays open (no front coverage claim); cross-section
 * tracks the body rear + butt so the seat never pokes through. Clasp
 * spheres + sagging cord across the chest front.
 */
export function buildCape(
  shape: BodyShape = DEFAULT_BODY_SHAPE,
  bust = BUST_DEFAULT,
  belly = 0.5,
  butt = BUTT_DEFAULT
): GarmentBuildResult {
  void bust
  const stations: SweepStation[] = []
  // [y, widthAdd, rearMargin]: drape widens and stands further off downward.
  const rows: Array<[number, number, number]> = [
    [1.56, 0.06, 0.05],
    [1.3, 0.09, 0.06],
    [1.0, 0.12, 0.08],
    [0.7, 0.16, 0.1],
    [0.4, 0.19, 0.11],
    [0.25, 0.2, 0.11]
  ]
  for (const [rowIdx, [y, wAdd, margin]] of rows.entries()) {
    const rear = capeBodyRear(shape, belly, butt, y)
    const hw = 0.24 * (0.85 + 0.15 * shape.hipWidth) + wAdd
    // Monotonic backward drift: keeps every step tilted (|tangent.y| < 0.999)
    // so ALL rings use the kernel's refUp=Y frame. Parallel rings straddle
    // the frame threshold and bowtie (rear slit instead of front opening).
    const zc = -(rear * 0.45 + 0.04) - rowIdx * 0.016
    const hd = rear * 0.55 + 0.05 + margin * 0.4
    stations.push({ center: [0, y, zc], width: hw * 2, height: hd * 2 })
  }
  // Open front wedge around +Z. The drape path tilts (varying zc), so the
  // kernel uses its refUp=Y frame: ring x=-cos(a)*w/2, z~-sin(a)*h/2, which
  // puts front +Z at a=3PI/2 (NOT PI/2 — that opens a rear slit). Edges at
  // 3PI/2+-GAP: |x|=cos(0.5)*hw, z=zc+sin(0.5)*hd.
  const GAP = 0.5
  const PHI_START = (Math.PI * 3) / 2 + GAP
  const PHI_LEN = Math.PI * 2 - GAP * 2
  const drape = makeSweep(stations, 22, false, false, PHI_START, PHI_LEN)
  const parts: THREE.BufferGeometry[] = [drape]
  // Clasp spheres rooted on the cape's front edges + cord draping forward
  // across the chest front.
  const topStation = stations[0]
  const edgeX = 0.479 * (topStation.width / 2)
  const edgeZ = topStation.center[2] + 0.869 * (topStation.height / 2)
  const chestZ = profileAt(shape, 1.5).d + CLOTH_OFFSET + 0.02
  for (const side of [-1, 1] as const) {
    const clasp = new THREE.SphereGeometry(0.032, 12, 10)
    clasp.translate(side * edgeX, 1.55, edgeZ + 0.01)
    parts.push(clasp)
  }
  parts.push(
    makeSweep(
      [
        { center: [-edgeX, 1.55, edgeZ + 0.01], width: 0.05, height: 0.05 },
        { center: [-0.18, 1.5, chestZ], width: 0.05, height: 0.05 },
        { center: [0, 1.46, chestZ + 0.01], width: 0.05, height: 0.05 },
        { center: [0.18, 1.5, chestZ], width: 0.05, height: 0.05 },
        { center: [edgeX, 1.55, edgeZ + 0.01], width: 0.05, height: 0.05 }
      ],
      8
    )
  )
  // Hem band weighting the bottom edge: fully closed ring (a trim band needs
  // no opening, and full circles are frame-agnostic).
  const hem = stations[stations.length - 1]
  parts.push(
    makeSweep(
      [
        { center: [0, 0.25, hem.center[2]], width: hem.width + 0.02, height: hem.height + 0.02 },
        { center: [0, 0.32, hem.center[2]], width: hem.width + 0.024, height: hem.height + 0.024 }
      ],
      22
    )
  )
  const clavEnd = 0.36 * shape.shoulderWidth
  const armStart = sleeveArmStart(shape)
  return bindTop(parts, topSegments(clavEnd, armStart, false))
}

/**
 * Feathered wings: three overlapping shingle ellipsoids per side fanning
 * up-out-back from the shoulder blades + covert cap at the root. Cloth
 * (palette-colorable). Wings slot, first asset.
 */
export function buildWings(shape: BodyShape = DEFAULT_BODY_SHAPE): GarmentBuildResult {
  const parts: THREE.BufferGeometry[] = []
  // [span, rise, back, sizeL, sizeT, sizeW, yaw, pitch]: fan layout per side.
  const feathers: Array<[number, number, number, number, number, number, number, number]> = [
    [0.38, 0.34, -0.22, 0.2, 0.03, 0.075, -0.45, 0.5],
    [0.3, 0.22, -0.18, 0.17, 0.03, 0.07, -0.3, 0.65],
    [0.2, 0.1, -0.14, 0.13, 0.035, 0.08, -0.15, 0.8]
  ]
  for (const side of [-1, 1] as const) {
    for (const [span, rise, back, l, t, w, yaw, pitch] of feathers) {
      const f = makeEllipsoid(l, t, w, 14, 10)
      f.rotateZ(side * pitch)
      f.rotateY(side * yaw)
      f.translate(side * span, 1.5 + rise, back)
      parts.push(f)
    }
    const covert = makeEllipsoid(0.11, 0.06, 0.1, 12, 10)
    covert.translate(side * 0.12, 1.52, -0.12)
    parts.push(covert)
  }
  const clavEnd = 0.36 * shape.shoulderWidth
  const armStart = sleeveArmStart(shape)
  return bindTop(parts, topSegments(clavEnd, armStart, false))
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
  },
  {
    id: 'proc:tophat',
    slotId: 'helmet',
    label: 'Top Hat',
    tags: ['hat', 'procedural'],
    materialId: 'cloth',
    build: (dna) => {
      const shape = sanitizeBodyShape(dna.bodyShape)
      const face = sanitizeFaceShape(dna.face)
      return buildTopHat(shape, face)
    }
  },
  {
    id: 'proc:hood',
    slotId: 'helmet',
    label: 'Hood',
    tags: ['hat', 'procedural'],
    materialId: 'cloth',
    build: (dna) => buildHood(sanitizeBodyShape(dna.bodyShape))
  },
  {
    id: 'proc:crop_hair',
    slotId: 'hair',
    label: 'Short Crop',
    tags: ['hair', 'procedural'],
    materialId: 'hair',
    build: (dna) => buildCropHair(sanitizeBodyShape(dna.bodyShape))
  },
  {
    id: 'proc:ponytail',
    slotId: 'hair',
    label: 'Ponytail',
    tags: ['hair', 'procedural'],
    materialId: 'hair',
    build: (dna) => buildPonytail(sanitizeBodyShape(dna.bodyShape))
  },
  {
    id: 'proc:mohawk',
    slotId: 'hair',
    label: 'Mohawk',
    tags: ['hair', 'procedural'],
    materialId: 'hair',
    build: (dna) => buildMohawk(sanitizeBodyShape(dna.bodyShape))
  },
  {
    id: 'proc:long_hair',
    slotId: 'hair',
    label: 'Long Hair',
    tags: ['hair', 'procedural'],
    materialId: 'hair',
    build: (dna) => {
      const shape = sanitizeBodyShape(dna.bodyShape)
      const butt = clamp01(dna.morphs?.butt ?? BUTT_DEFAULT)
      const belly = clamp01(dna.morphs?.bellySize ?? 0.5)
      return buildLongHair(shape, butt, belly)
    }
  },
  {
    id: 'proc:sunglasses',
    slotId: 'head',
    label: 'Sunglasses',
    tags: ['glasses', 'procedural'],
    materialId: 'lens',
    build: (dna) => {
      const shape = sanitizeBodyShape(dna.bodyShape)
      const face = sanitizeFaceShape(dna.face)
      return buildSunglasses(shape, face)
    }
  },
  {
    id: 'proc:goggles',
    slotId: 'head',
    label: 'Ski Goggles',
    tags: ['glasses', 'procedural'],
    materialId: 'lens',
    build: (dna) => {
      const shape = sanitizeBodyShape(dna.bodyShape)
      const face = sanitizeFaceShape(dna.face)
      return buildGoggles(shape, face)
    }
  },
  {
    id: 'proc:mask',
    slotId: 'head',
    label: 'Face Mask',
    tags: ['mask', 'procedural'],
    materialId: 'cloth',
    build: (dna) => {
      const shape = sanitizeBodyShape(dna.bodyShape)
      const face = sanitizeFaceShape(dna.face)
      return buildFaceMask(shape, face)
    }
  },
  {
    id: 'proc:shoes',
    slotId: 'shoes',
    label: 'Shoes',
    tags: ['shoes', 'procedural'],
    materialId: 'leather',
    build: () => buildShoes()
  },
  {
    id: 'proc:boots',
    slotId: 'shoes',
    label: 'Boots',
    tags: ['shoes', 'boots', 'procedural'],
    materialId: 'leather',
    build: () => buildBoots()
  },
  {
    id: 'proc:gloves',
    slotId: 'gloves',
    label: 'Gloves',
    tags: ['gloves', 'procedural'],
    materialId: 'leather',
    build: () => buildGloves()
  },
  {
    id: 'proc:gauntlets',
    slotId: 'gloves',
    label: 'Gauntlets',
    tags: ['gloves', 'gauntlets', 'procedural'],
    materialId: 'leather',
    build: () => buildGauntlets()
  },
  {
    id: 'proc:goatee',
    slotId: 'beard',
    label: 'Goatee',
    tags: ['beard', 'procedural'],
    materialId: 'hair',
    build: (dna) => {
      const shape = sanitizeBodyShape(dna.bodyShape)
      const face = sanitizeFaceShape(dna.face)
      return buildGoatee(shape, face)
    }
  },
  {
    id: 'proc:full_beard',
    slotId: 'beard',
    label: 'Full Beard',
    tags: ['beard', 'procedural'],
    materialId: 'hair',
    build: (dna) => {
      const shape = sanitizeBodyShape(dna.bodyShape)
      const face = sanitizeFaceShape(dna.face)
      return buildFullBeard(shape, face)
    }
  },
  {
    id: 'proc:mustache',
    slotId: 'beard',
    label: 'Mustache',
    tags: ['beard', 'procedural'],
    materialId: 'hair',
    build: (dna) => {
      const shape = sanitizeBodyShape(dna.bodyShape)
      const face = sanitizeFaceShape(dna.face)
      return buildMustache(shape, face)
    }
  },
  {
    id: 'proc:plate',
    slotId: 'shirt',
    label: 'Plate Harness',
    tags: ['shirt', 'armour', 'procedural'],
    materialId: 'metal',
    build: (dna) => {
      const shape = sanitizeBodyShape(dna.bodyShape)
      const bust = clamp01(dna.morphs?.bust ?? BUST_DEFAULT)
      const belly = clamp01(dna.morphs?.bellySize ?? 0.5)
      const butt = clamp01(dna.morphs?.butt ?? BUTT_DEFAULT)
      const topLength = clamp01(dna.morphs?.topLength ?? TOP_LENGTH_DEFAULT)
      return buildPlate(shape, bust, belly, butt, topLength)
    }
  },
  {
    id: 'proc:plate_legs',
    slotId: 'pants',
    label: 'Plate Legs',
    tags: ['pants', 'armour', 'procedural'],
    materialId: 'metal',
    build: (dna) => {
      const shape = sanitizeBodyShape(dna.bodyShape)
      const butt = clamp01(dna.morphs?.butt ?? BUTT_DEFAULT)
      const belly = clamp01(dna.morphs?.bellySize ?? 0.5)
      return buildPlateLegs(shape, butt, belly)
    }
  },
  {
    id: 'proc:armet',
    slotId: 'helmet',
    label: 'Armet',
    tags: ['helmet', 'full_face', 'hat', 'procedural'],
    materialId: 'metal',
    build: (dna) => {
      const shape = sanitizeBodyShape(dna.bodyShape)
      const face = sanitizeFaceShape(dna.face)
      return buildArmet(shape, face)
    }
  },
  {
    id: 'proc:plumed_armet',
    slotId: 'helmet',
    label: 'Plumed Armet',
    tags: ['helmet', 'full_face', 'hat', 'plume', 'procedural'],
    materialId: 'metal',
    build: (dna) => {
      const shape = sanitizeBodyShape(dna.bodyShape)
      const face = sanitizeFaceShape(dna.face)
      return buildArmet(shape, face, true)
    }
  },
  {
    id: 'proc:sallet',
    slotId: 'helmet',
    label: 'Sallet',
    tags: ['helmet', 'full_face', 'hat', 'procedural'],
    materialId: 'metal',
    build: (dna) => {
      const shape = sanitizeBodyShape(dna.bodyShape)
      const face = sanitizeFaceShape(dna.face)
      return buildSallet(shape, face)
    }
  },
  {
    id: 'proc:great_bascinet',
    slotId: 'helmet',
    label: 'Great Bascinet',
    tags: ['helmet', 'full_face', 'hat', 'procedural'],
    materialId: 'metal',
    build: (dna) => {
      const shape = sanitizeBodyShape(dna.bodyShape)
      const face = sanitizeFaceShape(dna.face)
      return buildGreatBascinet(shape, face)
    }
  },
  {
    id: 'proc:great_helm',
    slotId: 'helmet',
    label: 'Great Helm',
    tags: ['helmet', 'full_face', 'hat', 'procedural'],
    materialId: 'metal',
    build: (dna) => {
      const shape = sanitizeBodyShape(dna.bodyShape)
      const face = sanitizeFaceShape(dna.face)
      return buildGreatHelm(shape, face)
    }
  },
  {
    id: 'proc:kettle_hat',
    slotId: 'helmet',
    label: 'Kettle Hat',
    tags: ['helmet', 'hat', 'procedural'],
    materialId: 'metal',
    build: (dna) => {
      const shape = sanitizeBodyShape(dna.bodyShape)
      const face = sanitizeFaceShape(dna.face)
      return buildKettleHat(shape, face)
    }
  },
  // ---- Sprint 31 ----
  {
    id: 'proc:sweater',
    slotId: 'shirt',
    label: 'Sweater',
    tags: ['shirt', 'chest', 'procedural'],
    materialId: 'cloth',
    build: (dna) => {
      const shape = sanitizeBodyShape(dna.bodyShape)
      const bust = clamp01(dna.morphs?.bust ?? BUST_DEFAULT)
      const belly = clamp01(dna.morphs?.bellySize ?? 0.5)
      const butt = clamp01(dna.morphs?.butt ?? BUTT_DEFAULT)
      const topLength = clamp01(dna.morphs?.topLength ?? TOP_LENGTH_DEFAULT)
      return buildSweater(shape, bust, belly, butt, topLength)
    }
  },
  {
    id: 'proc:belted_tunic',
    slotId: 'shirt',
    label: 'Belted Tunic',
    tags: ['shirt', 'chest', 'procedural'],
    materialId: 'cloth',
    build: (dna) => {
      const shape = sanitizeBodyShape(dna.bodyShape)
      const bust = clamp01(dna.morphs?.bust ?? BUST_DEFAULT)
      const belly = clamp01(dna.morphs?.bellySize ?? 0.5)
      const butt = clamp01(dna.morphs?.butt ?? BUTT_DEFAULT)
      const topLength = clamp01(dna.morphs?.topLength ?? TOP_LENGTH_DEFAULT)
      return buildBeltedTunic(shape, bust, belly, butt, topLength)
    }
  },
  {
    id: 'proc:dress',
    slotId: 'shirt',
    label: 'Dress',
    tags: ['shirt', 'dress', 'procedural'],
    materialId: 'cloth',
    build: (dna) => {
      const shape = sanitizeBodyShape(dna.bodyShape)
      const bust = clamp01(dna.morphs?.bust ?? BUST_DEFAULT)
      const belly = clamp01(dna.morphs?.bellySize ?? 0.5)
      const butt = clamp01(dna.morphs?.butt ?? BUTT_DEFAULT)
      return buildDress(shape, bust, belly, butt)
    }
  },
  {
    id: 'proc:long_coat',
    slotId: 'shirt',
    label: 'Long Coat',
    tags: ['shirt', 'coat', 'procedural'],
    materialId: 'leather',
    build: (dna) => {
      const shape = sanitizeBodyShape(dna.bodyShape)
      const bust = clamp01(dna.morphs?.bust ?? BUST_DEFAULT)
      const belly = clamp01(dna.morphs?.bellySize ?? 0.5)
      const butt = clamp01(dna.morphs?.butt ?? BUTT_DEFAULT)
      return buildLongCoat(shape, bust, belly, butt)
    }
  },
  {
    id: 'proc:tabard',
    slotId: 'shirt',
    label: 'Tabard',
    tags: ['shirt', 'tabard', 'procedural'],
    materialId: 'cloth',
    build: (dna) => {
      const shape = sanitizeBodyShape(dna.bodyShape)
      const bust = clamp01(dna.morphs?.bust ?? BUST_DEFAULT)
      const belly = clamp01(dna.morphs?.bellySize ?? 0.5)
      const butt = clamp01(dna.morphs?.butt ?? BUTT_DEFAULT)
      return buildTabard(shape, bust, belly, butt)
    }
  },
  {
    id: 'proc:kilt',
    slotId: 'pants',
    label: 'Kilt',
    tags: ['pants', 'legs', 'procedural'],
    materialId: 'cloth',
    build: (dna) => {
      const shape = sanitizeBodyShape(dna.bodyShape)
      const butt = clamp01(dna.morphs?.butt ?? BUTT_DEFAULT)
      const belly = clamp01(dna.morphs?.bellySize ?? 0.5)
      return buildKilt(shape, butt, belly)
    }
  },
  {
    id: 'proc:leggings',
    slotId: 'pants',
    label: 'Leggings',
    tags: ['pants', 'legs', 'procedural'],
    materialId: 'cloth',
    build: (dna) => {
      const shape = sanitizeBodyShape(dna.bodyShape)
      const butt = clamp01(dna.morphs?.butt ?? BUTT_DEFAULT)
      const belly = clamp01(dna.morphs?.bellySize ?? 0.5)
      return buildLeggings(shape, butt, belly)
    }
  },
  {
    id: 'proc:overalls',
    slotId: 'pants',
    label: 'Overalls',
    tags: ['pants', 'legs', 'procedural'],
    materialId: 'cloth',
    build: (dna) => {
      const shape = sanitizeBodyShape(dna.bodyShape)
      const butt = clamp01(dna.morphs?.butt ?? BUTT_DEFAULT)
      const belly = clamp01(dna.morphs?.bellySize ?? 0.5)
      return buildOveralls(shape, butt, belly)
    }
  },
  {
    id: 'proc:crown',
    slotId: 'helmet',
    label: 'Crown',
    tags: ['helmet', 'hat', 'crown', 'procedural'],
    materialId: 'metal',
    build: (dna) => {
      const shape = sanitizeBodyShape(dna.bodyShape)
      const face = sanitizeFaceShape(dna.face)
      return buildCrown(shape, face)
    }
  },
  {
    id: 'proc:boater',
    slotId: 'helmet',
    label: 'Boater Hat',
    tags: ['helmet', 'hat', 'procedural'],
    materialId: 'cloth',
    build: (dna) => {
      const shape = sanitizeBodyShape(dna.bodyShape)
      const face = sanitizeFaceShape(dna.face)
      return buildBoaterHat(shape, face)
    }
  },
  {
    id: 'proc:circlet',
    slotId: 'helmet',
    label: 'Circlet',
    tags: ['helmet', 'hat', 'circlet', 'procedural'],
    materialId: 'metal',
    build: (dna) => {
      const shape = sanitizeBodyShape(dna.bodyShape)
      return buildCirclet(shape)
    }
  },
  {
    id: 'proc:wizard_hat',
    slotId: 'helmet',
    label: 'Wizard Hat',
    tags: ['helmet', 'hat', 'procedural'],
    materialId: 'cloth',
    build: (dna) => {
      const shape = sanitizeBodyShape(dna.bodyShape)
      const face = sanitizeFaceShape(dna.face)
      return buildWizardHat(shape, face)
    }
  },
  {
    id: 'proc:bun_hair',
    slotId: 'hair',
    label: 'Topknot Bun',
    tags: ['hair', 'procedural'],
    materialId: 'hair',
    build: (dna) => buildBunHair(sanitizeBodyShape(dna.bodyShape))
  },
  {
    id: 'proc:bob_hair',
    slotId: 'hair',
    label: 'Bob',
    tags: ['hair', 'procedural'],
    materialId: 'hair',
    build: (dna) => buildBobHair(sanitizeBodyShape(dna.bodyShape))
  },
  {
    id: 'proc:pigtails_hair',
    slotId: 'hair',
    label: 'Pigtails',
    tags: ['hair', 'procedural'],
    materialId: 'hair',
    build: (dna) => buildPigtailsHair(sanitizeBodyShape(dna.bodyShape))
  },
  {
    id: 'proc:fade_hair',
    slotId: 'hair',
    label: 'Fade',
    tags: ['hair', 'procedural'],
    materialId: 'hair',
    build: (dna) => buildFadeHair(sanitizeBodyShape(dna.bodyShape))
  },
  {
    id: 'proc:stubble',
    slotId: 'beard',
    label: 'Stubble',
    tags: ['beard', 'procedural'],
    materialId: 'hair',
    build: (dna) => {
      const shape = sanitizeBodyShape(dna.bodyShape)
      const face = sanitizeFaceShape(dna.face)
      return buildStubble(shape, face)
    }
  },
  {
    id: 'proc:sandals',
    slotId: 'shoes',
    label: 'Sandals',
    tags: ['shoes', 'sandals', 'procedural'],
    materialId: 'leather',
    build: () => buildSandals()
  },
  {
    id: 'proc:bracers',
    slotId: 'gloves',
    label: 'Bracers',
    tags: ['gloves', 'bracers', 'procedural'],
    materialId: 'leather',
    build: () => buildBracers()
  },
  {
    id: 'proc:cape',
    slotId: 'cape',
    label: 'Cape',
    tags: ['cape', 'back', 'procedural'],
    materialId: 'cloth',
    build: (dna) => {
      const shape = sanitizeBodyShape(dna.bodyShape)
      const bust = clamp01(dna.morphs?.bust ?? BUST_DEFAULT)
      const belly = clamp01(dna.morphs?.bellySize ?? 0.5)
      const butt = clamp01(dna.morphs?.butt ?? BUTT_DEFAULT)
      return buildCape(shape, bust, belly, butt)
    }
  },
  {
    id: 'proc:wings',
    slotId: 'wings',
    label: 'Wings',
    tags: ['wings', 'back', 'procedural'],
    materialId: 'cloth',
    build: (dna) => buildWings(sanitizeBodyShape(dna.bodyShape))
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
    assetId === 'proc:plate' ||
    assetId === 'proc:sweater' ||
    assetId === 'proc:belted_tunic' ||
    assetId === 'proc:dress' ||
    assetId === 'proc:long_coat' ||
    assetId === 'proc:tabard' ||
    assetId === 'proc:jeans' ||
    assetId === 'proc:shorts' ||
    assetId === 'proc:baggy' ||
    assetId === 'proc:tights' ||
    assetId === 'proc:kilt' ||
    assetId === 'proc:leggings' ||
    assetId === 'proc:overalls' ||
    assetId === 'proc:plate_legs'
  )
    return key === 'torso'
  if (assetId === 'proc:beanie' || assetId === 'proc:cap' || assetId === 'proc:sombrero')
    return key === 'head' || key === 'face'
  if (
    assetId === 'proc:tophat' ||
    assetId === 'proc:armet' ||
    assetId === 'proc:plumed_armet' ||
    assetId === 'proc:sallet' ||
    assetId === 'proc:great_bascinet' ||
    assetId === 'proc:great_helm' ||
    assetId === 'proc:kettle_hat'
  )
    return key === 'head' || key === 'face'
  if (assetId === 'proc:boater' || assetId === 'proc:wizard_hat')
    return key === 'head' || key === 'face'
  if (assetId === 'proc:circlet' || assetId === 'proc:crown') return key === 'head'
  if (assetId === 'proc:hood') return key === 'head'
  if (assetId === 'proc:sunglasses' || assetId === 'proc:goggles' || assetId === 'proc:mask')
    return key === 'head' || key === 'face'
  if (assetId === 'proc:goatee' || assetId === 'proc:full_beard' || assetId === 'proc:mustache' || assetId === 'proc:stubble')
    return key === 'head' || key === 'face'
  if (
    assetId === 'proc:shoes' ||
    assetId === 'proc:boots' ||
    assetId === 'proc:sandals' ||
    assetId === 'proc:gloves' ||
    assetId === 'proc:gauntlets' ||
    assetId === 'proc:bracers'
  )
    return key === 'torso'
  if (
    assetId === 'proc:crop_hair' ||
    assetId === 'proc:ponytail' ||
    assetId === 'proc:mohawk' ||
    assetId === 'proc:bun_hair' ||
    assetId === 'proc:bob_hair' ||
    assetId === 'proc:pigtails_hair' ||
    assetId === 'proc:fade_hair'
  )
    return key === 'head'
  if (assetId === 'proc:long_hair') return key === 'head' || key === 'torso'
  if (assetId === 'proc:cape' || assetId === 'proc:wings') return key === 'torso'
  return false
}
