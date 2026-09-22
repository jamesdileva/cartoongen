import { readFileSync } from 'node:fs'
import { buildHead } from '../../src/renderer/three/procedural/BodyParts.ts'
import { sanitizeBodyShape } from '../../src/shared/types/bodyShape.ts'

const live = JSON.parse(readFileSync('scripts/debug/live-skull.json', 'utf-8'))[0].points as number[][]
const dna = JSON.parse(readFileSync('scripts/debug/nomouth4.dna.json', 'utf-8'))
const shape = sanitizeBodyShape(dna.bodyShape)
const neckWidth = Math.max(0, Math.min(1, dna.morphs?.neckWidth ?? 0.5))
console.log('neckWidth used:', neckWidth)

const { geometry } = buildHead(shape, neckWidth)
const pos = geometry.attributes.position
const fresh: number[][] = []
for (let i = 0; i < pos.count; i++) fresh.push([pos.getX(i), pos.getY(i), pos.getZ(i)])

console.log('live verts:', live.length, 'fresh verts:', fresh.length)

const key = (p: number[]) => `${p[0].toFixed(4)}|${p[1].toFixed(4)}|${p[2].toFixed(4)}`
const sl = [...live].sort((a, b) => (key(a) < key(b) ? -1 : 1))
const sf = [...fresh].sort((a, b) => (key(a) < key(b) ? -1 : 1))
let maxPair = 0
let worstPair = null
for (let i = 0; i < sl.length; i++) {
  const dx = sl[i][0] - sf[i][0], dy = sl[i][1] - sf[i][1], dz = sl[i][2] - sf[i][2]
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
  if (d > maxPair) { maxPair = d; worstPair = [sl[i], sf[i]] }
}
console.log('max sorted-pair deviation:', maxPair.toFixed(5), JSON.stringify(worstPair))
