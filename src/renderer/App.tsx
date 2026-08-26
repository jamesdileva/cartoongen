import { useRef, useEffect, useCallback, useState } from 'react'
import Viewport, { type ViewportHandle } from './components/Viewport'
import Toolbar from './components/Toolbar'
import LayoutShell from './components/LayoutShell'
import SlotPanel from './components/SlotPanel'
import PropertiesPanel from './components/PropertiesPanel'
import ImportDialog from './components/ImportDialog'
import CharacterList from './components/CharacterList'
import CharacterBrowser from './components/CharacterBrowser'
import ExportDialog from './components/ExportDialog'
import ExportProfileEditor from './components/ExportProfileEditor'
import TemplateDialog from './components/TemplateDialog'
import PresetPanel from './components/PresetPanel'
import LightingDialog from './components/LightingDialog'
import PluginPanel from './components/PluginPanel'
import ToastProvider from './components/ToastProvider'
import { useCharacterStore } from './stores/useCharacterStore'
import { useSlotStore } from './stores/useSlotStore'
import { useAssetStore } from './stores/useAssetStore'
import { useRuleStore } from './stores/useRuleStore'
import { useToastStore } from './stores/useToastStore'
import { useDataStore } from './stores/useDataStore'
import { generateRandomDNA } from './services/RandomGenerator'
import { generateCharacterThumbnail } from './services/CharacterThumbnail'
import type { Template } from '../shared/types/template'
import type { Preset } from '../shared/types/preset'

