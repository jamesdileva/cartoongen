import type { BodyShape } from './bodyShape'

export interface Preset {
  id: string
  name: string
  description: string
  icon: string
  slots?: Record<string, string | null>
  morphs?: Record<string, number>
  colors?: Record<string, string>
  bodyShape?: Partial<BodyShape>
}
