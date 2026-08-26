import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { buildFace, type FaceMaterials } from './FaceFeatures'
import { DEFAULT_BODY_SHAPE, type BodyShape } from '../../../shared/types/bodyShape'
import { DEFAULT_FACE_SHAPE, type FaceShape } from '../../../shared/types/faceShape'

const mats: FaceMaterials = {
  skin: new THREE.MeshStandardMaterial(),
  hair: new THREE.MeshStandardMaterial(),
  eye: new THREE.MeshStandardMaterial({ color: '#3366ff' }),
  mouth: new THREE.MeshStandardMaterial()
}

const shapes: BodyShape[] = [
  DEFAULT_BODY_SHAPE,
  { ...DEFAULT_BODY_SHAPE, headLength: 0.18 },
  { ...DEFAULT_BODY_SHAPE, headHeight: 0.28 },
  { ...DEFAULT_BODY_SHAPE, headWidth: 0.31, headLength: 0.19 },
  { ...DEFAULT_BODY_SHAPE, headHeight: 0.16, headLength: 0.32 }
]

describe('buildFace', () => {
  it('builds a group with eyes, brows, nose and mouth', () => {
    const face = buildFace(DEFAULT_BODY_SHAPE, DEFAULT_FACE_SHAPE, mats)
    let meshCount = 0
    face.group.traverse((c) => {
      if (c instanceof THREE.Mesh) meshCount++
    })
    expect(meshCount).toBe(12)
    expect(face.eyes.length).toBe(4)
    expect(face.eyebrows.length).toBe(2)
  })

  it('positions features within the head-bone local volume', () => {
    const face = buildFace(DEFAULT_BODY_SHAPE, DEFAULT_FACE_SHAPE, mats)
    const box = new THREE.Box3().setFromObject(face.group)
    expect(box.min.y).toBeGreaterThan(-0.1)
    expect(box.max.y).toBeLessThan(0.35)
    expect(box.max.z).toBeGreaterThan(0.2)
  })

  it('mirrors eye placement across x=0', () => {
    const face = buildFace(DEFAULT_BODY_SHAPE, DEFAULT_FACE_SHAPE, mats)
    const left = face.eyes[0].position
    const right = face.eyes.find((e) => e.name === 'Eye_Right')!.position
    expect(left.x).toBeCloseTo(-right.x, 6)
    expect(left.y).toBeCloseTo(right.y, 6)
  })

  it('assigns the eye material to irises only', () => {
    const face = buildFace(DEFAULT_BODY_SHAPE, DEFAULT_FACE_SHAPE, mats)
    const iris = face.eyes.find((e) => e.name === 'Iris_Left')!
    const sclera = face.eyes.find((e) => e.name === 'Eye_Left')!
    expect(iris.material).toBe(mats.eye)
    expect(sclera.material).not.toBe(mats.eye)
  })

  it('mouthCurve flips the mouth from smile to frown', () => {
    const smile = buildFace(DEFAULT_BODY_SHAPE, { ...DEFAULT_FACE_SHAPE, mouthCurve: 0.9 }, mats)
    const frown = buildFace(DEFAULT_BODY_SHAPE, { ...DEFAULT_FACE_SHAPE, mouthCurve: -0.9 }, mats)
    // Nose-relative anchoring: frown apex sits 2cm below the nose bottom,
    // smile dips below its own anchor but stays in the chin region.
    const noseBottomLocal = 1.86 - DEFAULT_BODY_SHAPE.headHeight * 0.15 - 0.05 - 1.75
    const smileMinY = Math.min(...smile.mouthPoints.map((p) => p.y))
    const frownMaxY = Math.max(...frown.mouthPoints.map((p) => p.y))
    expect(frownMaxY).toBeCloseTo(noseBottomLocal - 0.02, 1)
    expect(smileMinY).toBeLessThan(noseBottomLocal - 0.05)
    expect(smileMinY).toBeGreaterThan(1.63 - 1.75)
    // Smile never rises above the nose bottom, frown never dips below it
    const smileMaxY = Math.max(...smile.mouthPoints.map((p) => p.y))
    const frownMinY = Math.min(...frown.mouthPoints.map((p) => p.y))
    expect(smileMaxY).toBeLessThanOrEqual(noseBottomLocal - 0.015)
    expect(frownMinY).toBeLessThan(noseBottomLocal - 0.05)
  })

  it('neutral mouth curve is a shallow line', () => {
    const neutral = buildFace(DEFAULT_BODY_SHAPE, { ...DEFAULT_FACE_SHAPE, mouthCurve: 0 }, mats)
    const box = new THREE.Box3().setFromObject(neutral.mouth)
    expect(box.max.y - box.min.y).toBeLessThan(0.09)
  })

  it('brow tilt mirrors rotation across sides', () => {
    const tilted = buildFace(DEFAULT_BODY_SHAPE, { ...DEFAULT_FACE_SHAPE, browTilt: 0.8 }, mats)
    const neutral = buildFace(DEFAULT_BODY_SHAPE, DEFAULT_FACE_SHAPE, mats)
    const left = tilted.eyebrows.find((b) => b.name === 'Eyebrow_Left')!
    const right = tilted.eyebrows.find((b) => b.name === 'Eyebrow_Right')!
    const leftNeutral = neutral.eyebrows.find((b) => b.name === 'Eyebrow_Left')!.rotation.z
    const rightNeutral = neutral.eyebrows.find((b) => b.name === 'Eyebrow_Right')!.rotation.z
    const leftOffset = left.rotation.z - leftNeutral
    const rightOffset = right.rotation.z - rightNeutral
    expect(leftOffset).toBeCloseTo(-rightOffset, 6)
    expect(Math.abs(leftOffset)).toBeGreaterThan(0.1)
  })

  it('eyeScale shrinks and grows the eyes', () => {
    const small = buildFace(DEFAULT_BODY_SHAPE, { ...DEFAULT_FACE_SHAPE, eyeScale: 0.7 }, mats)
    const big = buildFace(DEFAULT_BODY_SHAPE, { ...DEFAULT_FACE_SHAPE, eyeScale: 1.4 }, mats)
    const smallBox = new THREE.Box3().setFromObject(small.eyes[0])
    const bigBox = new THREE.Box3().setFromObject(big.eyes[0])
    const smallSize = smallBox.max.x - smallBox.min.x
    const bigSize = bigBox.max.x - bigBox.min.x
    expect(bigSize).toBeGreaterThan(smallSize)
  })

  it('eyeSpacing widens the gap between eyes', () => {
    const narrow = buildFace(DEFAULT_BODY_SHAPE, { ...DEFAULT_FACE_SHAPE, eyeSpacing: 0.8 }, mats)
    const wide = buildFace(DEFAULT_BODY_SHAPE, { ...DEFAULT_FACE_SHAPE, eyeSpacing: 1.3 }, mats)
    const narrowX = Math.abs(narrow.eyes[0].position.x)
    const wideX = Math.abs(wide.eyes[0].position.x)
    expect(wideX).toBeGreaterThan(narrowX)
  })

  it('clamps extreme face values without throwing', () => {
    const extreme: FaceShape = {
      eyeScale: 99,
      eyeSpacing: -5,
      browTilt: 12,
      browHeight: 0,
      mouthCurve: 42,
      mouthWidth: -3,
      noseSize: 100
    }
    expect(() => buildFace(DEFAULT_BODY_SHAPE, extreme, mats)).not.toThrow()
  })

  it('projects every mouth point onto the skull surface for extreme shapes and curves', () => {
    const shapes = [
      DEFAULT_BODY_SHAPE,
      { ...DEFAULT_BODY_SHAPE, headLength: 0.18 },
      { ...DEFAULT_BODY_SHAPE, headLength: 0.32 },
      { ...DEFAULT_BODY_SHAPE, headWidth: 0.31, headLength: 0.18, headHeight: 0.16 },
      { ...DEFAULT_BODY_SHAPE, headHeight: 0.28 }
    ]
    const CY = 1.86
    const CZ = 0.005
    for (const shape of shapes) {
      for (const curve of [0, 0.9, -0.9]) {
        const face = buildFace(shape, { ...DEFAULT_FACE_SHAPE, mouthCurve: curve }, mats)
        expect(face.mouthPoints.length).toBeGreaterThan(10)
        for (const pt of face.mouthPoints) {
          const worldY = pt.y + 1.75
          const ny = (worldY - CY) / shape.headHeight
          const nx = pt.x / shape.headWidth
          const surf = CZ + shape.headLength * Math.sqrt(Math.max(1 - nx * nx - ny * ny, 0))
          expect(pt.z).toBeGreaterThanOrEqual(surf - 0.002)
        }
      }
    }
  })

  it('eye height adapts to tall heads', () => {
    const normal = buildFace(DEFAULT_BODY_SHAPE, DEFAULT_FACE_SHAPE, mats)
    const tall = buildFace({ ...DEFAULT_BODY_SHAPE, headHeight: 0.29 }, DEFAULT_FACE_SHAPE, mats)
    expect(tall.eyes[0].position.y).toBeGreaterThan(normal.eyes[0].position.y)
  })

  it('mouth never overlaps the nose across extreme shapes (nose-relative anchor)', () => {
    const CY = 1.86
    for (const shape of shapes) {
      for (const noseSize of [0.6, 1.0, 1.6]) {
        for (const curve of [0, 0.9, -0.9]) {
          const face = buildFace(
            shape,
            { ...DEFAULT_FACE_SHAPE, mouthCurve: curve, noseSize },
            mats
          )
          const noseBottomY = CY - shape.headHeight * 0.15 - 0.05 * noseSize
          for (const pt of face.mouthPoints) {
            // every mouth point stays at least 1cm below the nose bottom
            expect(pt.y + 1.75).toBeLessThanOrEqual(noseBottomY - 0.008)
          }
        }
      }
    }
  })

  it('all mouth points stay on the ellipsoid surface for extreme shapes (nose-relative anchor)', () => {
    const CY = 1.86
    const CZ = 0.005
    for (const shape of shapes) {
      for (const curve of [0, 0.9, -0.9]) {
        const face = buildFace(
          shape,
          { ...DEFAULT_FACE_SHAPE, mouthCurve: curve, noseSize: 1.2 },
          mats
        )
        for (const pt of face.mouthPoints) {
          const worldY = pt.y + 1.75
          const ny = (worldY - CY) / shape.headHeight
          const nx = pt.x / shape.headWidth
          const surf = CZ + shape.headLength * Math.sqrt(Math.max(1 - nx * nx - ny * ny, 0))
          expect(pt.z).toBeGreaterThanOrEqual(surf - 0.002)
        }
      }
    }
  })
})
