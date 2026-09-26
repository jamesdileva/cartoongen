import * as THREE from 'three'
import { buildArm, buildHead, buildTorso } from '../../src/renderer/three/procedural/BodyParts'
import {
  buildTShirt,
  buildLongsleeve,
  buildTank,
  buildJacket,
  buildVest,
  buildPolo,
  buildMageRobe,
  buildElvenTunic,
  buildDwarfVest,
  buildCropHair,
  buildPonytail,
  buildMohawk,
  buildLongHair,
  buildJeans,
  buildShorts,
  buildBaggy,
  buildTights,
  buildBeanie,
  buildCap,
  buildSombrero,
  hatRimY,
  hemYOf,
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
    mode: 'radial' | 'front' | 'rear' | 'sideX' | 'up' | 'armX'
    xMin?: number
    xMax?: number
    /** ignore vertices with |z| beyond this (side rays that would cross an open front) */
    zMax?: number
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
    if (opts.zMax !== undefined && Math.abs(bz) > opts.zMax) continue
    if (opts.minAbsZ !== undefined && Math.abs(bz) < opts.minAbsZ) continue

    let dir: THREE.Vector3
    if (opts.mode === 'front') dir = new THREE.Vector3(0, 0, 1)
    else if (opts.mode === 'rear') dir = new THREE.Vector3(0, 0, -1)
    else if (opts.mode === 'up') dir = new THREE.Vector3(0, 1, 0)
    else if (opts.mode === 'armX') {
      // Away from the arm axis (line y=1.5, z=0): covers arm tube walls.
      if (bx <= 0) continue
      const ax = new THREE.Vector3(0, by - 1.5, bz)
      if (ax.lengthSq() < 1e-8) continue
      dir = ax.normalize()
    } else if (opts.mode === 'sideX') {
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
    shape: { ...DEFAULT_BODY_SHAPE, headWidth: 0.31, headHeight: 0.28, headLength: 0.32 }
  },
  {
    name: 'small-head',
    shape: { ...DEFAULT_BODY_SHAPE, headWidth: 0.18, headHeight: 0.16, headLength: 0.18 }
  },
  {
    name: 'wide-short-head',
    shape: { ...DEFAULT_BODY_SHAPE, headWidth: 0.31, headHeight: 0.16, headLength: 0.32 }
  },
  {
    name: 'tall-head',
    shape: { ...DEFAULT_BODY_SHAPE, headWidth: 0.18, headHeight: 0.28, headLength: 0.18 }
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

const hairBuilders = {
  crop_hair: (shape: BodyShape, _butt: number, _belly: number) => buildCropHair(shape),
  ponytail: (shape: BodyShape, _butt: number, _belly: number) => buildPonytail(shape),
  mohawk: (shape: BodyShape, _butt: number, _belly: number) => buildMohawk(shape),
  long_hair: (shape: BodyShape, butt: number, belly: number) => buildLongHair(shape, butt, belly)
} as const

const shirtBuilders = {
  tshirt: (shape: BodyShape, bust: number, belly: number, butt: number, topLength: number) =>
    buildTShirt(shape, bust, belly, butt, topLength),
  longsleeve: (shape: BodyShape, bust: number, belly: number, butt: number, topLength: number) =>
    buildLongsleeve(shape, bust, belly, butt, topLength),
  tank: (shape: BodyShape, bust: number, belly: number, butt: number, topLength: number) =>
    buildTank(shape, bust, belly, butt, topLength),
  jacket: (shape: BodyShape, bust: number, belly: number, butt: number, topLength: number) =>
    buildJacket(shape, bust, belly, butt, topLength),
  vest: (shape: BodyShape, bust: number, belly: number, butt: number, topLength: number) =>
    buildVest(shape, bust, belly, butt, topLength),
  polo: (shape: BodyShape, bust: number, belly: number, butt: number, topLength: number) =>
    buildPolo(shape, bust, belly, butt, topLength),
  mage_robe: (shape: BodyShape, bust: number, belly: number, butt: number, _topLength: number) =>
    buildMageRobe(shape, bust, belly, butt),
  elven_tunic: (shape: BodyShape, bust: number, belly: number, butt: number, topLength: number) =>
    buildElvenTunic(shape, bust, belly, butt, topLength),
  dwarf_vest: (shape: BodyShape, bust: number, belly: number, butt: number, topLength: number) =>
    buildDwarfVest(shape, bust, belly, butt, topLength)
} as const

let failures = 0

for (const { name, shape } of shapes) {
  for (const bust of [0, 0.5, 1]) {
    for (const butt of [0, 0.5, 1]) {
      for (const belly of [0, 0.5, 1]) {
        for (const topLength of [0, 1]) {
          const torso = buildTorso(shape, bust, butt, belly).geometry
          const armR = buildArm(1).geometry
          const hemY = hemYOf(topLength)
          const issues: string[] = []
          const aboveHem = (yMin: number): number => Math.max(yMin, hemY)
          // Bare deltoids/arms are by design on sleeveless tops: bound |x|
          // to the shell zone. Open fronts show skin by design: skip wedge.
          const delt = 0.36 * shape.shoulderWidth - 0.08
          const strapX = 0.085 + 0.03 * bust + 0.02

          for (const [shirtName, buildShirt] of Object.entries(shirtBuilders)) {
            const shirt = buildShirt(shape, bust, belly, butt, topLength).geometry
            const openShirt =
              shirtName === 'jacket' || shirtName === 'vest' || shirtName === 'dwarf_vest'
            const bareShirt =
              shirtName === 'tank' || shirtName === 'vest' || shirtName === 'dwarf_vest'
            const chestX =
              shirtName === 'vest' || shirtName === 'dwarf_vest'
                ? { xMin: 0.2, xMax: delt } // +X side only; symmetry covers -X
                : shirtName === 'jacket'
                  ? { xMin: 0.2 }
                  : shirtName === 'tank'
                    ? { xMin: -delt, xMax: delt }
                    : {}
            report(
              issues,
              `${shirtName} chest`,
              countPokes(torso, shirt, {
                yMin: aboveHem(1.2),
                yMax: 1.42,
                mode: 'front',
                minAbsZ: 0.05,
                ...chestX
              })
            )
            report(
              issues,
              `${shirtName} rear`,
              countPokes(torso, shirt, {
                yMin: aboveHem(0.9),
                yMax: 1.08,
                mode: 'rear',
                minAbsZ: 0.05
              })
            )
            // Side rays from front-diagonal verts cross the open wedge
            // (visible torso by design): keep |z| near the true silhouette.
            // Sleeveless tops leave deltoids bare: bound x to the shell.
            const sleevelessSide =
              shirtName === 'tank' || shirtName === 'vest' || shirtName === 'dwarf_vest'
            const openSide =
              shirtName === 'jacket' || shirtName === 'vest' || shirtName === 'dwarf_vest'
            report(
              issues,
              `${shirtName} side`,
              countPokes(torso, shirt, {
                yMin: aboveHem(0.95),
                yMax: sleevelessSide ? 1.36 : 1.4,
                mode: 'sideX',
                ...(sleevelessSide ? { xMax: delt } : {}),
                ...(openSide ? { zMax: 0.12 } : {})
              })
            )
            if (shirtName === 'longsleeve' || shirtName === 'jacket' || shirtName === 'mage_robe') {
              report(
                issues,
                `${shirtName} arm`,
                countPokes(armR, shirt, {
                  yMin: 1.3,
                  yMax: 1.62,
                  mode: 'armX',
                  xMin: 0.5,
                  xMax: 0.9
                })
              )
            }
            if (shirtName === 'mage_robe') {
              // Flared skirt must cover pelvis/butt down past the seat.
              report(
                issues,
                `${shirtName} skirt`,
                countPokes(torso, shirt, {
                  yMin: 0.6,
                  yMax: 0.9,
                  mode: 'rear',
                  minAbsZ: 0.05
                })
              )
            }
            if (shirtName === 'tank') {
              // Centerline under the strap footprint only: tube edges
              // graze. Bare shoulder elsewhere is by design.
              report(
                issues,
                `${shirtName} strap`,
                countPokes(torso, shirt, {
                  yMin: aboveHem(1.36),
                  yMax: 1.52,
                  mode: 'up',
                  xMin: strapX - 0.02,
                  xMax: strapX + 0.02
                })
              )
            }
          }

          for (const shirtName of ['tshirt', 'longsleeve', 'jacket', 'polo'] as const) {
            const shirt = shirtBuilders[shirtName](shape, bust, belly, butt, topLength).geometry
            const clavEnd = 0.36 * shape.shoulderWidth
            report(
              issues,
              `${shirtName} deltoid`,
              countPokes(torso, shirt, {
                yMin: 1.36,
                yMax: 1.56,
                mode: 'sideX',
                xMin: clavEnd - 0.1
              })
            )
          }

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

          // Ponytail tail and long-hair fall must hang outside the back.
          // Only the tube centerline: off-center sightlines pass beside the
          // thin tail by design (nothing needs covering there).
          for (const [hairName, buildHair] of Object.entries(hairBuilders)) {
            const hair = buildHair(shape, butt, belly).geometry
            if (hairName === 'ponytail') {
              report(
                issues,
                'ponytail tail',
                countPokes(torso, hair, {
                  yMin: 1.4,
                  yMax: 1.65,
                  mode: 'rear',
                  xMin: -0.03,
                  xMax: 0.03
                })
              )
            }
            if (hairName === 'long_hair') {
              report(
                issues,
                'long_hair fall',
                countPokes(torso, hair, {
                  yMin: 1.12,
                  yMax: 1.62,
                  mode: 'rear',
                  xMin: -0.12,
                  xMax: 0.12
                })
              )
            }
          }

          if (issues.length > 0) {
            failures++
            console.log(
              `FAIL ${name} bust=${bust} butt=${butt} belly=${belly} len=${topLength}: ${issues.join('; ')}`
            )
          }
        } // topLength
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
  // Hair shells cover the cranium above their lower edge (per-style band).
  // Ears are covered by design (shell rx clears ear tips); jaw/neck below.
  // Hair shell = cranium ellipsoid grown by (gx, gy, gz) with a face wedge
  // (half-angle 0.7) cut around +Z. A cranium vert is covered when it is
  // inside the grown ellipsoid; verts in the wedge azimuth are exposed by
  // design (face opening). Ray checks can't express this (up-rays exit the
  // opening, edge rays graze the rim), so test containment directly.
  const hairShells = {
    crop_hair: { yMin: 1.72, gx: 0.05, gy: 0.015, gz: 0.03 },
    ponytail: { yMin: 1.83, gx: 0.03, gy: 0.015, gz: 0.02 },
    long_hair: { yMin: 1.68, gx: 0.035, gy: 0.015, gz: 0.03 }
  } as const
  for (const [hairName, shell] of Object.entries(hairShells)) {
    const hp = head.attributes.position as THREE.BufferAttribute
    let pokes = 0
    let samples = 0
    let worstAt: [number, number, number] | null = null
    for (let i = 0; i < hp.count; i++) {
      const bx = hp.getX(i)
      const by = hp.getY(i)
      const bz = hp.getZ(i)
      if (by < shell.yMin || by > 2.3) continue
      samples++
      const nx = bx / (shape.headWidth + shell.gx)
      const ny = (by - 1.86) / (shape.headHeight + shell.gy)
      const nz = (bz - 0.005) / (shape.headLength + shell.gz)
      const inside = nx * nx + ny * ny + nz * nz < 1.01
      const azimuth = Math.abs(Math.atan2(bx, bz - 0.005))
      const inWedge = azimuth < 0.7
      if (!inside && !inWedge) {
        pokes++
        if (!worstAt) worstAt = [bx, by, bz]
      }
    }
    if (samples === 0) {
      failures++
      console.log(`FAIL hair ${name} ${hairName}: empty band (vacuous)`)
    } else if (pokes > 0) {
      failures++
      console.log(
        `FAIL hair ${name} ${hairName} containment ${pokes}/${samples} at ${worstAt?.map((v) => v.toFixed(2)).join(',')}`
      )
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
