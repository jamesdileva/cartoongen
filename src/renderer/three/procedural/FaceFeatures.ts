import * as THREE from 'three'
import { DEFAULT_HEAD_PARAMS, type HeadShapeParams } from './BodyParts'

const EYE_WHITE = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.15 })
const PUPIL_BLACK = new THREE.MeshStandardMaterial({ color: '#151515', roughness: 0.3 })

export interface FaceMaterials {
  skin: THREE.Material
  hair: THREE.Material
  eye: THREE.Material
  mouth: THREE.Material
}

export interface FaceResult {
  group: THREE.Group
  eyes: THREE.Mesh[]
  eyebrows: THREE.Mesh[]
}

export function buildFace(
  params: HeadShapeParams = DEFAULT_HEAD_PARAMS,
  mats: FaceMaterials
): FaceResult {
  const group = new THREE.Group()
  const eyes: THREE.Mesh[] = []
  const eyebrows: THREE.Mesh[] = []

  const eyeX = params.headWidth * 0.38
  const eyeY = 0.135
  const eyeZ = params.headLength * 0.84

  for (const side of [-1, 1]) {
    const scleraGeo = new THREE.SphereGeometry(0.062, 18, 14)
    scleraGeo.scale(1, 1, 0.58)
    const sclera = new THREE.Mesh(scleraGeo, EYE_WHITE)
    sclera.name = side < 0 ? 'Eye_Left' : 'Eye_Right'
    sclera.position.set(side * eyeX, eyeY, eyeZ)
    group.add(sclera)
    eyes.push(sclera)

    const iris = new THREE.Mesh(new THREE.CircleGeometry(0.027, 16), mats.eye)
    iris.name = side < 0 ? 'Iris_Left' : 'Iris_Right'
    iris.position.set(side * eyeX, eyeY, eyeZ + 0.037)
    group.add(iris)
    eyes.push(iris)

    const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.013, 12), PUPIL_BLACK)
    pupil.name = side < 0 ? 'Pupil_Left' : 'Pupil_Right'
    pupil.position.set(side * eyeX, eyeY, eyeZ + 0.04)
    group.add(pupil)

    const browArc = Math.PI * 0.75
    const brow = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.014, 8, 16, browArc), mats.hair)
    brow.name = side < 0 ? 'Eyebrow_Left' : 'Eyebrow_Right'
    brow.rotation.z = (Math.PI - browArc) / 2
    brow.position.set(side * eyeX, eyeY + 0.082, params.headLength * 0.78)
    group.add(brow)
    eyebrows.push(brow)
  }

  const noseGeo = new THREE.SphereGeometry(1, 12, 10)
  noseGeo.scale(0.03, 0.05, 0.03)
  const nose = new THREE.Mesh(noseGeo, mats.skin)
  nose.name = 'Nose'
  nose.position.set(0, 0.075, params.headLength * 0.95)
  group.add(nose)

  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.012, 8, 16, Math.PI), mats.mouth)
  mouth.name = 'Mouth'
  mouth.rotation.z = Math.PI
  mouth.rotation.x = -0.15
  mouth.position.set(0, 0.015, params.headLength * 0.86)
  group.add(mouth)

  return { group, eyes, eyebrows }
}
