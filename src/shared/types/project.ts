export interface ProjectManifest {
  name: string
  version: number
  created: string
  modified: string
  favorites?: string[]
  plugins?: Record<string, boolean>
}
