import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { buildHead } from './procedural/BodyParts'
import { buildFace } from './procedural/FaceFeatures'
import { sanitizeBodyShape, DEFAULT_BODY_SHAPE } from '../../shared/types/bodyShape'
import { sanitizeFaceShape, DEFAULT_FACE_SHAPE } from '../../shared/types/faceShape'
import { MaterialManager } from './MaterialManager'

/**
 * Regression: SkinnedMesh.bind(skeleton) with no bindMatrix calls
 * skeleton.calculateInverses(), which overwrites pre-computed rest inverses
 * with whatever scale the bones currently carry. CharacterManager must pass
 * an explicit bindMatrix so cached rest inverses survive.
 */
describe('skinned bind preserves rest inverses', () => {
  function makeRestSkeleton(): { bone: THREE.Bone; skeleton: THREE.Skeleton } {
    const bone = new THREE.Bone()
    bone.position.set(0, 1.75, 0)
    bone.updateMatrixWorld(true)
    const restInverse = new THREE.Matrix4().copy(bone.matrixWorld).invert()
    const skeleton = new THREE.Skeleton([bone], [restInverse.clone()])
    return { bone, skeleton }
  }

  it('one-arg bind() clobbers provided rest inverses after bone scale changes', () => {
    const { bone, skeleton } = makeRestSkeleton()
    const restInverse = skeleton.boneInverses[0].clone()

    // Scale the bone AFTER inverses were computed (applyProportions before rebuild)
    bone.scale.y = 0.9
    bone.updateMatrixWorld(true)

    const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial())
    mesh.bind(skeleton) // no bindMatrix — triggers calculateInverses()

    expect(skeleton.boneInverses[0].elements).not.toEqual(restInverse.elements)
  })

  it('explicit bindMatrix keeps the provided rest inverses', () => {
    const { bone, skeleton } = makeRestSkeleton()
    const restInverse = skeleton.boneInverses[0].clone()

    bone.scale.y = 0.9
    bone.updateMatrixWorld(true)

    const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial())
    mesh.bind(skeleton, new THREE.Matrix4())

    expect(skeleton.boneInverses[0].elements).toEqual(restInverse.elements)
    expect(mesh.bindMatrix.elements).toEqual(new THREE.Matrix4().elements)
  })

  it('skull verts and face features track Head.scale.y together', () => {
    const shape = sanitizeBodyShape(DEFAULT_BODY_SHAPE)
    const faceShape = sanitizeFaceShape(DEFAULT_FACE_SHAPE)
    const mats = new MaterialManager()

    // Rest skeleton matching CharacterManager's chain (Head world y = 1.75)
    const root = new THREE.Bone()
    root.name = 'Root'
    root.position.set(0, 0.9, 0)
    const neck = new THREE.Bone()
    neck.name = 'Neck'
    neck.position.set(0, 0.7, 0) // world y = 1.60
    const head = new THREE.Bone()
    head.name = 'Head'
    head.position.set(0, 0.15, 0) // world y = 1.75
    root.add(neck)
    neck.add(head)
    root.updateMatrixWorld(true)

    const restInverse = new THREE.Matrix4().copy(head.matrixWorld).invert()
    const skeleton = new THREE.Skeleton([head], [restInverse])

    const { geometry } = buildHead(shape, 0.5)
    const skull = new THREE.SkinnedMesh(geometry, mats.getMaterial('skin'))
    skull.bind(skeleton, new THREE.Matrix4()) // CharacterManager's fixed path
    skull.updateMatrixWorld(true)

    const face = buildFace(shape, faceShape, {
      skin: mats.getMaterial('skin'),
      hair: mats.getMaterial('hair'),
      eye: mats.getMaterial('eye'),
      mouth: mats.getMaterial('mouth')
    })
    head.add(face.group)

    // Pick a skull vert near the mouth latitude (y≈1.72, front of face)
    const pos = geometry.attributes.position
    let mouthVert = -1
    let best = Infinity
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i)
      const z = pos.getZ(i)
      const d = Math.abs(y - 1.72) + Math.abs(z - 0.2)
      if (d < best) {
        best = d
        mouthVert = i
      }
    }
    expect(mouthVert).toBeGreaterThanOrEqual(0)

    const restV = new THREE.Vector3(pos.getX(mouthVert), pos.getY(mouthVert), pos.getZ(mouthVert))

    function skullWorld(v: THREE.Vector3): THREE.Vector3 {
      // 100% Head-weighted (buildHead cranium rule)
      return v.clone().applyMatrix4(restInverse).applyMatrix4(head.matrixWorld)
    }

    function faceLocalFor(v: THREE.Vector3): THREE.Vector3 {
      // Face features are authored as worldPos - HEAD_BONE_Y on the Head bone
      return new THREE.Vector3(v.x, v.y - 1.75, v.z)
    }

    // At rest: both agree
    head.scale.set(1, 1, 1)
    neck.scale.set(1, 1, 1)
    root.updateMatrixWorld(true)
    const skullRest = skullWorld(restV)
    const faceRest = faceLocalFor(restV).applyMatrix4(head.matrixWorld)
    expect(faceRest.distanceTo(skullRest)).toBeLessThan(1e-6)

    // Apply headSize + height-style parent scale (the failing live case)
    head.scale.y = 0.912
    neck.scale.y = 1.027
    root.updateMatrixWorld(true)

    const skullScaled = skullWorld(restV)
    const faceScaled = faceLocalFor(restV).applyMatrix4(head.matrixWorld)
    expect(faceScaled.distanceTo(skullScaled)).toBeLessThan(1e-6)

    // And the converse: if inverses were recalculated post-scale, they diverge
    const badInverse = new THREE.Matrix4().copy(head.matrixWorld).invert()
    const badSkull = restV.clone().applyMatrix4(badInverse).applyMatrix4(head.matrixWorld)
    // badSkull equals restV in world of scaled bone-space round-trip — i.e. no scale applied relative to face
    expect(faceScaled.distanceTo(badSkull)).toBeGreaterThan(1e-3)

    mats.dispose()
    geometry.dispose()
  })
})
