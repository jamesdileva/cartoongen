import type { BodyShape } from './bodyShape'
import type { FaceShape } from './faceShape'

export interface Preset {
  id: string
  name: string
  description: string
  icon: string
  slots?: Record<string, string | null>
  morphs?: Record<string, number>
  colors?: Record<string, string>
  bodyShape?: Partial<BodyShape>
  face?: Partial<FaceShape>
}
