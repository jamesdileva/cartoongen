import * as T from 'three'
import { buildHead } from '../../src/renderer/three/procedural/BodyParts.ts'
import { buildFace } from '../../src/renderer/three/procedural/FaceFeatures.ts'
import { sanitizeBodyShape } from '../../src/shared/types/bodyShape.ts'
import { sanitizeFaceShape } from '../../src/shared/types/faceShape.ts'
import { readFileSync } from 'node:fs'

interface BoneDef { name: string; pos: [number, number, number]; rotZ?: number; children?: BoneDef[] }
const SKELETON: BoneDef = {
  name: 'Root', pos: [0, 0.9, 0], children: [
    { name: 'Spine', pos: [0, 0.25, 0], children: [
      { name: 'Spine1', pos: [0, 0.15, 0], children: [
        { name: 'Spine2', pos: [0, 0.15, 0], children: [
          { name: 'Neck', pos: [0, 0.15, 0], children: [{ name: 'Head', pos: [0, 0.15, 0] }] },
          { name: 'LeftClavicle', pos: [-0.1, 0.02, 0] },
          { name: 'RightClavicle', pos: [0.1, 0.02, 0] }
        ] }
      ] }
    ] }
  ]
}
function build(def: BoneDef, rotZParent = 0): T.Bone {
  const b = new T.Bone()
  b.name = def.name
  b.position.set(...def.pos)
  if (def.rotZ !== undefined) b.rotation.z = def.rotZ
  for (const c of def.children ?? []) b.add(build(c))
  return b
}
function collect(b: T.Bone, m: Map<string, T.Bone>) { m.set(b.name, b); for (const c of b.children) if ((c as T.Bone).isBone) collect(c as T.Bone, m) }

const remap = (v: number, a: number, bb: number) => a + v * (bb - a)

const mats = {
  skin: new T.MeshStandardMaterial(), hair: new T.MeshStandardMaterial(),
  eye: new T.MeshStandardMaterial(), mouth: new T.MeshStandardMaterial()
}

const files = process.argv.slice(2)
for (const file of files) {
  const dna = JSON.parse(readFileSync(file, 'utf-8'))
  const shape = sanitizeBodyShape(dna.bodyShape)
  const face = sanitizeFaceShape(dna.face)

  // fresh skeleton, REST pose
  const root = build(SKELETON)
  const boneMap = new Map<string, T.Bone>()
  collect(root, boneMap)
  root.updateMatrixWorld(true)

  // build + bind skull (same as CharacterManager.bindToBones)
  const { geometry } = buildHead(shape)
  const bones = [boneMap.get('Neck')!, boneMap.get('Head')!]
  const inverses = bones.map((b) => new T.Matrix4().copy(b.matrixWorld).invert())
  const mesh = new T.SkinnedMesh(geometry, mats.skin)
  mesh.bind(new T.Skeleton(bones, inverses))

  // face parented to Head bone (same as rebuildFaceGroup)
  const faceRes = buildFace(shape, face, mats)
  boneMap.get('Head')!.add(faceRes.group)

  // apply saved morphs (head-related ones only affect head position)
  const m = dna.morphs ?? {}
  const sHeight = remap(m.height ?? 0.5, 0.88, 1.12)
  for (const n of ['Spine', 'Spine1', 'Spine2']) boneMap.get(n)!.scale.y = sHeight
  boneMap.get('Neck')!.scale.y = remap(m.height ?? 0.5, 0.88, 1.12)
  boneMap.get('Head')!.scale.y = remap(m.headSize ?? 0.5, 0.82, 1.22)

  root.updateMatrixWorld(true)

  // deform skull verts on CPU exactly like the skinning shader
  const pos = geometry.attributes.position as T.BufferAttribute
  const si = geometry.attributes.skinIndex.array as ArrayLike<number>
  const sw = geometry.attributes.skinWeight.array as ArrayLike<number>
  const deformed: T.Vector3[] = []
  const v = new T.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const out = new T.Vector3()
    for (let k = 0; k < 4; k++) {
      const w = sw[i * 4 + k]
      if (w <= 0) continue
      const bone = bones[si[i * 4 + k]]
      const tmp = v.clone().applyMatrix4(inverses[si[i * 4 + k]]).applyMatrix4(bone.matrixWorld)
      out.addScaledVector(tmp, w)
    }
    deformed.push(out)
  }

  console.log('\n===', file.split(/[\\/]/).pop())
  for (const [label, meshObj] of [['eye', faceRes.eyes[0]], ['brow', faceRes.eyebrows[0]], ['mouth', faceRes.mouth]] as const) {
    const fp = new T.Vector3(); meshObj.getWorldPosition(fp)
    // find nearest deformed skull verts and compare along z
    let surfZAtFeature = -1e9
    for (const d of deformed) {
      if (Math.abs(d.y - fp.y) < 0.02 && Math.abs(d.x - fp.x) < 0.08) surfZAtFeature = Math.max(surfZAtFeature, d.z)
    }
    const status = fp.z >= surfZAtFeature - 0.01 ? 'on-surface' : `INSIDE (feature z ${fp.z.toFixed(3)} < skull ${surfZAtFeature.toFixed(3)})`
    console.log(` ${label.padEnd(5)} world (${fp.x.toFixed(3)}, ${fp.y.toFixed(3)}, ${fp.z.toFixed(3)}) -> ${status}`)
    // vertical containment: is feature y within deformed skull span at that x?
    const ysNear = deformed.filter((d) => Math.abs(d.x - fp.x) < 0.05 && Math.abs(d.z - fp.z) < 0.1).map((d) => d.y)
    if (ysNear.length > 0) {
      const lo = Math.min(...ysNear), hi = Math.max(...ysNear)
      const contained = fp.y >= lo - 0.02 && fp.y <= hi + 0.02
      console.log(`       skull span near feature: y ${lo.toFixed(3)}..${hi.toFixed(3)} -> ${contained ? 'contained' : 'OUTSIDE VERTICALLY'}`)
    } else {
      console.log('       no skull geometry near feature position!')
    }
  }
}
