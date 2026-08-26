import * as THREE from 'three'
import type { BodyShape } from '../../../shared/types/bodyShape'
import { DEFAULT_BODY_SHAPE } from '../../../shared/types/bodyShape'
import type { FaceShape } from '../../../shared/types/faceShape'
import { DEFAULT_FACE_SHAPE } from '../../../shared/types/faceShape'

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
  mouth: THREE.Mesh
}

export function buildFace(
  bodyShape: BodyShape = DEFAULT_BODY_SHAPE,
  faceShape: FaceShape = DEFAULT_FACE_SHAPE,
  mats: FaceMaterials
): FaceResult {
  const group = new THREE.Group()
  const eyes: THREE.Mesh[] = []
  const eyebrows: THREE.Mesh[] = []

  const eyeX = bodyShape.headWidth * 0.38 * faceShape.eyeSpacing
  const eyeY = 0.135
  const eyeZ = bodyShape.headLength * 0.84

  for (const side of [-1, 1]) {
    const scleraGeo = new THREE.SphereGeometry(0.062 * faceShape.eyeScale, 18, 14)
    scleraGeo.scale(1, 1, 0.58)
    const sclera = new THREE.Mesh(scleraGeo, EYE_WHITE)
    sclera.name = side < 0 ? 'Eye_Left' : 'Eye_Right'
    sclera.position.set(side * eyeX, eyeY, eyeZ)
    group.add(sclera)
    eyes.push(sclera)

    const iris = new THREE.Mesh(
      new THREE.CircleGeometry(0.027 * faceShape.eyeScale, 16),
      mats.eye
    )
    iris.name = side < 0 ? 'Iris_Left' : 'Iris_Right'
    iris.position.set(side * eyeX, eyeY, eyeZ + 0.037 * faceShape.eyeScale)
    group.add(iris)
    eyes.push(iris)

    const pupil = new THREE.Mesh(
      new THREE.CircleGeometry(0.013 * faceShape.eyeScale, 12),
      PUPIL_BLACK
    )
    pupil.name = side < 0 ? 'Pupil_Left' : 'Pupil_Right'
    pupil.position.set(side * eyeX, eyeY, eyeZ + 0.04 * faceShape.eyeScale)
    group.add(pupil)

    const browArc = Math.PI * 0.7
    const brow = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.014, 8, 16, browArc), mats.hair)
    brow.name = side < 0 ? 'Eyebrow_Left' : 'Eyebrow_Right'
    const archCenter = 0.5 * Math.PI
    brow.rotation.z = archCenter - browArc / 2 + side * faceShape.browTilt * 0.3
    brow.position.set(
      side * eyeX,
      eyeY + 0.082 * faceShape.browHeight,
      bodyShape.headLength * 0.78
    )
    group.add(brow)
    eyebrows.push(brow)
  }

  const noseSize = faceShape.noseSize
  const noseGeo = new THREE.SphereGeometry(1, 12, 10)
  noseGeo.scale(0.03 * noseSize, 0.05 * noseSize, 0.03 * noseSize)
  const nose = new THREE.Mesh(noseGeo, mats.skin)
  nose.name = 'Nose'
  nose.position.set(0, 0.075, bodyShape.headLength * 0.95)
  group.add(nose)

  const curve = Math.max(-1, Math.min(1, faceShape.mouthCurve))
  const arcLen = (0.35 + 0.65 * Math.abs(curve)) * Math.PI
  const radius = 0.06 * faceShape.mouthWidth
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.012, 8, 20, arcLen), mats.mouth)
  mouth.name = 'Mouth'
  mouth.rotation.z = curve >= 0 ? 1.5 * Math.PI - arcLen / 2 : 0.5 * Math.PI - arcLen / 2
  mouth.rotation.x = -0.15
  mouth.position.set(0, 0.015, bodyShape.headLength * 0.86)
  group.add(mouth)

  return { group, eyes, eyebrows, mouth }
}
