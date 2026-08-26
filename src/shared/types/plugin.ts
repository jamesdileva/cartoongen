export interface PluginManifest {
  id: string
  name: string
  version: string
  author: string
  description: string
  minAppVersion: string
}

export interface PluginState {
  id: string
  name: string
  version: string
  author: string
  description: string
  enabled: boolean
  status: 'loaded' | 'error' | 'incompatible'
  error?: string
  dir: string
}

export interface PluginValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}
