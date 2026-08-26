import * as THREE from 'three'
import type { BodyShape } from '../../../shared/types/bodyShape'
import { DEFAULT_BODY_SHAPE } from '../../../shared/types/bodyShape'
import type { FaceShape } from '../../../shared/types/faceShape'
import { DEFAULT_FACE_SHAPE } from '../../../shared/types/faceShape'

const EYE_WHITE = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.15 })
const PUPIL_BLACK = new THREE.MeshStandardMaterial({ color: '#151515', roughness: 0.3 })

const CRANIUM_CENTER_Y = 1.86
const CRANIUM_CENTER_Z = 0.005
const HEAD_BONE_Y = 1.75

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
  mouthPoints: THREE.Vector3[]
}

function surfaceZ(shape: BodyShape, x: number, worldY: number): number {
  const nx = x / shape.headWidth
  const ny = (worldY - CRANIUM_CENTER_Y) / shape.headHeight
  const k = Math.max(1 - nx * nx - ny * ny, 0.02)
  return CRANIUM_CENTER_Z + shape.headLength * Math.sqrt(k)
}

export function buildFace(
  bodyShape: BodyShape = DEFAULT_BODY_SHAPE,
  faceShape: FaceShape = DEFAULT_FACE_SHAPE,
  mats: FaceMaterials
): FaceResult {
  const group = new THREE.Group()
  const eyes: THREE.Mesh[] = []
  const eyebrows: THREE.Mesh[] = []

  const W = bodyShape.headWidth
  const H = bodyShape.headHeight
  const eyeX = W * 0.38 * faceShape.eyeSpacing
  const eyeWorldY = CRANIUM_CENTER_Y + H * 0.12
  const eyeY = eyeWorldY - HEAD_BONE_Y

  for (const side of [-1, 1]) {
    const scleraR = 0.062 * faceShape.eyeScale
    const scleraHalfZ = scleraR * 0.58
    const scleraGeo = new THREE.SphereGeometry(scleraR, 18, 14)
    scleraGeo.scale(1, 1, 0.58)
    const sclera = new THREE.Mesh(scleraGeo, EYE_WHITE)
    sclera.name = side < 0 ? 'Eye_Left' : 'Eye_Right'
    const scleraZ = surfaceZ(bodyShape, side * eyeX, eyeWorldY) - scleraHalfZ * 0.45
    sclera.position.set(side * eyeX, eyeY, scleraZ)
    group.add(sclera)
    eyes.push(sclera)

    const iris = new THREE.Mesh(
      new THREE.CircleGeometry(0.027 * faceShape.eyeScale, 16),
      mats.eye
    )
    iris.name = side < 0 ? 'Iris_Left' : 'Iris_Right'
    iris.position.set(side * eyeX, eyeY, scleraZ + scleraHalfZ + 0.002)
    group.add(iris)
    eyes.push(iris)

    const pupil = new THREE.Mesh(
      new THREE.CircleGeometry(0.013 * faceShape.eyeScale, 12),
      PUPIL_BLACK
    )
    pupil.name = side < 0 ? 'Pupil_Left' : 'Pupil_Right'
    pupil.position.set(side * eyeX, eyeY, scleraZ + scleraHalfZ + 0.005)
    group.add(pupil)

    const browArc = Math.PI * 0.7
    const brow = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.014, 8, 16, browArc), mats.hair)
    brow.name = side < 0 ? 'Eyebrow_Left' : 'Eyebrow_Right'
    const archCenter = 0.5 * Math.PI
    brow.rotation.z = archCenter - browArc / 2 + side * faceShape.browTilt * 0.3
    const browWorldY = eyeWorldY + (0.075 + (H - 0.22) * 0.35) * faceShape.browHeight
    brow.position.set(side * eyeX, browWorldY - HEAD_BONE_Y, surfaceZ(bodyShape, side * eyeX, browWorldY) + 0.006)
    group.add(brow)
    eyebrows.push(brow)
  }

  const noseSize = faceShape.noseSize
  const noseGeo = new THREE.SphereGeometry(1, 12, 10)
  noseGeo.scale(0.03 * noseSize, 0.05 * noseSize, 0.03 * noseSize)
  const nose = new THREE.Mesh(noseGeo, mats.skin)
  nose.name = 'Nose'
  const noseWorldY = CRANIUM_CENTER_Y - H * 0.15
  nose.position.set(0, noseWorldY - HEAD_BONE_Y, surfaceZ(bodyShape, 0, noseWorldY) - 0.008 * noseSize)
  group.add(nose)

  const curve = Math.max(-1, Math.min(1, faceShape.mouthCurve))
  const arcLen = (0.35 + 0.65 * Math.abs(curve)) * Math.PI
  const radius = 0.06 * faceShape.mouthWidth
  // Mouth anchors to the NOSE, not to an independent latitude: always 2cm
  // below the nose's bottom edge, so nose and mouth can never overlap.
  // Frowns arch UP by a full radius above the anchor - account for it.
  const noseBottomY = noseWorldY - 0.05 * faceShape.noseSize
  // Smile arcs dip R below the anchor; keep the dip above the chin underside.
  const chinFloor = 1.66 + (curve >= 0 ? radius : 0)
  const mouthWorldY = Math.max(
    chinFloor,
    noseBottomY - 0.02 - (curve < 0 ? radius : 0)
  )
  // Sample the mouth arc directly ON the cranium ellipsoid surface: every
  // point is projected onto the surface (+4mm), so the mouth hugs any head
  // shape regardless of slope or curvature. Smile = lower arc, frown = upper.
  const t0 = curve >= 0 ? 1.5 * Math.PI - arcLen / 2 : 0.5 * Math.PI - arcLen / 2
  const tubeRadius = 0.012
  const mouthPoints: THREE.Vector3[] = []
  const SAMPLES = 16
  for (let i = 0; i <= SAMPLES; i++) {
    const t = t0 + arcLen * (i / SAMPLES)
    const px = radius * Math.cos(t)
    const pyWorld = mouthWorldY + radius * Math.sin(t)
    const pz = surfaceZ(bodyShape, px, pyWorld) + 0.004
    mouthPoints.push(new THREE.Vector3(px, pyWorld - HEAD_BONE_Y, pz))
  }
  const mouthCurve3 = new THREE.CatmullRomCurve3(mouthPoints)
  const mouth = new THREE.Mesh(
    new THREE.TubeGeometry(mouthCurve3, 20, tubeRadius, 8, false),
    mats.mouth
  )
  mouth.name = 'Mouth'
  group.add(mouth)
  for (const end of [mouthPoints[0], mouthPoints[mouthPoints.length - 1]]) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(tubeRadius, 8, 6), mats.mouth)
    cap.name = 'Mouth'
    cap.position.copy(end)
    group.add(cap)
  }

  return { group, eyes, eyebrows, mouth, mouthPoints }
}
