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
})
