import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { makeEllipsoid, makeLathe, makeSweep, translateGeometry } from './GeometryKernel'
import { applySkinAttributes, computeSkinBindings, type BoneSegment } from './SkinWeights'

export interface HeadShapeParams {
  headWidth: number
  headHeight: number
  headLength: number
  jawChin: number
}

export const DEFAULT_HEAD_PARAMS: HeadShapeParams = {
  headWidth: 0.25,
  headHeight: 0.22,
  headLength: 0.26,
  jawChin: 0.35
}

export const HEAD_BONE_SEGMENTS: BoneSegment[] = [
  { name: 'Neck', start: [0, 1.55, 0], end: [0, 1.75, 0] },
  { name: 'Head', start: [0, 1.75, 0], end: [0, 2.08, 0] }
]

const CRANIUM_CENTER_Y = 1.86

export function buildHeadGeometry(params: HeadShapeParams = DEFAULT_HEAD_PARAMS): THREE.BufferGeometry {
  const { headWidth, headHeight, headLength, jawChin } = params

  const cranium = translateGeometry(
    makeEllipsoid(headWidth, headHeight, headLength, 28, 20),
    0,
    CRANIUM_CENTER_Y,
    0.005
  )

  const earGeo = makeEllipsoid(0.042, 0.07, 0.05, 10, 8)
  const leftEar = translateGeometry(earGeo.clone(), -headWidth * 0.92, CRANIUM_CENTER_Y + 0.01, -0.01)
  const rightEar = translateGeometry(earGeo, headWidth * 0.92, CRANIUM_CENTER_Y + 0.01, -0.01)

  const chinR = 0.07 * (1 - jawChin) + 0.02
  const chinY = 1.68 - 0.05 * jawChin
  const jawProfile: Array<[number, number]> = [
    [headWidth * 0.62, CRANIUM_CENTER_Y + 0.03],
    [headWidth * 0.6, 1.77],
    [headWidth * 0.44, 1.71],
    [chinR, chinY]
  ]
  const jaw = makeLathe(jawProfile, 24)

  const neck = makeSweep(
    [
      { center: [0, 1.53, 0], width: 0.17, height: 0.15 },
      { center: [0, 1.66, 0.01], width: 0.18, height: 0.16 },
      { center: [0, 1.78, 0.02], width: 0.19, height: 0.17 }
    ],
    14
  )

  const merged = mergeGeometries([cranium, leftEar, rightEar, jaw, neck])
  if (!merged) {
    throw new Error('buildHeadGeometry: mergeGeometries returned null')
  }
  return merged
}

export function buildHead(params: HeadShapeParams = DEFAULT_HEAD_PARAMS): {
  geometry: THREE.BufferGeometry
  segments: BoneSegment[]
} {
  const geometry = buildHeadGeometry(params)
  const binding = computeSkinBindings(geometry.attributes.position.array as Float32Array, HEAD_BONE_SEGMENTS)
  applySkinAttributes(geometry, binding)
  return { geometry, segments: HEAD_BONE_SEGMENTS }
}

export interface TorsoShapeParams {
  shoulderWidth: number
  chestDepth: number
  waistTaper: number
  hipWidth: number
  bust: number
  butt: number
}

export const DEFAULT_TORSO_PARAMS: TorsoShapeParams = {
  shoulderWidth: 1,
  chestDepth: 1,
  waistTaper: 1,
  hipWidth: 1,
  bust: 0.15,
  butt: 0.2
}

interface TorsoStation {
  y: number
  w: number
  d: number
}

function torsoProfile(p: TorsoShapeParams): TorsoStation[] {
  return [
    { y: 0.86, w: 0.3 * p.hipWidth, d: 0.215 },
    { y: 0.96, w: 0.29 * p.hipWidth, d: 0.205 },
    { y: 1.06, w: 0.255 * p.waistTaper, d: 0.19 },
    { y: 1.14, w: 0.26 * p.waistTaper, d: 0.195 },
    { y: 1.24, w: 0.285, d: 0.225 * p.chestDepth },
    { y: 1.36, w: 0.3, d: 0.225 * p.chestDepth },
    { y: 1.44, w: 0.305 * p.shoulderWidth, d: 0.205 },
    { y: 1.52, w: 0.235 * p.shoulderWidth, d: 0.165 },
    { y: 1.585, w: 0.14, d: 0.13 }
  ]
}

