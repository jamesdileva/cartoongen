import * as THREE from 'three'
import {
  buildArm,
  buildHead,
  buildLeg,
  buildTorso
} from '../../src/renderer/three/procedural/BodyParts'
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
  buildPlate,
  buildPlateLegs,
  buildArmet,
  buildSweater,
  buildBeltedTunic,
  buildDress,
  buildLongCoat,
  buildTabard,
  buildKilt,
  buildLeggings,
  buildOveralls,
  buildCape,
  armetExtents,
  buildCropHair,
  buildPonytail,
  buildMohawk,
  buildLongHair,
  buildShoes,
  buildBoots,
  buildGloves,
  buildGauntlets,
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
  tights: (shape: BodyShape, butt: number, belly: number) => buildTights(shape, butt, belly),
  plate_legs: (shape: BodyShape, butt: number, belly: number) => buildPlateLegs(shape, butt, belly),
  kilt: (shape: BodyShape, butt: number, belly: number) => buildKilt(shape, butt, belly),
  leggings: (shape: BodyShape, butt: number, belly: number) => buildLeggings(shape, butt, belly),
  overalls: (shape: BodyShape, butt: number, belly: number) => buildOveralls(shape, butt, belly)
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
  plate: (shape: BodyShape, bust: number, belly: number, butt: number, topLength: number) =>
    buildPlate(shape, bust, belly, butt, topLength),
  mage_robe: (shape: BodyShape, bust: number, belly: number, butt: number, _topLength: number) =>
    buildMageRobe(shape, bust, belly, butt),
  elven_tunic: (shape: BodyShape, bust: number, belly: number, butt: number, topLength: number) =>
    buildElvenTunic(shape, bust, belly, butt, topLength),
  dwarf_vest: (shape: BodyShape, bust: number, belly: number, butt: number, topLength: number) =>
    buildDwarfVest(shape, bust, belly, butt, topLength),
  sweater: (shape: BodyShape, bust: number, belly: number, butt: number, topLength: number) =>
    buildSweater(shape, bust, belly, butt, topLength),
  belted_tunic: (shape: BodyShape, bust: number, belly: number, butt: number, _topLength: number) =>
    buildBeltedTunic(shape, bust, belly, butt),
  dress: (shape: BodyShape, bust: number, belly: number, butt: number, _topLength: number) =>
    buildDress(shape, bust, belly, butt),
  long_coat: (shape: BodyShape, bust: number, belly: number, butt: number, _topLength: number) =>
    buildLongCoat(shape, bust, belly, butt),
  tabard: (shape: BodyShape, bust: number, belly: number, butt: number, _topLength: number) =>
    buildTabard(shape, bust, belly, butt)
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
                  : shirtName === 'tank' || shirtName === 'dress' || shirtName === 'tabard'
                    ? { xMin: -delt, xMax: delt } // bare shoulders by design
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
              shirtName === 'tank' ||
              shirtName === 'vest' ||
              shirtName === 'dwarf_vest' ||
              shirtName === 'dress' ||
              shirtName === 'tabard'
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
            if (
              shirtName === 'longsleeve' ||
              shirtName === 'jacket' ||
              shirtName === 'mage_robe' ||
              shirtName === 'plate' ||
              shirtName === 'sweater' ||
              shirtName === 'long_coat'
            ) {
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
            if (shirtName === 'dress' || shirtName === 'long_coat') {
              // Flared skirt must cover pelvis/butt to its hem.
              report(
                issues,
                `${shirtName} skirt`,
                countPokes(torso, shirt, {
                  yMin: shirtName === 'dress' ? 0.55 : 0.62,
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

          for (const shirtName of [
            'tshirt',
            'longsleeve',
            'jacket',
            'polo',
            'plate',
            'sweater',
            'belted_tunic',
            'long_coat'
            // dress + tabard are sleeveless: deltoids bare by design (like tank)
          ] as const) {
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

          // Cape claims the back panel only: arms/deltoids/side silhouette
          // fall outside the drape by design, so bound x to the back zone.
          const cape = buildCape(shape, bust, belly, butt).geometry
          report(
            issues,
            'cape rear',
            countPokes(torso, cape, {
              yMin: 0.3,
              yMax: 1.5,
              mode: 'rear',
              minAbsZ: 0.05,
              xMin: -0.24,
              xMax: 0.24
            })
          )

          for (const [pantsName, build] of Object.entries(pantsBuilders)) {            const pants = build(shape, butt, belly).geometry
            report(
              issues,
              `${pantsName} rear`,
              countPokes(torso, pants, { yMin: 0.82, yMax: 1.04, mode: 'rear', minAbsZ: 0.05 })
            )
            // Shorts have no tubes below mid-thigh: bare legs are by design.
            // Kilts flare to the knee with pleats: bare legs below by design.
            if (pantsName !== 'shorts' && pantsName !== 'kilt') {
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
              // Fall panel ends at the shoulder blades (hem 1.44): only the
              // draped zone claims back coverage.
              report(
                issues,
                'long_hair fall',
                countPokes(torso, hair, {
                  yMin: 1.44,
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

// Extremities are shape/morph-invariant (no foot/hand params or morphs move
// their shape), so one rest-pose config covers them.
{
  const leg = buildLeg(1).geometry
  const arm = buildArm(1).geometry
  const issues: string[] = []
  for (const [shoeName, build] of Object.entries({
    shoes: () => buildShoes(),
    boots: () => buildBoots()
    // sandals: open footwear by design (sole + straps); unit-tested, not banded
  } as const)) {
    const shoe = build().geometry
    report(
      issues,
      `${shoeName} toe`,
      countPokes(leg, shoe, { yMin: 0.0, yMax: 0.12, mode: 'front' })
    )
    report(
      issues,
      `${shoeName} heel`,
      countPokes(leg, shoe, { yMin: 0.0, yMax: 0.12, mode: 'rear' })
    )
  }
  for (const [gloveName, build] of Object.entries({
    gloves: () => buildGloves(),
    gauntlets: () => buildGauntlets()
    // bracers: bare hands by design; unit-tested, not banded
  } as const)) {
    const glove = build().geometry
    report(
      issues,
      `${gloveName} fingers`,
      countPokes(arm, glove, { yMin: 1.44, yMax: 1.57, mode: 'sideX', xMin: 0.9 })
    )
  }
  if (issues.length > 0) {
    failures++
    console.log(`FAIL extremities: ${issues.join('; ')}`)
  }
}

for (const { name, shape } of headShapes) {
  const head = buildHead(shape).geometry
  for (const { name: faceName, face } of faces) {
    // Analytic containment (no rays): cranium verts in the covered zone
    // must lie strictly inside the hat solid. Raycasts hit exact-edge
    // degeneracies on axis-aligned constructions (crown cap fan radials),
    // while containment has millimeter-tolerant margins everywhere.
    const rim = hatRimY(shape, face)
    const hp = head.attributes.position as THREE.BufferAttribute
    const W = shape.headWidth
    const H = shape.headHeight
    const L = shape.headLength
    // Hat solid per style: [rx, ry, rz, cy] ellipsoid, or cylinder, or wedge.
    const capRy = H * 0.75 + 0.02
    const capCy = rim + 0.0628 * capRy
    const solids: Record<
      string,
      {
        kind: 'ellipsoid' | 'cylinder'
        rx: number
        ry: number
        rz: number
        cy: number
        gap?: number
      }
    > = {
      beanie: { kind: 'ellipsoid', rx: W + 0.02, ry: H + 0.02, rz: L + 0.02, cy: 1.86 },
      cap: { kind: 'ellipsoid', rx: W + 0.015, ry: capRy, rz: L + 0.015, cy: capCy },
      sombrero: { kind: 'ellipsoid', rx: W + 0.015, ry: H * 1.15 + 0.01, rz: L + 0.015, cy: 1.86 },
      tophat: { kind: 'cylinder', rx: W + 0.015, ry: 0.22, rz: W + 0.015, cy: rim + 0.11 },
      hood: { kind: 'ellipsoid', rx: W + 0.03, ry: H + 0.03, rz: L + 0.03, cy: 1.86, gap: 0.85 },
      // Sprint 30 war helms share the armet envelope (tight shells + snout
      // all fit inside it); the great helm is a chunky cylinder instead.
      sallet: { kind: 'ellipsoid', rx: W * 1.5 + 0.035, ry: H * 1.15 + 0.04, rz: L * 1.6 + 0.05, cy: 1.86 },
      great_bascinet: { kind: 'ellipsoid', rx: W * 1.5 + 0.035, ry: H * 1.15 + 0.04, rz: L * 1.6 + 0.05, cy: 1.86 },
      great_helm: { kind: 'cylinder', rx: W + 0.115, ry: 0.3, rz: W + 0.115, cy: rim + 0.18 },
      kettle_hat: { kind: 'cylinder', rx: W + 0.185, ry: 0.2, rz: W + 0.185, cy: rim + 0.15 },
      // Sprint 31: crown (closed cap) + boater + wizard cone all cover the
      // crown. Circlet is open-top adornment: exempt by design (no entry).
      crown: { kind: 'ellipsoid', rx: W + 0.04, ry: H + 0.04, rz: L + 0.04, cy: 1.86 },
      boater: { kind: 'cylinder', rx: W + 0.17, ry: 0.2, rz: W + 0.17, cy: rim + 0.15 },
      wizard_hat: { kind: 'ellipsoid', rx: W + 0.035, ry: H * 1.4 + 0.06, rz: L + 0.035, cy: 1.86 },
      // Armet matches the builder dims: rx from armetExtents, grown to clear
      // the nose ahead of the chin by design (grow only Z here).
      armet: { kind: 'ellipsoid', rx: W * 1.5 + 0.035, ry: H * 1.15 + 0.04, rz: L * 1.6 + 0.05, cy: 1.86 }
    }
    for (const [hatName, solid] of Object.entries(solids)) {
      let pokes = 0
      let samples = 0
      let worstAt: [number, number, number] | null = null
      for (let i = 0; i < hp.count; i++) {
        const bx = hp.getX(i)
        const by = hp.getY(i)
        const bz = hp.getZ(i)
        if (by < rim + 0.005 || by > 2.3) continue
        if (bx > 0.8 * W) continue // ears exempt: hats don't cover ears
        samples++
        let inside: boolean
        if (solid.kind === 'cylinder') {
          inside = Math.hypot(bx, bz - 0.005) < solid.rx && by < solid.cy + 0.11
        } else {
          const nx = bx / solid.rx
          const ny = (by - solid.cy) / solid.ry
          const nz = (bz - 0.005) / solid.rz
          inside = nx * nx + ny * ny + nz * nz < 1.0
          if (!inside && solid.gap !== undefined) {
            // Face wedge: intentionally exposed by design.
            inside = Math.abs(Math.atan2(bx, bz - 0.005)) < solid.gap
          }
        }
        if (!inside) {
          pokes++
          if (!worstAt) worstAt = [bx, by, bz]
        }
      }
      if (samples === 0) {
        failures++
        console.log(`FAIL hat ${name}/${faceName} ${hatName}: empty band (vacuous)`)
      } else if (pokes > 0) {
        failures++
        console.log(
          `FAIL hat ${name}/${faceName} ${hatName} containment ${pokes}/${samples} at ${worstAt?.map((v) => v.toFixed(2)).join(',')}`
        )
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
    crop_hair: { yMin: 1.7, gx: 0.05, gy: 0.015, gz: 0.03, wedge: 0.68 },
    ponytail: { yMin: 1.95, gx: 0.03, gy: 0.015, gz: 0.02, wedge: 0.63 },
    long_hair: { yMin: 1.68, gx: 0.035, gy: 0.015, gz: 0.03, wedge: 0.68 },
    bun_hair: { yMin: 1.7, gx: 0.05, gy: 0.015, gz: 0.03, wedge: 0.68 },
    bob_hair: { yMin: 1.7, gx: 0.055, gy: 0.02, gz: 0.035, wedge: 0.73 },
    pigtails_hair: { yMin: 1.75, gx: 0.045, gy: 0.015, gz: 0.028, wedge: 0.63 }
    // fade_hair: buzz cut leaves ears out by design (mohawk precedent, no entry)
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
      const inWedge = azimuth < shell.wedge
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
