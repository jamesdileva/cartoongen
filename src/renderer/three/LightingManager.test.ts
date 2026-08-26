import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { getDefaultPresetId, applyLightingPreset } from './LightingManager'
import type { LightingPreset } from './LightingManager'
import presets from '../../shared/data/lighting-presets.json'

describe('getDefaultPresetId', () => {
  it('returns a known preset ID', () => {
    const id = getDefaultPresetId()
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
  })
})

describe('applyLightingPreset', () => {
  it('modifies ambient light intensity', () => {
    const ambient = new THREE.AmbientLight(0xffffff, 0.5)
    const key = new THREE.DirectionalLight()
    const fill = new THREE.DirectionalLight()
    const preset: LightingPreset = {
      id: 'test', name: 'Test', description: '',
      ambient: { intensity: 0.2 },
      key: { position: [1, 2, 3], color: '#ff0000', intensity: 1 },
      fill: { position: [-1, 0, 1], color: '#0000ff', intensity: 0.5 }
    }
    applyLightingPreset(preset, ambient, key, fill)
    expect(ambient.intensity).toBe(0.2)
  })

  it('updates key light position, color, and intensity', () => {
    const ambient = new THREE.AmbientLight(0xffffff, 0.5)
    const key = new THREE.DirectionalLight()
    const fill = new THREE.DirectionalLight()
    const preset: LightingPreset = {
      id: 'test', name: 'Test', description: '',
      ambient: { intensity: 0.3 },
      key: { position: [5, 10, 7], color: '#ff8800', intensity: 2.5 },
      fill: { position: [-5, 0, 5], color: '#8888ff', intensity: 0.5 }
    }
    applyLightingPreset(preset, ambient, key, fill)
    expect(key.position.x).toBe(5)
    expect(key.position.y).toBe(10)
    expect(key.position.z).toBe(7)
    expect(key.intensity).toBe(2.5)
  })

  it('updates fill light position, color, and intensity', () => {
    const ambient = new THREE.AmbientLight(0xffffff, 0.5)
    const key = new THREE.DirectionalLight()
    const fill = new THREE.DirectionalLight()
    const preset: LightingPreset = {
      id: 'test', name: 'Test', description: '',
      ambient: { intensity: 0.4 },
      key: { position: [1, 1, 1], color: '#ffffff', intensity: 1 },
      fill: { position: [-3, 2, -1], color: '#00ff00', intensity: 0.8 }
    }
    applyLightingPreset(preset, ambient, key, fill)
    expect(fill.position.x).toBe(-3)
    expect(fill.position.y).toBe(2)
    expect(fill.position.z).toBe(-1)
    expect(fill.intensity).toBe(0.8)
  })

  it('applies all built-in presets without error', () => {
    const ambient = new THREE.AmbientLight(0xffffff, 0.5)
    const key = new THREE.DirectionalLight()
    const fill = new THREE.DirectionalLight()
    for (const p of presets) {
      expect(() => applyLightingPreset(p, ambient, key, fill)).not.toThrow()
    }
  })
})
