import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { buildFace, type FaceMaterials } from './FaceFeatures'
import { DEFAULT_BODY_SHAPE } from '../../../shared/types/bodyShape'

const mats: FaceMaterials = {
  skin: new THREE.MeshStandardMaterial(),
  hair: new THREE.MeshStandardMaterial(),
  eye: new THREE.MeshStandardMaterial({ color: '#3366ff' }),
  mouth: new THREE.MeshStandardMaterial()
}

describe('buildFace', () => {
  it('builds a group with eyes, brows, nose and mouth', () => {
    const face = buildFace(DEFAULT_BODY_SHAPE, mats)
    let meshCount = 0
    face.group.traverse((c) => {
      if (c instanceof THREE.Mesh) meshCount++
    })
    expect(meshCount).toBe(10)
    expect(face.eyes.length).toBe(4)
    expect(face.eyebrows.length).toBe(2)
  })

  it('positions features within the head-bone local volume', () => {
    const face = buildFace(DEFAULT_BODY_SHAPE, mats)
    const box = new THREE.Box3().setFromObject(face.group)
    expect(box.min.y).toBeGreaterThan(-0.1)
    expect(box.max.y).toBeLessThan(0.35)
    expect(box.max.z).toBeGreaterThan(0.2)
  })

  it('mirrors eye placement across x=0', () => {
    const face = buildFace(DEFAULT_BODY_SHAPE, mats)
    const left = face.eyes[0].position
    const right = face.eyes.find((e) => e.name === 'Eye_Right')!.position
    expect(left.x).toBeCloseTo(-right.x, 6)
    expect(left.y).toBeCloseTo(right.y, 6)
  })

  it('assigns the eye material to irises only', () => {
    const face = buildFace(DEFAULT_BODY_SHAPE, mats)
    const iris = face.eyes.find((e) => e.name === 'Iris_Left')!
    const sclera = face.eyes.find((e) => e.name === 'Eye_Left')!
    expect(iris.material).toBe(mats.eye)
    expect(sclera.material).not.toBe(mats.eye)
  })
})
