export interface CharacterDNA {
  version: number
  name: string
  slots: Record<string, string | null>
  morphs: Record<string, number>
  colors: Record<string, string>
  metadata: {
    created: string
    modified: string
  }
}

export const CURRENT_DNA_VERSION = 1
