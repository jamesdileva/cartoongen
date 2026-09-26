import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { makeEllipsoid, makeLathe, makeSweep } from './GeometryKernel'

describe('makeEllipsoid', () => {
  it('scales vertices to the requested radii', () => {
    const geo = makeEllipsoid(0.3, 0.2, 0.1)
    const pos = geo.attributes.position as THREE.BufferAttribute
    let maxX = 0
    let maxY = 0
    let maxZ = 0
    for (let i = 0; i < pos.count; i++) {
      maxX = Math.max(maxX, Math.abs(pos.getX(i)))
      maxY = Math.max(maxY, Math.abs(pos.getY(i)))
      maxZ = Math.max(maxZ, Math.abs(pos.getZ(i)))
    }
    expect(maxX).toBeCloseTo(0.3, 5)
    expect(maxY).toBeCloseTo(0.2, 5)
    expect(maxZ).toBeCloseTo(0.1, 5)
  })

  it('produces indexed geometry with normals', () => {
    const geo = makeEllipsoid(1, 1, 1)
    expect(geo.index).not.toBeNull()
    expect(geo.attributes.normal).toBeDefined()
    expect(geo.attributes.uv).toBeDefined()
  })
})

describe('makeLathe', () => {
  it('revolves a profile into a closed surface', () => {
    const geo = makeLathe(
      [
        [0.2, 1],
        [0.15, 0.8],
        [0.05, 0.6]
      ],
      16
    )
    const pos = geo.attributes.position as THREE.BufferAttribute
    expect(pos.count).toBeGreaterThan(0)
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getZ(i))
      expect(r).toBeGreaterThanOrEqual(-1e-6)
    }
    expect(geo.attributes.normal).toBeDefined()
  })
})

describe('makeSweep', () => {
  it('creates one ring per station with radialSegments verts each', () => {
    const geo = makeSweep(
      [
        { center: [0, 0, 0], width: 0.2, height: 0.2 },
        { center: [0, 0.5, 0], width: 0.15, height: 0.15 }
      ],
      12
    )
    const pos = geo.attributes.position as THREE.BufferAttribute
    expect(pos.count).toBe(24)
  })

  it('adds cap center vertices when capped', () => {
    const open = makeSweep(
      [
        { center: [0, 0, 0], width: 0.2, height: 0.2 },
        { center: [0, 0.5, 0], width: 0.15, height: 0.15 }
      ],
      8
    )
    const capped = makeSweep(
      [
        { center: [0, 0, 0], width: 0.2, height: 0.2 },
        { center: [0, 0.5, 0], width: 0.15, height: 0.15 }
      ],
      8,
      true,
      true
    )
    expect(capped.attributes.position.count).toBe(open.attributes.position.count + 2)
  })

  it('rejects fewer than two stations', () => {
    expect(() => makeSweep([{ center: [0, 0, 0], width: 0.2, height: 0.2 }])).toThrow()
  })

  it('handles horizontal paths without degenerate frames', () => {
    const geo = makeSweep(
      [
        { center: [0, 0, 0], width: 0.1, height: 0.1 },
        { center: [0.5, 0, 0], width: 0.08, height: 0.08 }
      ],
      10
    )
    const pos = geo.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) - Math.max(0, Math.min(0.5, pos.getX(i)))
      const dist = Math.hypot(pos.getY(i), pos.getZ(i))
      void x
      expect(dist).toBeLessThanOrEqual(0.06 + 1e-6)
    }
  })

  it('produces valid index buffer within vertex range', () => {
    const geo = makeSweep(
      [
        { center: [0, 0, 0], width: 0.2, height: 0.2 },
        { center: [0, 0.3, 0], width: 0.2, height: 0.2 },
        { center: [0, 0.6, 0], width: 0.2, height: 0.2 }
      ],
      6,
      true,
      true
    )
    const count = geo.attributes.position.count
    for (const idx of geo.index!.array) {
      expect(idx).toBeLessThan(count)
      expect(idx).toBeGreaterThanOrEqual(0)
    }
  })

  it('partial arcs leave an open front gap without wrapping', () => {
    const gapHalfAngle = Math.PI / 5 // 36 deg half-gap around +Z front (arc angle 90deg)
    const geo = makeSweep(
      [
        { center: [0, 0, 0], width: 0.2, height: 0.2 },
        { center: [0, 0.5, 0], width: 0.2, height: 0.2 }
      ],
      12,
      false,
      false,
      Math.PI / 2 + gapHalfAngle,
      Math.PI * 2 - gapHalfAngle * 2
    )
    const pos = geo.attributes.position as THREE.BufferAttribute
    // Open seam: radialSegments + 1 verts per ring.
    expect(pos.count).toBe(2 * 13)
    // No vertex inside the front wedge (|angle from +Z| < gap).
    // For vertical tangents width maps to X and height to Z.
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      const angFromFront = Math.abs(Math.atan2(x, z))
      expect(angFromFront).toBeGreaterThan(gapHalfAngle - 0.02)
    }
    for (const idx of geo.index!.array) {
      expect(idx).toBeLessThan(pos.count)
      expect(idx).toBeGreaterThanOrEqual(0)
    }
  })

  it('keeps ring winding continuous when tangent z-sign flips (no bowties)', () => {
    // Near-vertical path wiggling in z: station 0 sees tangent.z > 0 while
    // station 1 sees tangent.z < 0, so the raw cross-product side flips 180
    // degrees between rings and quads pinch through the tube (found via
    // long-hair fall probe misses at belly=0).
    const geo = makeSweep(
      [
        { center: [0, 1.5, -0.25], width: 0.3, height: 0.075 },
        { center: [0, 1.3, -0.24], width: 0.3, height: 0.075 },
        { center: [0, 1.12, -0.26], width: 0.3, height: 0.075 }
      ],
      14
    )
    const pos = geo.attributes.position as THREE.BufferAttribute
    // Cross-section midway between the lower two rings must span the full
    // ring width: collect triangle crossings with the y=1.21 plane.
    const crossings: number[] = []
    const idx = geo.index!.array as ArrayLike<number>
    const v = (i: number): [number, number, number] => [pos.getX(i), pos.getY(i), pos.getZ(i)]
    for (let t = 0; t < idx.length; t += 3) {
      const p = [v(idx[t]), v(idx[t + 1]), v(idx[t + 2])]
      const pairs: Array<[[number, number, number], [number, number, number]]> = [
        [p[0], p[1]],
        [p[1], p[2]],
        [p[2], p[0]]
      ]
      for (const [a, b] of pairs) {
        if ((a[1] - 1.21) * (b[1] - 1.21) < 0) {
          const s = (1.21 - a[1]) / (b[1] - a[1])
          crossings.push(a[0] + (b[0] - a[0]) * s)
        }
      }
    }
    expect(crossings.length).toBeGreaterThan(0)
    const span = Math.max(...crossings) - Math.min(...crossings)
    expect(span).toBeGreaterThan(0.2)
  })
})
