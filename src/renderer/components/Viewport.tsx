import { useEffect, useRef, forwardRef, useImperativeHandle, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CharacterManager } from '../three/CharacterManager'
import { applyLightingPreset, getDefaultPresetId } from '../three/LightingManager'
import { useCharacterStore } from '../stores/useCharacterStore'
import { useSlotStore } from '../stores/useSlotStore'
import { useRuleStore } from '../stores/useRuleStore'
import type { LightingPreset } from '../three/LightingManager'
import presetsData from '../../shared/data/lighting-presets.json'

export type CameraPreset = 'front' | 'back' | 'side' | 'face' | 'full'

export interface ViewportHandle {
  setCameraPreset(preset: CameraPreset): void
  getSceneGroup(): THREE.Group | null
  hasBaseBody(): boolean
  setLightingPreset(presetId: string): void
  getLightingPreset(): string
  getBgIndex(): number
  setBgIndex(index: number): void
}

interface ViewportProps {
  onFileDrop?: (buffer: ArrayBuffer, fileName: string) => void
}

const CAMERA_PRESETS: Record<
  CameraPreset,
  { pos: [number, number, number]; target: [number, number, number] }
> = {
  front: { pos: [0, 0.9, 3], target: [0, 0.9, 0] },
  back: { pos: [0, 0.9, -3], target: [0, 0.9, 0] },
  side: { pos: [3, 0.9, 0], target: [0, 0.9, 0] },
  face: { pos: [0, 1.75, 0.7], target: [0, 1.75, 0] },
  full: { pos: [3, 2.5, 4], target: [0, 0.9, 0] }
}

const BG_COLORS = [0x222222, 0x444466, 0x666644, 0xffffff]
const allPresets = presetsData as LightingPreset[]

const Viewport = forwardRef<ViewportHandle, ViewportProps>(({ onFileDrop }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [bgIndex, setBgIndexState] = useState(0)
  const lightingPresetRef = useRef<string>(getDefaultPresetId())
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const ambientRef = useRef<THREE.AmbientLight | null>(null)
  const keyLightRef = useRef<THREE.DirectionalLight | null>(null)
  const fillLightRef = useRef<THREE.DirectionalLight | null>(null)
  const charManagerRef = useRef<CharacterManager | null>(null)

  useImperativeHandle(ref, () => ({
    setCameraPreset(preset: CameraPreset) {
      const cam = cameraRef.current
      const ctrl = controlsRef.current
      if (!cam || !ctrl) return
      const p = CAMERA_PRESETS[preset]
      cam.position.set(p.pos[0], p.pos[1], p.pos[2])
      ctrl.target.set(p.target[0], p.target[1], p.target[2])
      ctrl.update()
    },
    getSceneGroup() {
      return charManagerRef.current?.getSceneGroup() ?? null
    },
    hasBaseBody() {
      return charManagerRef.current?.getHasBaseBody() ?? false
    },
    setLightingPreset(presetId: string) {
      const preset = allPresets.find((p) => p.id === presetId)
      if (!preset) return
      lightingPresetRef.current = presetId
      applyLightingPreset(preset, ambientRef.current!, keyLightRef.current!, fillLightRef.current!)
    },
    getLightingPreset() {
      return lightingPresetRef.current
    },
    getBgIndex() {
      return bgIndex
    },
    setBgIndex(index: number) {
      setBgIndexState(index)
      if (sceneRef.current) {
        sceneRef.current.background = new THREE.Color(BG_COLORS[index] ?? BG_COLORS[0])
      }
    }
  }))

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(BG_COLORS[0])
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    )
    camera.position.set(3, 2.5, 4)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.localClippingEnabled = true
    container.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.target.set(0, 0.9, 0)
    controlsRef.current = controls

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5)
    scene.add(ambientLight)
    ambientRef.current = ambientLight

    const keyLight = new THREE.DirectionalLight(0xffffff, 2)
    keyLight.position.set(5, 10, 7)
    scene.add(keyLight)
    keyLightRef.current = keyLight

    const fillLight = new THREE.DirectionalLight(0x8888ff, 0.5)
    fillLight.position.set(-5, 0, 5)
    scene.add(fillLight)
    fillLightRef.current = fillLight

    const gridHelper = new THREE.GridHelper(6, 12, 0x444444, 0x333333)
    gridHelper.position.y = 0
    scene.add(gridHelper)

    useSlotStore.getState().loadSlots()
    useRuleStore.getState().loadRules()

    if (!useCharacterStore.getState().present) {
      useCharacterStore.getState().newCharacter('Character')
    }

    const characterManager = new CharacterManager()
    charManagerRef.current = characterManager
    scene.add(characterManager.getSceneGroup())

    function resize() {
      const w = container.clientWidth
      const h = container.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }

    const observer = new ResizeObserver(resize)
    observer.observe(container)

    const clock = new THREE.Clock()
    function animate() {
      requestAnimationFrame(animate)
      const delta = clock.getDelta()
      const mixer = characterManager.getMixer()
      if (mixer) mixer.update(delta)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      observer.disconnect()
      controls.dispose()
      characterManager.dispose()
      renderer.dispose()
      ambientRef.current = null
      keyLightRef.current = null
      fillLightRef.current = null
      container.removeChild(renderer.domElement)
      sceneRef.current = null
      cameraRef.current = null
      controlsRef.current = null
      charManagerRef.current = null
    }
  }, [])

  function cycleBg() {
    const next = (bgIndex + 1) % BG_COLORS.length
    setBgIndexState(next)
    if (sceneRef.current) {
      sceneRef.current.background = new THREE.Color(BG_COLORS[next])
    }
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (!file) return
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'))
    if (ext !== '.glb') return
    const buffer = await file.arrayBuffer()
    onFileDrop?.(buffer, file.name)
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
  }

  return (
    <div
      style={{ width: '100%', height: '100%', position: 'relative' }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <div ref={containerRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      <button
        onClick={cycleBg}
        title="Cycle background"
        style={{
          position: 'absolute',
          bottom: 12,
          right: 12,
          padding: '4px 10px',
          borderRadius: 4,
          border: '1px solid #555',
          background: 'rgba(0,0,0,0.5)',
          color: '#ccc',
          fontSize: 11,
          cursor: 'pointer',
          zIndex: 10
        }}
      >
        BG
      </button>
    </div>
  )
})

Viewport.displayName = 'Viewport'
export default Viewport
