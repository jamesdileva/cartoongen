import * as THREE from 'three'
import { buildHead, buildTorso } from '../../src/renderer/three/procedural/BodyParts'
import {
  buildTShirt,
  buildJeans,
  buildShorts,
  buildBaggy,
  buildTights,
  buildBeanie,
  buildCap,
  buildSombrero,
  hatRimY,
  buttRearDepth
} from '../../src/renderer/three/procedural/Garments'
import { DEFAULT_BODY_SHAPE, type BodyShape } from '../../src/shared/types/bodyShape'
import { DEFAULT_FACE_SHAPE, type FaceShape } from '../../src/shared/types/faceShape'

/**
 * For each body vertex in a band, cast a ray outward (radial / +Z / -Z / +X / +Y).
 * Cloth must be hit in front of the vertex (body under the shell).
 * Material MUST be DoubleSide — rays from inside the shell hit back faces,
 * which FrontSide culls, producing mass false pokes.
 * No forward hit = body extends past cloth along that ray = poke.
 */
function countPokes(
  body: THREE.BufferGeometry,
  cloth: THREE.BufferGeometry,
  opts: {
    yMin: number
    yMax: number
    mode: 'radial' | 'front' | 'rear' | 'sideX' | 'up'
    xMin?: number
    xMax?: number
    minRadial?: number
    /** ignore vertices this close to the spine axis (centerline rays are meaningless) */
    minAbsZ?: number
  }
): { pokes: number; samples: number; worstAt: [number, number, number] | null } {
  const ray = new THREE.Raycaster()
  ray.far = 1.0
  const clothMesh = new THREE.Mesh(cloth, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
  clothMesh.updateMatrixWorld(true)
  const bp = body.attributes.position as THREE.BufferAttribute
  let pokes = 0
  let samples = 0
  let worstAt: [number, number, number] | null = null

  for (let i = 0; i < bp.count; i++) {
    const bx = bp.getX(i)
    const by = bp.getY(i)
    const bz = bp.getZ(i)
    if (by < opts.yMin || by > opts.yMax) continue
    if (opts.xMin !== undefined && bx < opts.xMin) continue
    if (opts.xMax !== undefined && bx > opts.xMax) continue
    if (opts.minAbsZ !== undefined && Math.abs(bz) < opts.minAbsZ) continue

    let dir: THREE.Vector3
    if (opts.mode === 'front') dir = new THREE.Vector3(0, 0, 1)
    else if (opts.mode === 'rear') dir = new THREE.Vector3(0, 0, -1)
    else if (opts.mode === 'up') dir = new THREE.Vector3(0, 1, 0)
    else if (opts.mode === 'sideX') {
      if (bx <= 0) continue
      dir = new THREE.Vector3(1, 0, 0)
    } else {
      const r = Math.hypot(bx, bz)
      if (r < 1e-6) continue
      if (opts.minRadial !== undefined && r < opts.minRadial) continue
      dir = new THREE.Vector3(bx / r, 0, bz / r)
    }

    const origin = new THREE.Vector3(bx, by, bz)
    origin.addScaledVector(dir, 1e-4)
    ray.set(origin, dir)
    samples++
    const hits = ray.intersectObject(clothMesh, false)
    if (hits.length === 0) {
      pokes++
      if (!worstAt) worstAt = [bx, by, bz]
    }
    // Forward hit = cloth lies outside the body along this ray → covered.
  }
  return { pokes, samples, worstAt }
}

function report(
  issues: string[],
  label: string,
  r: { pokes: number; samples: number; worstAt: [number, number, number] | null }
): void {
  if (r.pokes > 0) {
    issues.push(
      `${label} ${r.pokes}/${r.samples} at ${r.worstAt?.map((v) => v.toFixed(2)).join(',')}`
    )
  }
}

const shapes: Array<{ name: string; shape: BodyShape }> = [
  { name: 'default', shape: DEFAULT_BODY_SHAPE },
  {
    name: 'wide-fat',
    shape: {
      ...DEFAULT_BODY_SHAPE,
      shoulderWidth: 1.3,
      chestDepth: 1.3,
      hipWidth: 1.3,
      waistTaper: 1.3
    }
  },
  {
    name: 'narrow-slim',
    shape: {
      ...DEFAULT_BODY_SHAPE,
      shoulderWidth: 0.75,
      chestDepth: 0.75,
      hipWidth: 0.75,
      waistTaper: 0.75
    }
  },
  {
    name: 'stocky',
    shape: {
      ...DEFAULT_BODY_SHAPE,
      shoulderWidth: 1.12,
      chestDepth: 1.12,
      hipWidth: 1.08,
      waistTaper: 1.18
    }
  },
  {
    name: 'wide-shoulder-narrow-chest',
    shape: { ...DEFAULT_BODY_SHAPE, shoulderWidth: 1.3, chestDepth: 0.75 }
  }
]

const headShapes: Array<{ name: string; shape: BodyShape }> = [
  { name: 'default', shape: DEFAULT_BODY_SHAPE },
  {
    name: 'big-head',
    shape: { ...DEFAULT_BODY_SHAPE, headWidth: 1.3, headHeight: 1.3, headLength: 1.3 }
  },
  {
    name: 'small-head',
    shape: { ...DEFAULT_BODY_SHAPE, headWidth: 0.75, headHeight: 0.75, headLength: 0.75 }
  },
  {
    name: 'wide-short-head',
    shape: { ...DEFAULT_BODY_SHAPE, headWidth: 1.3, headHeight: 0.75, headLength: 1.3 }
  },
  {
    name: 'tall-head',
    shape: { ...DEFAULT_BODY_SHAPE, headWidth: 0.75, headHeight: 1.3, headLength: 0.75 }
  }
]

const faces: Array<{ name: string; face: FaceShape }> = [
  { name: 'default', face: DEFAULT_FACE_SHAPE },
  { name: 'big-eyes', face: { ...DEFAULT_FACE_SHAPE, eyeScale: 1.3 } },
  { name: 'small-eyes', face: { ...DEFAULT_FACE_SHAPE, eyeScale: 0.7 } }
]

const pantsBuilders = {
  jeans: (shape: BodyShape, butt: number, belly: number) => buildJeans(shape, butt, belly),
  shorts: (shape: BodyShape, butt: number, belly: number) => buildShorts(shape, butt, belly),
  baggy: (shape: BodyShape, butt: number, belly: number) => buildBaggy(shape, butt, belly),
  tights: (shape: BodyShape, butt: number, belly: number) => buildTights(shape, butt, belly)
} as const

const hatBuilders = {
  beanie: (shape: BodyShape, face: FaceShape) => buildBeanie(shape, face),
  cap: (shape: BodyShape, face: FaceShape) => buildCap(shape, face),
  sombrero: (shape: BodyShape, face: FaceShape) => buildSombrero(shape, face)
} as const

let failures = 0

for (const { name, shape } of shapes) {
  for (const bust of [0, 0.5, 1]) {
    for (const butt of [0, 0.5, 1]) {
      for (const belly of [0, 0.5, 1]) {
        const torso = buildTorso(shape, bust, butt, belly).geometry
        const shirt = buildTShirt(shape, bust, belly, butt).geometry
        const issues: string[] = []

        report(
          issues,
          'chest front',
          countPokes(torso, shirt, { yMin: 1.2, yMax: 1.42, mode: 'front', minAbsZ: 0.05 })
        )
        report(
          issues,
          'shirt rear',
          countPokes(torso, shirt, { yMin: 0.9, yMax: 1.08, mode: 'rear', minAbsZ: 0.05 })
        )
        report(
          issues,
          'shirt side',
          countPokes(torso, shirt, { yMin: 0.95, yMax: 1.4, mode: 'sideX' })
        )

        const clavEnd = 0.36 * shape.shoulderWidth
        report(
          issues,
          'deltoid',
          countPokes(torso, shirt, { yMin: 1.36, yMax: 1.56, mode: 'sideX', xMin: clavEnd - 0.1 })
        )

        for (const [pantsName, build] of Object.entries(pantsBuilders)) {
          const pants = build(shape, butt, belly).geometry
          report(
            issues,
            `${pantsName} rear`,
            countPokes(torso, pants, { yMin: 0.82, yMax: 1.04, mode: 'rear', minAbsZ: 0.05 })
          )
          // Shorts have no tubes below mid-thigh: bare legs are by design.
          if (pantsName !== 'shorts') {
            report(
              issues,
              `${pantsName} leg`,
              countPokes(torso, pants, { yMin: 0.18, yMax: 0.86, mode: 'sideX', xMin: 0.12 })
            )
          }
        }

        if (issues.length > 0) {
          failures++
          console.log(`FAIL ${name} bust=${bust} butt=${butt} belly=${belly}: ${issues.join('; ')}`)
        }
      }
    }
  }
}

for (const { name, shape } of headShapes) {
  const head = buildHead(shape).geometry
  for (const { name: faceName, face } of faces) {
    for (const [hatName, build] of Object.entries(hatBuilders)) {
      const hat = build(shape, face).geometry
      const rim = hatRimY(shape, face)
      const issues: string[] = []
      // Cranium above the rim must be under the dome. Ears/jaw/neck sit
      // below the rim (|x| guard exempts ear tips explicitly).
      report(
        issues,
        `${hatName} top`,
        countPokes(head, hat, {
          yMin: rim + 0.005,
          yMax: 2.3,
          mode: 'up',
          xMax: 0.8 * shape.headWidth
        })
      )
      report(
        issues,
        `${hatName} side`,
        countPokes(head, hat, {
          yMin: rim + 0.005,
          yMax: 2.3,
          mode: 'radial',
          xMax: 0.8 * shape.headWidth
        })
      )
      if (issues.length > 0) {
        failures++
        console.log(`FAIL hat ${name}/${faceName}: ${issues.join('; ')}`)
      }
    }
  }
}

// Exact formula check for jeans rear band max
for (const hipWidth of [0.75, 1, 1.3]) {
  for (const butt of [0, 0.5, 1]) {
    const shape = { ...DEFAULT_BODY_SHAPE, hipWidth }
    const need = buttRearDepth(shape, butt)
    const pos = buildJeans(shape, butt).geometry.attributes.position as THREE.BufferAttribute
    let maxRear = 0
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i)
      if (y < 0.8 || y > 1.05) continue
      maxRear = Math.max(maxRear, -pos.getZ(i))
    }
    if (maxRear + 1e-6 < need) {
      failures++
      console.log(
        `FAIL jeans formula hip=${hipWidth} butt=${butt}: cloth=${maxRear.toFixed(4)} need=${need.toFixed(4)}`
      )
    }
  }
}

console.log(failures === 0 ? 'ALL CLEARANCE CHECKS PASSED' : `${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
