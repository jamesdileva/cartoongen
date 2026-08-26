import { describe, expect, it } from 'vitest'
import {
  computeSkinBindings,
  pointSegmentDistance,
  type BoneSegment
} from './SkinWeights'

const SEGMENTS: BoneSegment[] = [
  { name: 'Neck', start: [0, 0, 0], end: [0, 1, 0] },
  { name: 'Head', start: [0, 1, 0], end: [0, 2, 0] }
]

describe('pointSegmentDistance', () => {
  it('is zero at the segment midpoint', () => {
    expect(pointSegmentDistance(0, 0.5, 0, SEGMENTS[0])).toBeCloseTo(0, 6)
  })

  it('clamps to segment endpoints', () => {
    expect(pointSegmentDistance(0, -1, 0, SEGMENTS[0])).toBeCloseTo(1, 6)
    expect(pointSegmentDistance(0, 3, 0, SEGMENTS[0])).toBeCloseTo(2, 6)
  })

  it('measures perpendicular distance off the side', () => {
    expect(pointSegmentDistance(2, 0.5, 0, SEGMENTS[0])).toBeCloseTo(2, 6)
  })
})

describe('computeSkinBindings', () => {
  it('gives full weight to the nearest segment', () => {
    const positions = [0, 0.9, 0]
    const b = computeSkinBindings(positions, SEGMENTS)
    const i = b.skinIndices[0]
    expect(b.segmentNames[i]).toBe('Neck')
    expect(b.skinWeights[0]).toBeGreaterThan(0.99)
  })

  it('weights sum to 1 for every vertex', () => {
    const positions = [0, 0.2, 0, 0, 1.5, 0.1, 0.3, 1.05, -0.2]
    const b = computeSkinBindings(positions, SEGMENTS)
    for (let v = 0; v < 3; v++) {
      let sum = 0
      for (let k = 0; k < 4; k++) sum += b.skinWeights[v * 4 + k]
      expect(sum).toBeCloseTo(1, 5)
    }
  })

  it('blends smoothly near the joint between segments', () => {
    const top = computeSkinBindings([0, 0.85, 0], SEGMENTS)
    const bottom = computeSkinBindings([0, 1.15, 0], SEGMENTS)
    const neckWeightTop = top.skinWeights[top.skinIndices.indexOf(SEGMENTS.indexOf(SEGMENTS[0]))]
    const headWeightBottom =
      bottom.skinWeights[bottom.skinIndices.indexOf(SEGMENTS.indexOf(SEGMENTS[1]))]
    expect(neckWeightTop).toBeGreaterThan(0.5)
    expect(headWeightBottom).toBeGreaterThan(0.5)
    expect(neckWeightTop).toBeLessThan(1)
    expect(headWeightBottom).toBeLessThan(1)
  })

  it('handles vertex exactly on a bone (zero distance)', () => {
    const b = computeSkinBindings([0, 1.75, 0], SEGMENTS)
    let sum = 0
    for (let k = 0; k < 4; k++) sum += b.skinWeights[k]
    expect(sum).toBeCloseTo(1, 5)
    expect(Number.isNaN(sum)).toBe(false)
  })

  it('caps influences at four and pads with zeros', () => {
    const many: BoneSegment[] = []
    for (let i = 0; i < 8; i++) {
      many.push({ name: `S${i}`, start: [i * 2, 0, 0], end: [i * 2 + 1, 0, 0] })
    }
    const b = computeSkinBindings([7, 0, 0], many)
    let nonzero = 0
    for (let k = 0; k < 4; k++) if (b.skinWeights[k] > 0) nonzero++
    expect(nonzero).toBe(4)
    let sum = 0
    for (let k = 0; k < 4; k++) sum += b.skinWeights[k]
    expect(sum).toBeCloseTo(1, 5)
  })

  it('higher sharpness concentrates weight on nearest segment', () => {
    const p = [0.3, 1.6, 0]
    const soft = computeSkinBindings(p, SEGMENTS, 1)
    const sharp = computeSkinBindings(p, SEGMENTS, 4)
    const headIdx = SEGMENTS.indexOf(SEGMENTS[1])
    const softHead = soft.skinWeights[soft.skinIndices.indexOf(headIdx)] ?? 0
    const sharpHead = sharp.skinWeights[sharp.skinIndices.indexOf(headIdx)] ?? 0
    expect(sharpHead).toBeGreaterThanOrEqual(softHead)
  })

  it('throws with no segments', () => {
    expect(() => computeSkinBindings([0, 0, 0], [])).toThrow()
  })

  it('works with a single segment', () => {
    const b = computeSkinBindings([1, 0.5, 1], [SEGMENTS[0]])
    expect(b.skinWeights[0]).toBeCloseTo(1, 5)
    expect(b.segmentNames[b.skinIndices[0]]).toBe('Neck')
  })
})
