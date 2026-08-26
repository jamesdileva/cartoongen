import type { BodyShape } from './bodyShape'

export interface CharacterDNA {
  version: number
  name: string
  slots: Record<string, string | null>
  morphs: Record<string, number>
  colors: Record<string, string>
  bodyShape?: Partial<BodyShape>
  metadata: {
    created: string
    modified: string
  }
}

export const CURRENT_DNA_VERSION = 2
