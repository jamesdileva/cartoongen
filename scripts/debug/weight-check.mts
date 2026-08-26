import * as T from 'three'
import { buildHeadGeometry } from '../../src/renderer/three/procedural/BodyParts.ts'

const geo = buildHeadGeometry()
const pos = geo.attributes.position
const samples = [
  { name: 'skull top', y: 2.05 },
  { name: 'eye level', y: 1.886 },
  { name: 'nose level', y: 1.827 },
  { name: 'mouth level', y: 1.754 },
  { name: 'jaw', y: 1.68 }
]

const NECK: [number, number] = [1.55, 1.75]
const HEAD: [number, number] = [1.75, 2.08]
const SHARP = 2

function distToSeg(px: number, py: number, pz: number, y0: number, y1: number): number {
  let t = (py - y0) / (y1 - y0)
  t = Math.max(0, Math.min(1, t))
  const cy = y0 + (y1 - y0) * t
  return Math.sqrt(px * px + (py - cy) * (py - cy) + pz * pz)
}

for (const s of samples) {
  let best = null
  let bestD = 1e9
  for (let i = 0; i < pos.count; i++) {
    const d = Math.abs(pos.getY(i) - s.y) + Math.abs(pos.getX(i)) * 0.5
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  const px = pos.getX(best)
  const py = pos.getY(best)
  const pz = pos.getZ(best)
  const dNeck = distToSeg(px, py, pz, NECK[0], NECK[1])
  const dHead = distToSeg(px, py, pz, HEAD[0], HEAD[1])
  const wHeadRaw = 1 / (Math.pow(dHead, SHARP) + 1e-6)
  const wNeckRaw = 1 / (Math.pow(dNeck, SHARP) + 1e-6)
  const wHead = wHeadRaw / (wHeadRaw + wNeckRaw)
  console.log(
    s.name.padEnd(12),
    `vert(${px.toFixed(2)},${py.toFixed(2)},${pz.toFixed(2)})`,
    `Head weight: ${(wHead * 100).toFixed(1)}%`,
    wHead > 0.95 ? 'OK' : '<<< DRIFT RISK'
  )
}
