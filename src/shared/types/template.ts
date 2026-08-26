import type { BodyShape } from './bodyShape'
import type { FaceShape } from './faceShape'

export interface Template {
  id: string
  name: string
  description: string
  icon: string
  morphs: Record<string, number>
  colors: Record<string, string>
  bodyShape?: Partial<BodyShape>
  face?: Partial<FaceShape>
}
