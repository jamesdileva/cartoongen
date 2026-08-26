import { generateRandomDNA } from '../../src/renderer/services/RandomGenerator.ts'
import { DEFAULT_BODY_SHAPE } from '../../src/shared/types/bodyShape.ts'

const testSlots: any[] = []
const testAssets: any[] = []
const palettes: any = {}
const rules: any[] = []

let squirrels = 0
let sunkenHeads = 0
let worstDeltoid = 0
const N = 2000

for (let i = 0; i < N; i++) {
  const dna = generateRandomDNA({ seed: 'seed-' + i, slots: testSlots, assets: testAssets, palettes, rules })
  const shape = { ...DEFAULT_BODY_SHAPE, ...dna.bodyShape }
  const m = dna.morphs

  // Deltoid world x: built at clavEnd=0.36*shape.shoulderWidth, then clavicle x-scale morph
  const clavEnd = 0.36 * shape.shoulderWidth
  const deltoidX = ((clavEnd + 0.005) - 0.1) * remap(m.shoulderWidth, 0.8, 1.35) + 0.1
  const armInnerStart = 0.36 * shape.shoulderWidth // arm sweep starts here
  worstDeltoid = Math.max(worstDeltoid, deltoidX)

  // Squirrel: deltoids pushed far past where the arms actually are
  const isSquirrel = deltoidX > 0.72
  if (isSquirrel) squirrels++

  // Sunken head: big headSize morph + short height morph
  const headScale = remap(m.headSize, 0.82, 1.22)
  const spineSquash = remap(m.height, 0.88, 1.12)
  const headBottomDrop = (1.75 - (1.63 - DEFAULT_BODY_SHAPE.jawChin * 0)) * headScale * spineSquash
  if (headScale > 1.14 && spineSquash < 0.92) sunkenHeads++
}

function remap(v: number, a: number, b: number): number {
  return a + v * (b - a)
}

console.log(`seeds: ${N}`)
console.log(`squirrel configs (deltoid x > 0.72): ${squirrels} (${((squirrels / N) * 100).toFixed(1)}%)`)
console.log(`worst deltoid x: ${worstDeltoid.toFixed(3)} (arm hand tip is at ~1.04, arm sweep starts ~${(0.36).toFixed(2)})`)
console.log(`sunken-head combos (head>1.18 + short): ${sunkenHeads} (${((sunkenHeads / N) * 100).toFixed(1)}%)`)