export default function App() {
  const viewportRef = useRef<ViewportHandle>(null)
  const [showImport, setShowImport] = useState(false)
  const [importData, setImportData] = useState<{ buffer: ArrayBuffer; fileName: string } | null>(null)
  const [showCharacterList, setShowCharacterList] = useState(false)
  const [showCharacterBrowser, setShowCharacterBrowser] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [showExportProfiles, setShowExportProfiles] = useState(false)
  const [showTemplate, setShowTemplate] = useState(false)
  const [showPresets, setShowPresets] = useState(false)
  const [showLighting, setShowLighting] = useState(false)
  const [showPlugins, setShowPlugins] = useState(false)
  const [lightingPreset, setLightingPreset] = useState('studio')
  const [activeSlot, setActiveSlot] = useState('hair')

  const newCharacter = useCharacterStore((s) => s.newCharacter)
  const undo = useCharacterStore((s) => s.undo)
  const redo = useCharacterStore((s) => s.redo)
  const save = useCharacterStore((s) => s.saveCharacter)
  const applyPreset = useCharacterStore((s) => s.applyPreset)
  const overwriteDNA = useCharacterStore((s) => s.overwriteDNA)
  const hasCharacter = useCharacterStore((s) => s.present !== null)
  const setSlot = useCharacterStore((s) => s.setSlot)
  const addToast = useToastStore((s) => s.addToast)

  useEffect(() => {
    useDataStore.getState().loadAll()
  }, [])

  useEffect(() => {
    ;(async () => {
      const state = await window.electronAPI.workspace.load()
      if (state) {
        if (state.bgIndex !== undefined) {
          viewportRef.current?.setBgIndex(state.bgIndex)
        }
        if (state.lastCharacterName) {
          useCharacterStore.getState().loadCharacter(state.lastCharacterName)
        }
      }
    })()
  }, [])

  useEffect(() => {
    const vp = viewportRef.current
    return () => {
      const bg = vp?.getBgIndex() ?? 0
      const name = useCharacterStore.getState().currentCharacterName
      window.electronAPI.workspace.save({ lastCharacterName: name, bgIndex: bg })
    }
  }, [])

  const handleNewCharacter = useCallback(() => {
    setShowTemplate(true)
  }, [])

  const handleTemplateSelect = useCallback(
    (template: Template) => {
      const name = `Character_${Date.now().toString(36)}`
      newCharacter(name)
      const store = useCharacterStore.getState()
      if (store.present) {
        store.applyPreset(template as unknown as Preset)
      }
      setShowTemplate(false)
    },
    [newCharacter]
  )

  const handlePresetApply = useCallback(
    (preset: Preset) => {
      applyPreset(preset)
    },
    [applyPreset]
  )

  const handleRandomize = useCallback(() => {
    const seed = Date.now().toString(36)
    const assets = useAssetStore.getState().assets
    const slots = useSlotStore.getState().slots
    const rules = useRuleStore.getState().rules
    const palettes = useDataStore.getState().palettes

    const currentBody = useCharacterStore.getState().present?.slots?.body ?? null
    const dna = generateRandomDNA({ seed, slots, assets, palettes, rules, bodyAssetId: currentBody })
    dna.slots.body = currentBody
    overwriteDNA(dna)
  }, [overwriteDNA])

  useEffect(() => {
    ;(window as unknown as { __app?: unknown }).__app = {
      randomize: handleRandomize,
      getDNA: () => useCharacterStore.getState().present
    }
    return () => {
      delete (window as unknown as { __app?: unknown }).__app
    }
  }, [handleRandomize])

  const handleFileDrop = useCallback((buffer: ArrayBuffer, fileName: string) => {
    setImportData({ buffer, fileName })
    setShowImport(true)
  }, [])

  const handleImportClose = useCallback(() => {
    setShowImport(false)
    setImportData(null)
    useAssetStore.getState().queryAssets()
  }, [])

  const handleSave = useCallback(async () => {
    save()
    addToast('Character saved', 'success')
    const group = viewportRef.current?.getSceneGroup()
    if (group) {
      try {
        const blob = await generateCharacterThumbnail(group)
        const buf = await blob.arrayBuffer()
        const name = useCharacterStore.getState().currentCharacterName
        if (name) {
          await window.electronAPI.character.saveThumbnail(name, buf)
        }
      } catch {
        // thumbnail non-critical
      }
    }
  }, [save, addToast])

  const handleLightingSelect = useCallback((presetId: string) => {
    setLightingPreset(presetId)
    viewportRef.current?.setLightingPreset(presetId)
  }, [])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const ctrl = e.ctrlKey || e.metaKey

      if (ctrl && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
        return
      }
      if (ctrl && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        redo()
        return
      }
      if (ctrl && e.key === 's') {
        e.preventDefault()
        handleSave()
        return
      }
      if (ctrl && e.key === 'n') {
        e.preventDefault()
        handleNewCharacter()
        return
      }
      if (ctrl && e.key === 'r') {
        e.preventDefault()
        if (hasCharacter) handleRandomize()
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement ||
          e.target instanceof HTMLSelectElement
        )
          return
        e.preventDefault()
        if (activeSlot && activeSlot !== 'none' && hasCharacter) {
          setSlot(activeSlot, null)
        }
        return
      }
      if (e.key >= '1' && e.key <= '6') {
        const presets: Array<Parameters<ViewportHandle['setCameraPreset']>[0]> = [
          'full',
          'front',
          'side',
          'back',
          'face',
          'full'
        ]
        const idx = parseInt(e.key, 10) - 1
        if (idx < presets.length) {
          viewportRef.current?.setCameraPreset(presets[idx])
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    undo,
    redo,
    handleSave,
    handleNewCharacter,
    hasCharacter,
    handleRandomize,
    handleLightingSelect,
    activeSlot,
    setSlot
  ])

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
    >
      <Toolbar
        onNewCharacter={handleNewCharacter}
        onSave={handleSave}
        onLoadCharacter={() => setShowCharacterBrowser(true)}
        onImport={() => setShowImport(true)}
        onExport={() => setShowExport(true)}
        onRandomize={handleRandomize}
        onPresets={() => setShowPresets(true)}
        onLighting={() => setShowLighting(true)}
        onPlugins={() => setShowPlugins(true)}
      />
      <LayoutShell
        leftPanel={<SlotPanel activeSlot={activeSlot} onActiveSlotChange={setActiveSlot} />}
        centerPanel={<Viewport ref={viewportRef} onFileDrop={handleFileDrop} />}
        rightPanel={<PropertiesPanel />}
      />
      {showImport && <ImportDialog onClose={handleImportClose} initialFileData={importData ?? undefined} />}
      {showCharacterList && <CharacterList onClose={() => setShowCharacterList(false)} />}
      {showCharacterBrowser && <CharacterBrowser onClose={() => setShowCharacterBrowser(false)} />}
      {showExport && (
        <ExportDialog
          viewportRef={viewportRef}
          onClose={() => setShowExport(false)}
          onEditProfiles={() => setShowExportProfiles(true)}
        />
      )}
      {showExportProfiles && <ExportProfileEditor onClose={() => setShowExportProfiles(false)} />}
      {showTemplate && (
        <TemplateDialog onSelect={handleTemplateSelect} onClose={() => setShowTemplate(false)} />
      )}
      {showPresets && (
        <PresetPanel onApply={handlePresetApply} onClose={() => setShowPresets(false)} />
      )}
      {showLighting && (
        <LightingDialog
          currentPreset={lightingPreset}
          onSelect={handleLightingSelect}
          onClose={() => setShowLighting(false)}
        />
      )}
      {showPlugins && <PluginPanel onClose={() => setShowPlugins(false)} />}
      <ToastProvider />
    </div>
  )
}
