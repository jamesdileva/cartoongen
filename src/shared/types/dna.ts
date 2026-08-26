import type { BodyShape } from './bodyShape'
import type { FaceShape } from './faceShape'

export interface CharacterDNA {
  version: number
  name: string
  slots: Record<string, string | null>
  morphs: Record<string, number>
  colors: Record<string, string>
  bodyShape?: Partial<BodyShape>
  face?: Partial<FaceShape>
  metadata: {
    created: string
    modified: string
  }
}

export const CURRENT_DNA_VERSION = 3
