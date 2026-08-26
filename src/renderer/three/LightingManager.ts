import * as THREE from 'three'
import type { LightingPreset } from './LightingManager'

export function getDefaultPresetId(): string {
  return 'studio'
}

export function applyLightingPreset(
  preset: LightingPreset,
  ambient: THREE.AmbientLight,
  keyLight: THREE.DirectionalLight,
  fillLight: THREE.DirectionalLight
): void {
  ambient.intensity = preset.ambient.intensity

  keyLight.position.set(preset.key.position[0], preset.key.position[1], preset.key.position[2])
  keyLight.color.set(preset.key.color)
  keyLight.intensity = preset.key.intensity

  fillLight.position.set(preset.fill.position[0], preset.fill.position[1], preset.fill.position[2])
  fillLight.color.set(preset.fill.color)
  fillLight.intensity = preset.fill.intensity
}

export interface LightingPreset {
  id: string
  name: string
  description: string
  ambient: { intensity: number }
  key: { position: [number, number, number]; color: string; intensity: number }
  fill: { position: [number, number, number]; color: string; intensity: number }
}
