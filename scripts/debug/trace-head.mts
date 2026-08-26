import * as T from 'three'
import { buildHead } from '../../src/renderer/three/procedural/BodyParts.ts'
import { buildFace } from '../../src/renderer/three/procedural/FaceFeatures.ts'
import { sanitizeBodyShape } from '../../src/shared/types/bodyShape.ts'
import { sanitizeFaceShape } from '../../src/shared/types/faceShape.ts'
import { ProportionManager } from '../../src/renderer/three/ProportionManager.ts'
import { readFileSync } from 'node:fs'

interface BoneDef { name: string; pos: [number, number, number]; children?: BoneDef[] }
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
function build(def: BoneDef): T.Bone {
  const b = new T.Bone()
  b.name = def.name
  b.position.set(...def.pos)
  for (const c of def.children ?? []) b.add(build(c))
  return b
}
function collect(b: T.Bone, m: Map<string, T.Bone>) { m.set(b.name, b); for (const c of b.children) if ((c as T.Bone).isBone) collect(c as T.Bone, m) }

const mats = {
  skin: new T.MeshStandardMaterial(), hair: new T.MeshStandardMaterial(),
  eye: new T.MeshStandardMaterial(), mouth: new T.MeshStandardMaterial()
}

for (const file of process.argv.slice(2)) {
  const dna = JSON.parse(readFileSync(file, 'utf-8'))
  const shape = sanitizeBodyShape(dna.bodyShape)
  const faceShape = sanitizeFaceShape(dna.face)

  const root = build(SKELETON)
  const boneMap = new Map<string, T.Bone>()
  collect(root, boneMap)
  root.updateMatrixWorld(true)

  const { geometry } = buildHead(shape)
  const bones = [boneMap.get('Neck')!, boneMap.get('Head')!]
  const inverses = bones.map((b) => new T.Matrix4().copy(b.matrixWorld).invert())
  const mesh = new T.SkinnedMesh(geometry, mats.skin)
  mesh.bind(new T.Skeleton(bones, inverses))
  const faceRes = buildFace(shape, faceShape, mats)
  boneMap.get('Head')!.add(faceRes.group)

  const pm = new ProportionManager()
  pm.setBoneMap(boneMap)
  pm.applyProportions(dna.morphs ?? {})
  root.updateMatrixWorld(true)

  // CPU-deform skull verts
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
      const t = v.clone().applyMatrix4(inverses[si[i * 4 + k]]).applyMatrix4(bones[si[i * 4 + k]].matrixWorld)
      out.addScaledVector(t, w)
    }
    deformed.push(out)
  }

  console.log('\n===', file.split(/[\\/]/).pop())
  let allOk = true
  for (const [label, obj] of [['eye L', faceRes.eyes[0]], ['eye R', faceRes.eyes.find(e => e.name === 'Eye_Right')!], ['brow L', faceRes.eyebrows[0]], ['nose', faceRes.group.getObjectByName('Nose')!], ['mouth', faceRes.mouth]] as const) {
    const fp = new T.Vector3(); obj.getWorldPosition(fp)
    // compare against deformed skull at the feature's OWN x band
    let surfZ = -1e9
    for (const d of deformed) {
      if (Math.abs(d.y - fp.y) < 0.03 && Math.abs(d.x - fp.x) < 0.04) surfZ = Math.max(surfZ, d.z)
    }
    const halfExtents: Record<string, number> = { 'eye L': 0.042, 'eye R': 0.042, 'brow L': 0.014, nose: 0.03 * (faceShape.noseSize ?? 1), mouth: 0.012 }
      const front = fp.z + (halfExtents[label] ?? 0.015)
      const ok = front >= surfZ - 0.008 || surfZ === -1e9
    if (!ok) allOk = false
    console.log(` ${label.padEnd(5)} world y ${fp.y.toFixed(3)} z ${fp.z.toFixed(3)} | skull z at same x,y: ${surfZ.toFixed(3)} -> ${ok ? 'on surface' : 'INSIDE'}`)
  }
  const ys = deformed.map((d) => d.y)
  console.log(` skull span: ${Math.min(...ys).toFixed(3)} .. ${Math.max(...ys).toFixed(3)}`)
  console.log(allOk ? ' ALL FEATURES OK' : ' !!! FEATURES BURIED')
}

