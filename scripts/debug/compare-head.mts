// Compare live skull rest verts vs fresh buildHead for the same DNA shape.
import * as T from 'three'
import { buildHead } from '../../src/renderer/three/procedural/BodyParts.ts'
import { sanitizeBodyShape } from '../../src/shared/types/bodyShape.ts'
import { readFileSync } from 'node:fs'

const dna = JSON.parse(readFileSync('scripts/debug/nomouth4.dna.json', 'utf-8'))
const shape = sanitizeBodyShape(dna.bodyShape)
console.log('sanitized shape:', JSON.stringify(shape))

const { geometry } = buildHead(shape)
const pos = geometry.attributes.position
const fresh = []
for (let i = 0; i < pos.count; i++) {
  const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
  if (y > 1.62 && y < 1.78 && Math.abs(x) < 0.08) fresh.push([+x.toFixed(3), +y.toFixed(3), +z.toFixed(3)])
}
fresh.sort((a, b) => b[2] - a[2])
console.log('fresh buildHead verts in band (top 6 by z):')
for (const v of fresh.slice(0, 6)) console.log(' ', v)
console.log('fresh max z in band:', fresh[0]?.[2])

// raw dna bodyShape (pre-sanitize)
console.log('raw dna bodyShape:', JSON.stringify(dna.bodyShape))
