import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { MaterialManager } from '../three/MaterialManager'

describe('MaterialManager', () => {
  it('returns a MeshStandardMaterial for known material IDs', () => {
    const mgr = new MaterialManager()
    const mat = mgr.getMaterial('skin')
    expect(mat).toBeInstanceOf(THREE.MeshStandardMaterial)
  })

  it('returns the same instance for repeated calls', () => {
    const mgr = new MaterialManager()
    const a = mgr.getMaterial('hair')
    const b = mgr.getMaterial('hair')
    expect(a).toBe(b)
  })

  it('creates material for unknown ID with default color', () => {
    const mgr = new MaterialManager()
    const mat = mgr.getMaterial('unknown_test')
    expect(mat).toBeInstanceOf(THREE.MeshStandardMaterial)
  })

  it('setColor updates the material color', () => {
    const mgr = new MaterialManager()
    const mat = mgr.getMaterial('skin')
    mgr.setColor('skin', '#ff0000')
    expect(mat.color.getHex()).toBe(0xff0000)
  })

  it('setColor is no-op for unregistered material ID', () => {
    const mgr = new MaterialManager()
    expect(() => mgr.setColor('nonexistent', '#ff0000')).not.toThrow()
  })

  it('dispose clears all materials', () => {
    const mgr = new MaterialManager()
    mgr.getMaterial('skin')
    mgr.getMaterial('hair')
    mgr.dispose()
    mgr.getMaterial('skin')
  })
})