const CLAVICLE_ORIGIN_X = 0.1
const CLAVICLE_Y = 1.47

export function buildTorso(params: TorsoShapeParams = DEFAULT_TORSO_PARAMS): {
  geometry: THREE.BufferGeometry
  segments: BoneSegment[]
} {
  const stations = torsoProfile(params).map((s) => ({
    center: [0, s.y, 0] as [number, number, number],
    width: s.w * 2,
    height: s.d * 2
  }))
  const tube = makeSweep(stations, 20)

  const clavEnd = 0.36 * params.shoulderWidth
  const deltoidGeo = makeEllipsoid(0.095, 0.115, 0.1, 16, 12)
  const leftDeltoid = translateGeometry(deltoidGeo.clone(), -(clavEnd + 0.005), CLAVICLE_Y - 0.005, 0)
  const rightDeltoid = translateGeometry(deltoidGeo, clavEnd + 0.005, CLAVICLE_Y - 0.005, 0)

  const pelvisGeo = makeEllipsoid(0.32 * params.hipWidth, 0.14, 0.23, 20, 14)
  const pelvis = translateGeometry(pelvisGeo, 0, 0.9, 0)

  const bustR = 0.02 + 0.075 * params.bust
  const bustGeo = makeEllipsoid(bustR, bustR * 0.92, bustR * 0.78, 14, 10)
  const leftBust = translateGeometry(
    bustGeo.clone(),
    -0.085 - 0.03 * params.bust,
    1.335,
    (0.155 + 0.045 * params.bust) * params.chestDepth
  )
  const rightBust = translateGeometry(
    bustGeo,
    0.085 + 0.03 * params.bust,
    1.335,
    (0.155 + 0.045 * params.bust) * params.chestDepth
  )

  const buttBase = 0.055 * params.hipWidth
  const buttR = buttBase + 0.065 * params.butt
  const buttGeo = makeEllipsoid(buttR * 1.15, buttR, buttR, 14, 10)
  const leftButt = translateGeometry(buttGeo.clone(), -0.095 * params.hipWidth, 0.925, -(0.13 + 0.055 * params.butt))
  const rightButt = translateGeometry(buttGeo, 0.095 * params.hipWidth, 0.925, -(0.13 + 0.055 * params.butt))

  const merged = mergeGeometries([tube, leftDeltoid, rightDeltoid, pelvis, leftBust, rightBust, leftButt, rightButt])
  if (!merged) {
    throw new Error('buildTorso: mergeGeometries returned null')
  }

  const segments: BoneSegment[] = [
    { name: 'Root', start: [0, 0.86, 0], end: [0, 1.15, 0] },
    { name: 'Spine', start: [0, 1.15, 0], end: [0, 1.3, 0] },
    { name: 'Spine1', start: [0, 1.3, 0], end: [0, 1.45, 0] },
    { name: 'Spine2', start: [0, 1.45, 0], end: [0, 1.6, 0] },
    {
      name: 'LeftClavicle',
      start: [-CLAVICLE_ORIGIN_X, CLAVICLE_Y, 0],
      end: [-(clavEnd + 0.02), CLAVICLE_Y - 0.01, 0]
    },
    {
      name: 'RightClavicle',
      start: [CLAVICLE_ORIGIN_X, CLAVICLE_Y, 0],
      end: [clavEnd + 0.02, CLAVICLE_Y - 0.01, 0]
    }
  ]

  const binding = computeSkinBindings(merged.attributes.position.array as Float32Array, segments)
  applySkinAttributes(merged, binding)

  return { geometry: merged, segments }
}

