// Rest-pose visibility check via RAYCAST (triangle-accurate, no band sampling).
// For each mouth centerline point: ray from +Z hits the skull -> hit z.
// Mouth visible if tube front (center + radius along +Z approx) clears the hit.
// Usage: npx tsx scripts/debug/rest-check.mts <dna.json> [...]
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { buildHead } from '../../src/renderer/three/procedural/BodyParts'
import { buildFace } from '../../src/renderer/three/procedural/FaceFeatures'
import { sanitizeBodyShape } from '../../src/shared/types/bodyShape'
import { sanitizeFaceShape } from '../../src/shared/types/faceShape'
import { MaterialManager } from '../../src/renderer/three/MaterialManager'

interface DnaFile {
  bodyShape?: unknown
  face?: unknown
  morphs?: Record<string, number>
  name?: string
}

const TUBE_R = 0.012

function check(file: string): boolean {
  const dna = JSON.parse(readFileSync(file, 'utf8')) as DnaFile
  const shape = sanitizeBodyShape(dna.bodyShape)
  const faceShape = sanitizeFaceShape(dna.face)
  const mats = new MaterialManager()

  const head = new THREE.Mesh(buildHead(shape, dna.morphs?.neckWidth ?? 0.5).geometry)
  head.updateMatrixWorld(true)

  const face = buildFace(shape, faceShape, {
    skin: mats.getMaterial('skin'),
    hair: mats.getMaterial('hair'),
    eye: mats.getMaterial('eye'),
    mouth: mats.getMaterial('mouth')
  })

  const ray = new THREE.Raycaster()
  ray.far = 20

  let minClear = 1e9
  let best: unknown = null
  let misses = 0
  for (const p of face.mouthPoints) {
    // mouthPoints are in group space: world = p + (0, HEAD_BONE_Y, 0)
    const wx = p.x
    const wy = p.y + 1.75
    const wz = p.z
    ray.set(new THREE.Vector3(wx, wy, 10), new THREE.Vector3(0, 0, -1))
    const hits = ray.intersectObject(head, false)
    if (hits.length === 0) {
      misses++
      continue // ray missed all triangles (gap in tessellation / off-mesh) — not buried
    }
    const hitZ = hits[0].point.z
    // centerline clearance vs surface; tube front adds TUBE_R along roughly +Z
    const clear = wz - hitZ
    if (clear < minClear) {
      minClear = clear
      best = { p: [+wx.toFixed(3), +wy.toFixed(3), +wz.toFixed(3)], hitZ: +hitZ.toFixed(4) }
    }
  }

  // Buried = centerline itself is behind the skull surface everywhere visible.
  // Tube radius 12mm: centerline can sit up to ~12mm behind and still poke out.
  // Conservative visible criterion: best centerline clearance > -8mm
  // (front of tube = center + ~12mm * normal_z  >= surface + 4mm typical)
  let maxClear = -1e9
  for (const p of face.mouthPoints) {
    const wx = p.x, wy = p.y + 1.75, wz = p.z
    ray.set(new THREE.Vector3(wx, wy, 10), new THREE.Vector3(0, 0, -1))
    const hits = ray.intersectObject(head, false)
    if (hits.length === 0) continue
    const clear = wz - hits[0].point.z
    if (clear > maxClear) maxClear = clear
  }

  // Visible if ANY centerline point clears by > -4mm (front face of tube solidly out)
  // or if the AVERAGE is above -8mm AND max > 0.
  const ok = maxClear > -0.004 || (maxClear > -0.008 && minClear > -0.012)
  console.log(
    `${ok ? 'OK  ' : 'BURIED'} ${(dna.name ?? file).padEnd(18)} ` +
      `maxClear=${maxClear.toFixed(4)} minClear=${minClear.toFixed(4)} misses=${misses} ${JSON.stringify(best)}`
  )
  return ok
}

let fails = 0
for (const f of process.argv.slice(2)) {
  if (!check(f)) fails++
}
console.log(fails === 0 ? '\nall visible' : `\n${fails} buried`)
process.exit(fails ? 1 : 0)
