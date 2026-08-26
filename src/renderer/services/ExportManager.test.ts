// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { exportCharacter, validateExport, type ExportProfile } from './ExportManager'
import type { CharacterDNA } from '../../shared/types/dna'

const BINARY_PROFILE: ExportProfile = {
  id: 'glb-standard',
  name: 'GLB Standard',
  description: 'Binary glTF',
  binary: true,
  embedImages: true
}

function makeDNA(): CharacterDNA {
  return {
    version: 1,
    name: 'Test',
    slots: {},
    morphs: {},
    colors: {},
    metadata: { created: '', modified: '' }
  }
}

function makeSkinnedScene(): THREE.Group {
  const group = new THREE.Group()
  const root = new THREE.Bone()
  root.name = 'Root'
  const spine = new THREE.Bone()
  spine.name = 'Spine'
  spine.position.set(0, 0.25, 0)
  root.add(spine)

  const geo = new THREE.CylinderGeometry(0.2, 0.25, 0.5, 8)
  const count = geo.attributes.position.count
  const indices = new Uint16Array(count)
  const weights = new Float32Array(count * 4)
  for (let i = 0; i < count; i++) {
    indices[i] = i % 2
    weights[i * 4] = 1
  }
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(indices, 4))
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(weights, 4))

  root.updateMatrixWorld(true)
  const mesh = new THREE.SkinnedMesh(
    geo,
    new THREE.MeshStandardMaterial({ color: '#f5d0a9' })
  )
  mesh.bind(
    new THREE.Skeleton(
      [root, spine],
      [new THREE.Matrix4().copy(root.matrixWorld).invert(), new THREE.Matrix4().copy(spine.matrixWorld).invert()]
    )
  )
  group.add(mesh)
  group.add(root)
  return group
}

describe('exportCharacter', () => {
  it('exports a skinned procedural scene to binary GLB', async () => {
    const scene = makeSkinnedScene()
    const { buffer, validation } = await exportCharacter(scene, makeDNA(), BINARY_PROFILE, 'test')
    expect(buffer.byteLength).toBeGreaterThan(1000)
    const magic = new TextDecoder().decode(new Uint8Array(buffer, 0, 4))
    expect(magic).toBe('glTF')
    expect(validation.meshesPresent).toBe(true)
  }, 30000)

  it('validation recognizes procedural body via hasBody flag', () => {
    const scene = makeSkinnedScene()
    const result = validateExport(makeDNA(), scene, true)
    expect(result.bodySlotFilled).toBe(true)
    expect(result.headSlotFilled).toBe(true)
    const emptySceneResult = validateExport(makeDNA(), scene, false)
    expect(emptySceneResult.bodySlotFilled).toBe(false)
    expect(emptySceneResult.meshesPresent).toBe(true)
  })
})
