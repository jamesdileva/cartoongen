import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { CharacterDNA } from '../../shared/types/dna'
import type { Preset } from '../../shared/types/preset'
import type { FaceShape } from '../../shared/types/faceShape'
import { createDNA, setSlot, setMorph, setColor, setFace, applyPreset } from '../../shared/dna/mutations'

interface CharacterState {
  past: CharacterDNA[]
  present: CharacterDNA | null
  future: CharacterDNA[]

  canUndo: boolean
  canRedo: boolean
  loading: boolean
  error: string | null
  currentCharacterName: string | null

  newCharacter: (name: string) => void
  loadCharacter: (name: string) => Promise<void>
  saveCharacter: () => Promise<void>

  setSlot: (slotId: string, assetId: string | null) => void
  setMorph: (morphName: string, value: number) => void
  setColor: (materialId: string, hex: string) => void
  setFace: (partial: Partial<FaceShape>) => void

  applyPreset: (preset: Preset) => void
  overwriteDNA: (dna: CharacterDNA) => void

  undo: () => void
  redo: () => void
}

function pushUndo(
  state: CharacterState
): Pick<CharacterState, 'past' | 'present' | 'future' | 'canUndo' | 'canRedo'> {
  if (!state.present) return state

  return {
    past: [...state.past, state.present],
    present: state.present,
    future: [],
    canUndo: true,
    canRedo: false
  }
}

export const useCharacterStore = create<CharacterState>()(
  devtools(
    (set, get) => ({
      past: [],
      present: null,
      future: [],
      canUndo: false,
      canRedo: false,
      loading: false,
      error: null,
      currentCharacterName: null,

      newCharacter: (name) => {
        const dna = createDNA(name)
        set({
          past: [],
          present: dna,
          future: [],
          canUndo: false,
          canRedo: false,
          currentCharacterName: name,
          error: null
        })
      },

      loadCharacter: async (name) => {
        set({ loading: true, error: null })
        const result = await window.electronAPI.character.load(name)
        if (result.ok) {
          set({
            past: [],
            present: result.dna,
            future: [],
            canUndo: false,
            canRedo: false,
            currentCharacterName: name,
            loading: false
          })
        } else {
          set({ error: result.error, loading: false })
        }
      },

      saveCharacter: async () => {
        const { present } = get()
        if (!present) return

        set({ loading: true, error: null })
        const result = await window.electronAPI.character.save(present)
        if (!result.ok) {
          set({ error: result.error, loading: false })
        } else {
          set({ loading: false })
        }
      },

      setSlot: (slotId, assetId) => {
        const { present } = get()
        if (!present) return

        const newDna = setSlot(present, slotId, assetId)
        set({
          ...pushUndo(get()),
          present: newDna
        })
      },

      setMorph: (morphName, value) => {
        const { present } = get()
        if (!present) return

        const newDna = setMorph(present, morphName, value)
        set({
          ...pushUndo(get()),
          present: newDna
        })
      },

      setFace: (partial) => {
        const { present } = get()
        if (!present) return

        const newDna = setFace(present, partial)
        set({
          ...pushUndo(get()),
          present: newDna
        })
      },

      setColor: (materialId, hex) => {
        const { present } = get()
        if (!present) return

        const newDna = setColor(present, materialId, hex)
        set({
          ...pushUndo(get()),
          present: newDna
        })
      },

      applyPreset: (preset) => {
        const { present } = get()
        if (!present) return
        const newDna = applyPreset(present, preset)
        set({
          ...pushUndo(get()),
          present: newDna
        })
      },

      overwriteDNA: (dna) => {
        set({
          ...pushUndo(get()),
          present: dna,
          currentCharacterName: dna.name
        })
      },

      undo: () => {
        const { past, present, future } = get()
        if (past.length === 0 || !present) return

        const previous = past[past.length - 1]
        const newPast = past.slice(0, -1)

        set({
          past: newPast,
          present: previous,
          future: [present, ...future],
          canUndo: newPast.length > 0,
          canRedo: true
        })
      },

      redo: () => {
        const { past, present, future } = get()
        if (future.length === 0 || !present) return

        const next = future[0]
        const newFuture = future.slice(1)

        set({
          past: [...past, present],
          present: next,
          future: newFuture,
          canUndo: true,
          canRedo: newFuture.length > 0
        })
      }
    }),
    { name: 'character-store' }
  )
)
