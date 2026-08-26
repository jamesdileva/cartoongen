import { describe, it, expect, beforeEach } from 'vitest'
import { useCharacterStore } from './useCharacterStore'
import { mockElectronAPI, cleanupElectronAPI } from '../tests/test-utils'
import type { Preset } from '../../shared/types/preset'

describe('useCharacterStore', () => {
  beforeEach(() => {
    useCharacterStore.setState({
      past: [],
      present: null,
      future: [],
      canUndo: false,
      canRedo: false,
      loading: false,
      error: null,
      currentCharacterName: null
    })
    mockElectronAPI()
  })

  it('newCharacter creates a valid DNA and clears history', () => {
    useCharacterStore.getState().newCharacter('TestHero')
    const state = useCharacterStore.getState()
    expect(state.present).not.toBeNull()
    expect(state.present!.name).toBe('TestHero')
    expect(state.currentCharacterName).toBe('TestHero')
    expect(state.past).toHaveLength(0)
    expect(state.canUndo).toBe(false)
  })

  it('setSlot updates the slot and enables undo', () => {
    useCharacterStore.getState().newCharacter('Test')
    useCharacterStore.getState().setSlot('hair', 'hair_01')
    const state = useCharacterStore.getState()
    expect(state.present!.slots.hair).toBe('hair_01')
    expect(state.canUndo).toBe(true)
  })

  it('setSlot with null clears the slot', () => {
    useCharacterStore.getState().newCharacter('Test')
    useCharacterStore.getState().setSlot('hair', 'hair_01')
    useCharacterStore.getState().setSlot('hair', null)
    expect(useCharacterStore.getState().present!.slots.hair).toBeNull()
  })

  it('undo reverts the last mutation', () => {
    useCharacterStore.getState().newCharacter('Test')
    useCharacterStore.getState().setSlot('hair', 'hair_01')
    useCharacterStore.getState().setSlot('shirt', 'shirt_01')
    useCharacterStore.getState().undo()
    const state = useCharacterStore.getState()
    expect(state.present!.slots.shirt).toBeUndefined()
    expect(state.canRedo).toBe(true)
  })

  it('redo restores the undone mutation', () => {
    useCharacterStore.getState().newCharacter('Test')
    useCharacterStore.getState().setSlot('hair', 'hair_01')
    useCharacterStore.getState().undo()
    useCharacterStore.getState().redo()
    expect(useCharacterStore.getState().present!.slots.hair).toBe('hair_01')
  })

  it('setMorph updates morph value', () => {
    useCharacterStore.getState().newCharacter('Test')
    useCharacterStore.getState().setMorph('height', 0.5)
    expect(useCharacterStore.getState().present!.morphs.height).toBe(0.5)
  })

  it('setColor updates color value', () => {
    useCharacterStore.getState().newCharacter('Test')
    useCharacterStore.getState().setColor('skin', '#ff0000')
    expect(useCharacterStore.getState().present!.colors.skin).toBe('#ff0000')
  })

  it('applyPreset merges preset onto current DNA', () => {
    useCharacterStore.getState().newCharacter('Test')
    const preset: Preset = {
      id: 'test-preset',
      name: 'Test Preset',
      description: '',
      icon: 'test',
      colors: { skin: '#00ff00' },
      morphs: { height: 0.8 }
    }
    useCharacterStore.getState().applyPreset(preset)
    const state = useCharacterStore.getState()
    expect(state.present!.colors.skin).toBe('#00ff00')
    expect(state.present!.morphs.height).toBe(0.8)
  })

  it('overwriteDNA replaces current DNA', () => {
    useCharacterStore.getState().newCharacter('Test')
    const newDna = {
      version: 1,
      name: 'Replaced',
      slots: { hair: 'hair_99' },
      morphs: {},
      colors: {},
      metadata: { created: '', modified: '' }
    }
    useCharacterStore.getState().overwriteDNA(newDna)
    expect(useCharacterStore.getState().present!.name).toBe('Replaced')
    expect(useCharacterStore.getState().present!.slots.hair).toBe('hair_99')
  })

  it('clears future on new mutation after undo', () => {
    useCharacterStore.getState().newCharacter('Test')
    useCharacterStore.getState().setSlot('hair', 'hair_01')
    useCharacterStore.getState().undo()
    useCharacterStore.getState().setSlot('shirt', 'shirt_01')
    expect(useCharacterStore.getState().future).toHaveLength(0)
  })

  it('canUndo and canRedo reflect correct state', () => {
    useCharacterStore.getState().newCharacter('Test')
    expect(useCharacterStore.getState().canUndo).toBe(false)
    expect(useCharacterStore.getState().canRedo).toBe(false)
    useCharacterStore.getState().setSlot('hair', 'hair_01')
    expect(useCharacterStore.getState().canUndo).toBe(true)
    expect(useCharacterStore.getState().canRedo).toBe(false)
    useCharacterStore.getState().undo()
    expect(useCharacterStore.getState().canUndo).toBe(false)
    expect(useCharacterStore.getState().canRedo).toBe(true)
  })
})
