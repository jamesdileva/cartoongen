import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import type { CharacterDNA } from '../../shared/types/dna'
import type { SlotDefinition } from '../../shared/types/slot'
import type { RuleResult } from '../../shared/types/rule'
import { useCharacterStore } from '../stores/useCharacterStore'
import { useSlotStore } from '../stores/useSlotStore'
import { useRuleStore } from '../stores/useRuleStore'
import { useAssetStore } from '../stores/useAssetStore'
import { MaterialManager } from './MaterialManager'
import { AssetManager } from './AssetManager'
import { SlotManager } from './SlotManager'
import { ProportionManager } from './ProportionManager'
import referenceSkeleton from '../../shared/data/reference-skeleton.json'

const gltfLoader = new GLTFLoader()
const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/')
gltfLoader.setDRACOLoader(dracoLoader)
gltfLoader.setMeshoptDecoder(MeshoptDecoder)

interface BoneDefinition {
  name: string
  position: [number, number, number]
  children?: BoneDefinition[]
}

const SKELETON: BoneDefinition = {
  name: 'Root',
  position: [0, 0.9, 0],
  children: [
    {
      name: 'Spine',
      position: [0, 0.25, 0],
      children: [
        {
          name: 'Spine1',
          position: [0, 0.15, 0],
          children: [
            {
              name: 'Spine2',
              position: [0, 0.15, 0],
              children: [
                {
                  name: 'Neck',
                  position: [0, 0.15, 0],
                  children: [{ name: 'Head', position: [0, 0.15, 0] }]
                },
                {
                  name: 'LeftUpperArm',
                  position: [-0.38, 0.05, 0],
                  children: [
                    {
                      name: 'LeftForearm',
                      position: [-0.3, 0, 0],
                      children: [{ name: 'LeftHand', position: [-0.25, 0, 0] }]
                    }
                  ]
                },
                {
                  name: 'RightUpperArm',
                  position: [0.38, 0.05, 0],
                  children: [
                    {
                      name: 'RightForearm',
                      position: [0.3, 0, 0],
                      children: [{ name: 'RightHand', position: [0.25, 0, 0] }]
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          name: 'LeftUpperLeg',
          position: [-0.18, -0.3, 0],
          children: [{ name: 'LeftFoot', position: [0, -0.4, 0.05] }]
        },
        {
          name: 'RightUpperLeg',
          position: [0.18, -0.3, 0],
          children: [{ name: 'RightFoot', position: [0, -0.4, 0.05] }]
        }
      ]
    }
  ]
}

function buildSkeleton(def: BoneDefinition): THREE.Bone {
  const bone = new THREE.Bone()
  bone.name = def.name
  bone.position.set(def.position[0], def.position[1], def.position[2])
  if (def.children) {
    for (const child of def.children) {
      bone.add(buildSkeleton(child))
    }
  }
  return bone
}

function collectBones(bone: THREE.Bone, map: Map<string, THREE.Bone>): void {
  map.set(bone.name, bone)
  for (const child of bone.children) {
    if (child instanceof THREE.Bone) {
      collectBones(child, map)
    }
  }
}

export class CharacterManager {
  private scene = new THREE.Group()
  private boneMap = new Map<string, THREE.Bone>()
  private materialManager = new MaterialManager()
  private assetManager = new AssetManager(this.materialManager)
  private slotManager = new SlotManager()
  private proportionManager = new ProportionManager()
  private currentDNA: CharacterDNA | null = null
  private currentSlots: SlotDefinition[] = []
  private lastAssetIds: Record<string, string | null> = {}
  private headMesh: THREE.Mesh | null = null
  private proceduralMeshes: THREE.Mesh[] = []
  private baseBodyGroup: THREE.Group | null = null
  private baseBodyMeshes: THREE.Mesh[] = []
  private baseBodyFeatures: { eyebrows: THREE.Mesh[]; eyes: THREE.Mesh[] } = { eyebrows: [], eyes: [] }
  private baseBodySkeletonHelper: THREE.SkeletonHelper | null = null
  private mixer: THREE.AnimationMixer | null = null
  private breathingAction: THREE.AnimationAction | null = null

  private unsubCharacterStore: (() => void) | null = null
  private unsubSlotStore: (() => void) | null = null
  private unsubRuleStore: (() => void) | null = null
  private unsubAssetStore: (() => void) | null = null
  private hasBaseBody = false
  private loadingBaseBody = false
  private pendingDNA: CharacterDNA | null = null
  private processingBodySlot = false
  private skeletonRoot: THREE.Bone | null = null
  private bodyClipPlane: THREE.Plane | null = null

  constructor() {
    this.buildBaseCharacter()
    this.ensureDataLoaded()
    this.subscribe()
    this.checkInitialDNA()
    this.tryLoadBaseBody()
  }

  getSceneGroup(): THREE.Group {
    return this.scene
  }

  getMixer(): THREE.AnimationMixer | null {
    return this.mixer
  }

  getHasBaseBody(): boolean {
    return this.hasBaseBody
  }

  dispose(): void {
    this.mixer?.stopAllAction()
    this.unsubCharacterStore?.()
    this.unsubSlotStore?.()
    this.unsubRuleStore?.()
    this.unsubAssetStore?.()
    this.slotManager.dispose()
    this.assetManager.dispose()
    this.proportionManager.dispose()
    this.materialManager.dispose()

    while (this.scene.children.length > 0) {
      const child = this.scene.children[0]
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
      }
      this.scene.remove(child)
    }
  }

  private buildBaseCharacter(): void {
    const rootBone = buildSkeleton(SKELETON)
    collectBones(rootBone, this.boneMap)

    const helper = new THREE.SkeletonHelper(rootBone)
    helper.visible = false

    this.scene.add(rootBone)
    this.scene.add(helper)

    const bodyGeo = new THREE.CylinderGeometry(0.35, 0.45, 0.65, 12)
    const skinMat = this.materialManager.getMaterial('skin')
    const bodyMesh = new THREE.Mesh(bodyGeo, skinMat)
    bodyMesh.position.set(0, 0.9, 0)
    this.scene.add(bodyMesh)
    this.proceduralMeshes.push(bodyMesh)

    const headGeo = new THREE.SphereGeometry(0.22, 16, 16)
    this.headMesh = new THREE.Mesh(headGeo, skinMat)
    this.headMesh.position.set(0, 1.75, 0)
    this.scene.add(this.headMesh)
    this.proceduralMeshes.push(this.headMesh)

    this.proportionManager.setBoneMap(this.boneMap)
    this.proportionManager.setHeadMesh(this.headMesh)

    const armMat = this.materialManager.getMaterial('skin')
    const limbGeo = (r: number, h: number) => new THREE.CylinderGeometry(r, r, h, 8)

    const leftUpperArm = new THREE.Mesh(limbGeo(0.08, 0.3), armMat)
    leftUpperArm.position.set(-0.38, 1.45, 0)
    leftUpperArm.rotation.z = -0.2
    this.scene.add(leftUpperArm)
    this.proceduralMeshes.push(leftUpperArm)

    const rightUpperArm = new THREE.Mesh(limbGeo(0.08, 0.3), armMat)
    rightUpperArm.position.set(0.38, 1.45, 0)
    rightUpperArm.rotation.z = 0.2
    this.scene.add(rightUpperArm)
    this.proceduralMeshes.push(rightUpperArm)

    const leftForearm = new THREE.Mesh(limbGeo(0.06, 0.28), armMat)
    leftForearm.position.set(-0.72, 1.45, 0)
    leftForearm.rotation.z = -0.05
    this.scene.add(leftForearm)
    this.proceduralMeshes.push(leftForearm)

    const rightForearm = new THREE.Mesh(limbGeo(0.06, 0.28), armMat)
    rightForearm.position.set(0.72, 1.45, 0)
    rightForearm.rotation.z = 0.05
    this.scene.add(rightForearm)
    this.proceduralMeshes.push(rightForearm)

    const leftUpperLeg = new THREE.Mesh(limbGeo(0.12, 0.35), armMat)
    leftUpperLeg.position.set(-0.18, 0.65, 0)
    this.scene.add(leftUpperLeg)
    this.proceduralMeshes.push(leftUpperLeg)

    const rightUpperLeg = new THREE.Mesh(limbGeo(0.12, 0.35), armMat)
    rightUpperLeg.position.set(0.18, 0.65, 0)
    this.scene.add(rightUpperLeg)
    this.proceduralMeshes.push(rightUpperLeg)
  }

  private ensureDataLoaded(): void {
    const slotStore = useSlotStore.getState()
    if (slotStore.slots.length === 0) {
      slotStore.loadSlots()
    }
    const ruleStore = useRuleStore.getState()
    if (ruleStore.rules.length === 0) {
      ruleStore.loadRules()
    }
  }

  private subscribe(): void {
    this.unsubCharacterStore = useCharacterStore.subscribe((state) => {
      if (!state.present) return
      const slotStore = useSlotStore.getState()
      if (slotStore.slots.length === 0) {
        this.pendingDNA = state.present
        return
      }
      this.currentDNA = state.present
      this.updateCharacter(state.present)
    })

    this.unsubSlotStore = useSlotStore.subscribe((state) => {
      this.currentSlots = state.slots
      if (this.pendingDNA && state.slots.length > 0) {
        this.currentDNA = this.pendingDNA
        this.updateCharacter(this.pendingDNA)
        this.pendingDNA = null
      }
    })

    this.unsubRuleStore = useRuleStore.subscribe((state) => {
      this.applyRuleVisibility(state.results)
    })

    this.unsubAssetStore = useAssetStore.subscribe((state) => {
      if (this.hasBaseBody || this.loadingBaseBody) return
      if (state.assets.some((a) => a.tags?.includes('base_body'))) {
        const dna = useCharacterStore.getState().present
        this.tryLoadBaseBody(dna?.slots?.body)
      }
    })
  }

  private checkInitialDNA(): void {
    const dna = useCharacterStore.getState().present
    if (dna) {
      const slotStore = useSlotStore.getState()
      if (slotStore.slots.length > 0) {
        this.currentDNA = dna
        console.log('[Debug] checkInitialDNA: calling updateCharacter (not awaited)')
        this.updateCharacter(dna)
      } else {
        this.pendingDNA = dna
      }
    }
  }

  private async tryLoadBaseBody(dnaAssetId?: string): Promise<void> {
    console.log('[Debug] tryLoadBaseBody start, hasBaseBody=', this.hasBaseBody, 'loadingBaseBody=', this.loadingBaseBody, 'dnaAssetId=', dnaAssetId)
    if (this.hasBaseBody || this.loadingBaseBody) { return }
    this.loadingBaseBody = true
    try {
      const assetStore = useAssetStore.getState()
      let assets = assetStore.assets
      if (assets.length === 0) {
        await assetStore.queryAssets()
        assets = assetStore.assets
      }
      const baseBodyAsset = dnaAssetId
        ? assets.find((a) => a.id === dnaAssetId)
        : assets.find((a) => a.tags?.includes('base_body'))
      if (!baseBodyAsset) { this.loadingBaseBody = false; return }

      const buffer = await window.electronAPI.asset.readFile(baseBodyAsset.id)
      if (!buffer) { this.loadingBaseBody = false; return }

      const gltf = await gltfLoader.parseAsync(buffer, '')

      const skeletonRoot = this.findRootBone(gltf.scene)
      if (!skeletonRoot) { this.loadingBaseBody = false; return }

      console.log('[Debug] tryLoadBaseBody: slotManager has', this.slotManager['slots'].size, 'slots attached')
      this.slotManager.dispose()
      console.log('[Debug] lastAssetIds before clear:', JSON.stringify(this.lastAssetIds))
      const bodyId = this.lastAssetIds['body']
      this.lastAssetIds = {}
      this.lastAssetIds['body'] = bodyId
      console.log('[Debug] clearing procedural body');
      this.clearProceduralBody()

      // Collect ALL bones from the scene (handles any skeleton structure)
      this.boneMap.clear()
      gltf.scene.traverse((child) => {
        if (child instanceof THREE.Bone) {
          this.boneMap.set(child.name, child)
        }
      })

      const helper = new THREE.SkeletonHelper(skeletonRoot)
      helper.visible = false
      this.scene.add(helper)
      this.baseBodySkeletonHelper = helper

      this.scene.add(gltf.scene)
      this.baseBodyGroup = gltf.scene

      const box = new THREE.Box3().setFromObject(gltf.scene)
      if (isFinite(box.min.y)) {
        gltf.scene.position.y -= box.min.y
      }

      this.baseBodyFeatures = { eyebrows: [], eyes: [] }
      gltf.scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          this.baseBodyMeshes.push(child)
          const mats = Array.isArray(child.material) ? child.material : [child.material]
          for (const m of mats) {
            const matName = m?.name?.toLowerCase() ?? ''
            const meshName = child.name.toLowerCase()
            const n = matName || meshName
            if (n.includes('eyebrow')) {
              this.baseBodyFeatures.eyebrows.push(child)
            } else if (n.includes('eye')) {
              this.baseBodyFeatures.eyes.push(child)
            }
          }
          if (Array.isArray(child.material)) {
            child.material = child.material.map((m) => this.remapBaseMaterial(m))
          } else if (child.material) {
            child.material = this.remapBaseMaterial(child.material)
          }
        }
      })

      console.log('[Debug] Base body meshes:')
      for (const mesh of this.baseBodyMeshes) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        for (const m of mats) {
          m.polygonOffset = true
          m.polygonOffsetFactor = 0
          m.polygonOffsetUnits = 10
        }
        const matNames = mats.map((m: THREE.Material) => `${m.name || '(unnamed)'}(po=${m.polygonOffset},f=${m.polygonOffsetFactor},u=${m.polygonOffsetUnits})`).join(', ')
        console.log(`  mesh="${mesh.name}" material="${matNames}" numchildren=${mesh.children.length}`)
      }
      console.log('[Debug] baseBodyFeatures:', {
        eyebrows: this.baseBodyFeatures.eyebrows.length,
        eyes: this.baseBodyFeatures.eyes.length
      })

      this.proportionManager.setBoneMap(this.boneMap)
      this.skeletonRoot = skeletonRoot
      this.hasBaseBody = true
      this.setupBreathing(skeletonRoot)

      this.loadingBaseBody = false
      if (this.currentDNA && dnaAssetId) {
        console.log('[Debug] re-processing slots after base body load, dnaAssetId=', dnaAssetId)
        const currentBodyId = this.lastAssetIds['body']
        this.lastAssetIds = {}
        this.lastAssetIds['body'] = currentBodyId
        this.updateCharacter(this.currentDNA)
      } else if (this.currentDNA && !dnaAssetId) {
        for (const [materialId, hex] of Object.entries(this.currentDNA.colors)) {
          this.materialManager.setColor(materialId, hex)
        }
        this.applyBaseBodyColors(this.currentDNA.colors)
        this.proportionManager.applyProportions(this.currentDNA.morphs)
      }
    } catch (err) {
      console.error('[CharacterManager] tryLoadBaseBody failed:', err)
      this.hasBaseBody = false
    } finally {
      this.loadingBaseBody = false
    }
  }

  private findRootBone(group: THREE.Group): THREE.Bone | null {
    let found: THREE.Bone | null = null
    group.traverse((child) => {
      if (child instanceof THREE.Bone && !found) {
        let parent = child.parent
        let hasBoneParent = false
        while (parent) {
          if (parent instanceof THREE.Bone) { hasBoneParent = true; break }
          parent = parent.parent
        }
        if (!hasBoneParent) found = child
      }
    })
    return found
  }

  private clearProceduralBody(): void {
    const toRemove: THREE.Object3D[] = []
    this.scene.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Bone || child instanceof THREE.SkeletonHelper || child instanceof THREE.LineSegments) {
        toRemove.push(child)
      }
    })
    for (const child of toRemove) {
      if (child instanceof THREE.Mesh) child.geometry.dispose()
      child.removeFromParent()
    }
    this.headMesh = null
    this.proceduralMeshes = []
  }

  private destroyBaseBody(): void {
    this.mixer?.stopAllAction()
    this.mixer = null
    this.breathingAction = null
    this.slotManager.dispose()
    for (const mesh of this.baseBodyMeshes) {
      mesh.geometry.dispose()
    }
    this.baseBodyMeshes = []
    this.baseBodyFeatures = { eyebrows: [], eyes: [] }
    if (this.baseBodyGroup) {
      this.baseBodyGroup.removeFromParent()
      this.baseBodyGroup = null
    }
    if (this.baseBodySkeletonHelper) {
      this.baseBodySkeletonHelper.removeFromParent()
      this.baseBodySkeletonHelper = null
    }
    for (const mesh of this.baseBodyMeshes) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const m of mats) {
        m.clippingPlanes = []
      }
    }
    this.bodyClipPlane = null
    while (this.scene.children.length > 0) {
      this.scene.remove(this.scene.children[0])
    }
    this.hasBaseBody = false
    this.skeletonRoot = null
    this.boneMap.clear()
    this.lastAssetIds = {}
    this.buildBaseCharacter()
  }

  private setProceduralVisible(visible: boolean): void {
    for (const mesh of this.proceduralMeshes) {
      mesh.visible = visible
    }
  }

  private remapBaseMaterial(mat: THREE.Material): THREE.Material {
    const name = mat.name?.toLowerCase() ?? ''
    if (name.includes('skin') || name.includes('superhero')) return this.materialManager.getMaterial('skin')
    if (name.includes('hair') || name.includes('eyebrow') || name.includes('beard')) return this.materialManager.getMaterial('hair')
    if (name.includes('cloth') || name.includes('body') || name.includes('hood') || name.includes('arm') || name.includes('pants') || name.includes('leg') || name.includes('pauldron') || name.includes('cape')) return this.materialManager.getMaterial('cloth')
    if (name.includes('metal') || name.includes('armor')) return this.materialManager.getMaterial('metal')
    if (name.includes('leather') || name.includes('boot') || name.includes('shoe')) return this.materialManager.getMaterial('leather')
    if (name.includes('eye')) return this.materialManager.getMaterial('eye')
    if (name.includes('mouth') || name.includes('lip')) return this.materialManager.getMaterial('mouth')
    return mat
  }

  private setupBreathing(rootBone: THREE.Bone): void {
    this.mixer = new THREE.AnimationMixer(rootBone)
    const spineBone = this.boneMap.get('spine_01')
      ?? this.boneMap.get('Spine')
      ?? this.boneMap.get('spine')
      ?? [...this.boneMap.values()].find(b => b.name.toLowerCase().includes('spine'))
    if (!spineBone) return

    const times = [0, 1.5, 3]
    const values = [1, 1.02, 1]
    const scaleTrack = new THREE.VectorKeyframeTrack(
      `${spineBone.name}.scale[y]`,
      times,
      values
    )

    const clip = new THREE.AnimationClip('idle_breathing', 3, [scaleTrack])
    this.breathingAction = this.mixer.clipAction(clip)
    this.breathingAction.setLoop(THREE.LoopRepeat, Infinity)
    this.breathingAction.play()
  }

  private async updateCharacter(dna: CharacterDNA): Promise<void> {
    const slots = this.currentSlots

    for (const slot of slots) {
      const newAssetId = dna.slots[slot.id] ?? null
      const oldAssetId = this.lastAssetIds[slot.id] ?? null
      console.log(`[Debug] updateCharacter: slot="${slot.id}" new="${(newAssetId ?? 'null').slice(0,8)}" old="${(oldAssetId ?? 'null').slice(0,8)}" hasBaseBody=${this.hasBaseBody} baseBodyGroup=${!!this.baseBodyGroup} boneMapSize=${this.boneMap.size}`)

      if (slot.id === 'body') {
        if (this.processingBodySlot) { continue }
        this.processingBodySlot = true
        try {
          if (newAssetId === null) {
            if (this.hasBaseBody) this.destroyBaseBody()
            this.lastAssetIds['body'] = null
            this.setProceduralVisible(true)
            continue
          }
          if (newAssetId !== oldAssetId) {
            if (this.hasBaseBody) {
              this.destroyBaseBody()
            } else if (oldAssetId !== null) {
              this.slotManager.detachSlot('body')
              this.assetManager.releaseAsset(oldAssetId)
            }
            this.lastAssetIds['body'] = newAssetId
            if (!this.loadingBaseBody) {
              this.tryLoadBaseBody(newAssetId)
            }
          }
        } finally {
          this.processingBodySlot = false
        }
        continue
      }

      if (newAssetId !== oldAssetId) {
        if (slot.id === 'eyebrows') {
          const visible = newAssetId === null
          for (const mesh of this.baseBodyFeatures.eyebrows) { mesh.visible = visible }
        }
        if (slot.id === 'eyes') {
          const visible = newAssetId === null
          for (const mesh of this.baseBodyFeatures.eyes) { mesh.visible = visible }
        }
        if (oldAssetId !== null) {
          this.slotManager.detachSlot(slot.id)
          this.assetManager.releaseAsset(oldAssetId)
        }

        if (newAssetId !== null) {
          const group = await this.assetManager.loadAsset(newAssetId, slot.id)
          let hasSkinnedMeshes = false
          if (this.boneMap.size > 0) {
            group.traverse((child) => {
              if (child instanceof THREE.SkinnedMesh) {
                hasSkinnedMeshes = true
                const skel = child.skeleton
                for (let i = 0; i < skel.bones.length; i++) {
                  const b = skel.bones[i]
                  if (b) {
                    const baseBone = this.findBone(b.name)
                    if (baseBone) skel.bones[i] = baseBone
                  }
                }
                skel.update()
              }
            })
          }
          if (hasSkinnedMeshes && this.baseBodyGroup) {
            this.slotManager.attachSlot(slot.id, group, this.scene)
            this.slotManager.setSlotVisibility(slot.id, true)
          } else {
            const bone = this.findBone(slot.boneAttachment)
            if (bone) {
              this.slotManager.attachSlot(slot.id, group, bone)
              this.slotManager.setSlotVisibility(slot.id, true)
            }
          }
          group.traverse((child) => {
            if (child instanceof THREE.Mesh || child instanceof THREE.SkinnedMesh) {
              child.renderOrder = slot.layer
            }
          })
        }

        this.lastAssetIds[slot.id] = newAssetId
      }
    }

    for (const [materialId, hex] of Object.entries(dna.colors)) {
      this.materialManager.setColor(materialId, hex)
    }

    this.applyBaseBodyColors(dna.colors)
    this.updateBodyVisibility(dna)

    this.proportionManager.applyProportions(dna.morphs)
  }

  private COVERAGE_SLOTS = new Set(['shirt', 'pants', 'shoes', 'gloves', 'helmet'])

  private updateBodyVisibility(dna: CharacterDNA): void {
    if (!this.hasBaseBody || this.baseBodyMeshes.length === 0) return

    const allCovered = [...this.COVERAGE_SLOTS].every((slotId) => dna.slots[slotId] != null)
    const featuresSet = new Set<THREE.Mesh>([...this.baseBodyFeatures.eyebrows, ...this.baseBodyFeatures.eyes])

    if (allCovered) {
      const neckBone = this.boneMap.get('neck_01') ?? this.boneMap.get('Neck')
      if (!neckBone) {
        for (const mesh of this.baseBodyMeshes) {
          if (!featuresSet.has(mesh)) mesh.visible = false
        }
        return
      }
      neckBone.updateWorldMatrix(true, false)
      const neckPos = new THREE.Vector3()
      neckBone.getWorldPosition(neckPos)

      if (!this.bodyClipPlane) {
        this.bodyClipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
      }
      this.bodyClipPlane.constant = -neckPos.y + 0.05

      for (const mesh of this.baseBodyMeshes) {
        if (featuresSet.has(mesh)) continue
        mesh.visible = true
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        for (const m of mats) {
          m.clippingPlanes = [this.bodyClipPlane!]
        }
      }
    } else {
      for (const mesh of this.baseBodyMeshes) {
        if (featuresSet.has(mesh)) continue
        mesh.visible = true
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        for (const m of mats) {
          m.clippingPlanes = []
        }
      }
    }
  }

  private applyBaseBodyColors(colors: Record<string, string>): void {
    if (!this.hasBaseBody || this.baseBodyMeshes.length === 0) return
    for (const mesh of this.baseBodyMeshes) {
      const meshName = mesh.name.toLowerCase()
      let category: string | null = null
      if (meshName.includes('superhero') || meshName.includes('body') || meshName.includes('skin')) category = 'skin'
      else if (meshName.includes('eyebrow')) category = 'hair'
      else if (meshName.includes('eye')) category = 'eye'
      else if (meshName.includes('mouth') || meshName.includes('lip')) category = 'mouth'

      if (category && colors[category]) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        for (const m of mats) {
          m.color.set(colors[category])
        }
      }
    }
  }

  private applyRuleVisibility(results: RuleResult[]): void {
    for (const result of results) {
      if (result.type === 'hide' && result.slotId) {
        this.slotManager.setSlotVisibility(result.slotId, false)
      } else if (result.type === 'show' && result.slotId) {
        this.slotManager.setSlotVisibility(result.slotId, true)
      }
    }
  }

  private findBone(name: string): THREE.Bone | null {
    let bone = this.boneMap.get(name)
    if (bone) return bone

    bone = this.boneMap.get(`Left${name}`)
    if (bone) return bone
    bone = this.boneMap.get(`Right${name}`)
    if (bone) return bone

    if (name === 'Hip') return this.boneMap.get('Root') ?? null

    const ref = referenceSkeleton as { aliases: Record<string, string> }
    for (const [alias, target] of Object.entries(ref.aliases)) {
      if (target === name) {
        bone = this.boneMap.get(alias)
        if (bone) return bone
      }
    }

    return null
  }
}
