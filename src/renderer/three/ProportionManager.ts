import * as THREE from 'three'
import referenceSkeleton from '../../shared/data/reference-skeleton.json'

interface BoneScaleDef {
  bone: string
  axis: 'x' | 'y' | 'z'
  range: [number, number]
  mirror?: string
  mirrorAlias?: string
  alias?: string
  mirrorAxis?: 'x' | 'y' | 'z'
}

interface MultiBoneScaleDef {
  bones: string[]
  axis: 'x' | 'y' | 'z'
  range: [number, number]
}

type ProportionDef = BoneScaleDef | MultiBoneScaleDef

export const PROPORTION_MORPHS: Array<{ name: string; label: string }> = [
  { name: 'height', label: 'Height' },
  { name: 'shoulderWidth', label: 'Shoulder Width' },
  { name: 'neckWidth', label: 'Neck Width' },
  { name: 'bellySize', label: 'Belly' },
  { name: 'headSize', label: 'Head Size' },
  { name: 'legLength', label: 'Leg Length' },
  { name: 'armLength', label: 'Arm Length' },
  { name: 'muscleMass', label: 'Muscle Mass' }
]

const ref = referenceSkeleton as { aliases: Record<string, string> }

const BONE_MORPHS: Record<string, ProportionDef> = {
  height: {
    bones: [
      'spine_01', 'spine_02', 'spine_03',
      'neck_01',
      'thigh_l', 'thigh_r',
      'calf_l', 'calf_r'
    ],
    axis: 'y',
    range: [0.85, 1.15]
  },
  shoulderWidth: { bone: 'clavicle_l', axis: 'x', range: [0.5, 1.8], mirror: 'clavicle_r' },
  neckWidth: { bone: 'neck_01', axis: 'x', range: [0.6, 1.4] },
  bellySize: { bone: 'spine_02', axis: 'x', range: [0.7, 1.5] },
  headSize: { bone: 'Head', axis: 'y', range: [0.8, 1.3] },
  legLength: { bone: 'thigh_l', axis: 'y', range: [0.7, 1.3], mirror: 'thigh_r' },
  armLength: { bone: 'lowerarm_l', axis: 'y', range: [0.8, 1.3], mirror: 'lowerarm_r' },
  muscleMass: {
    bones: [
      'upperarm_l',
      'upperarm_r',
      'lowerarm_l',
      'lowerarm_r',
      'thigh_l',
      'thigh_r'
    ],
    axis: 'x',
    range: [0.8, 1.3]
  }
}

function remap01(value: number, range: [number, number]): number {
  return range[0] + value * (range[1] - range[0])
}

export class ProportionManager {
  private boneMap: Map<string, THREE.Bone> | null = null
  private headMesh: THREE.Mesh | null = null

  setBoneMap(map: Map<string, THREE.Bone> | null): void {
    this.boneMap = map
  }

  setHeadMesh(mesh: THREE.Mesh | null): void {
    this.headMesh = mesh
  }

  applyProportions(morphValues: Record<string, number>): void {
    for (const [name, value] of Object.entries(morphValues)) {
      const def = BONE_MORPHS[name]
      if (def) {
        this.applyBoneScale(def, value)
        continue
      }
      this.applyMeshMorph(name, value)
    }
  }

  private resolveBone(name: string): THREE.Bone | null {
    if (!this.boneMap) return null
    let bone = this.boneMap.get(name)
    if (bone) return bone
    for (const [alias, target] of Object.entries(ref.aliases)) {
      if (alias === name || target === name) {
        bone = this.boneMap.get(alias) ?? this.boneMap.get(target)
        if (bone) return bone
      }
    }
    const lower = name.toLowerCase()
    for (const [k, v] of this.boneMap) {
      if (k.toLowerCase() === lower) return v
    }
    return null
  }

  private applyBoneScale(def: ProportionDef, value: number): void {
    if (!this.boneMap) return
    const scale = remap01(value, 'range' in def ? def.range : [0.5, 1.5])

    if ('bones' in def) {
      for (const name of def.bones) {
        const bone = this.boneMap.get(name) ?? this.resolveBone(name)
        if (bone) {
          applyAxisScale(bone, def.axis, scale)
        }
      }
    } else {
      const bone = this.boneMap.get(def.bone) ?? this.resolveBone(def.bone)
      if (bone) {
        applyAxisScale(bone, def.axis, scale)
      }
      if (def.mirror) {
        const mirrorBone = this.boneMap.get(def.mirror) ?? this.resolveBone(def.mirror)
        if (mirrorBone) {
          applyAxisScale(mirrorBone, def.axis, scale)
        }
      }
    }
  }

  private applyMeshMorph(name: string, value: number): void {
    if (!this.headMesh || !this.headMesh.morphAttributes) return
    const influences = this.headMesh.morphTargetInfluences
    if (!influences) return

    const index = this.headMesh.morphTargetDictionary?.[name]
    if (index !== undefined && index < influences.length) {
      influences[index] = value
    }
  }

  dispose(): void {
    this.boneMap = null
    this.headMesh = null
  }
}

function applyAxisScale(bone: THREE.Bone, axis: 'x' | 'y' | 'z', scale: number): void {
  if (axis === 'x') bone.scale.x = scale
  else if (axis === 'y') bone.scale.y = scale
  else bone.scale.z = scale
}
