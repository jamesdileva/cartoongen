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