export function buildArm(side: -1 | 1): {
  geometry: THREE.BufferGeometry
  segments: BoneSegment[]
} {
  const s = side
  const sweep = makeSweep(
    [
      { center: [s * 0.32, 1.5, 0], width: 0.15, height: 0.15 },
      { center: [s * 0.45, 1.495, 0], width: 0.135, height: 0.135 },
      { center: [s * 0.58, 1.495, 0], width: 0.125, height: 0.125 },
      { center: [s * 0.66, 1.5, 0], width: 0.132, height: 0.132 },
      { center: [s * 0.76, 1.505, 0], width: 0.105, height: 0.105 },
      { center: [s * 0.86, 1.51, 0], width: 0.088, height: 0.088 },
      { center: [s * 0.93, 1.512, 0], width: 0.075, height: 0.075 }
    ],
    14,
    true,
    true
  )

  const palmGeo = makeEllipsoid(0.07, 0.055, 0.028, 16, 12)
  const palm = translateGeometry(palmGeo, s * 1.005, 1.505, 0)

  const thumbGeo = makeEllipsoid(0.034, 0.024, 0.024, 10, 8)
  const thumb = translateGeometry(thumbGeo, s * 0.972, 1.487, -0.042)

  const merged = mergeGeometries([sweep, palm, thumb])
  if (!merged) {
    throw new Error('buildArm: mergeGeometries returned null')
  }

  const prefix = side < 0 ? 'Left' : 'Right'
  const segments: BoneSegment[] = [
    {
      name: `${prefix}UpperArm`,
      start: [s * 0.36, 1.5, 0],
      end: [s * 0.66, 1.5, 0]
    },
    {
      name: `${prefix}Forearm`,
      start: [s * 0.66, 1.5, 0],
      end: [s * 0.91, 1.51, 0]
    },
    {
      name: `${prefix}Hand`,
      start: [s * 0.91, 1.51, 0],
      end: [s * 1.04, 1.51, 0]
    }
  ]

  const binding = computeSkinBindings(merged.attributes.position.array as Float32Array, segments)
  applySkinAttributes(merged, binding)

  return { geometry: merged, segments }
}

export function buildLeg(side: -1 | 1): {
  geometry: THREE.BufferGeometry
  segments: BoneSegment[]
} {
  const s = side
  const sweep = makeSweep(
    [
      { center: [s * 0.18, 0.88, 0], width: 0.21, height: 0.21 },
      { center: [s * 0.18, 0.72, 0], width: 0.185, height: 0.185 },
      { center: [s * 0.18, 0.56, 0], width: 0.155, height: 0.155 },
      { center: [s * 0.18, 0.5, 0], width: 0.165, height: 0.165 },
      { center: [s * 0.18, 0.4, 0], width: 0.145, height: 0.145 },
      { center: [s * 0.18, 0.24, 0], width: 0.1, height: 0.1 },
      { center: [s * 0.18, 0.13, 0], width: 0.075, height: 0.075 }
    ],
    14,
    true,
    true
  )

  const foot = makeSweep(
    [
      { center: [s * 0.18, 0.055, -0.02], width: 0.095, height: 0.1 },
      { center: [s * 0.18, 0.045, 0.03], width: 0.088, height: 0.075 },
      { center: [s * 0.18, 0.045, 0.09], width: 0.09, height: 0.062 },
      { center: [s * 0.18, 0.04, 0.15], width: 0.078, height: 0.045 }
    ],
    12,
    true,
    true
  )

  const merged = mergeGeometries([sweep, foot])
  if (!merged) {
    throw new Error('buildLeg: mergeGeometries returned null')
  }

  const prefix = side < 0 ? 'Left' : 'Right'
  const segments: BoneSegment[] = [
    { name: `${prefix}UpperLeg`, start: [s * 0.18, 0.86, 0], end: [s * 0.18, 0.5, 0] },
    { name: `${prefix}Calf`, start: [s * 0.18, 0.5, 0], end: [s * 0.18, 0.12, 0] },
    { name: `${prefix}Foot`, start: [s * 0.18, 0.1, 0.06], end: [s * 0.18, 0.05, 0.22] }
  ]

  const binding = computeSkinBindings(merged.attributes.position.array as Float32Array, segments)
  applySkinAttributes(merged, binding)

  return { geometry: merged, segments }
}
