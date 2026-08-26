import * as THREE from 'three'
import referenceSkeleton from '../../shared/data/reference-skeleton.json'

interface BoneScaleDef {
  bone: string
  axis: 'x' | 'y' | 'z' | 'xz'
  range: [number, number]
  mirror?: string
  mirrorAlias?: string
  alias?: string
  mirrorAxis?: 'x' | 'y' | 'z'
}

interface MultiBoneScaleDef {
  bones: string[]
  axis: 'x' | 'y' | 'z' | 'xz'
  range: [number, number]
  /** Bones form a kinematic chain: divide the target factor across them so the compound product equals the factor. */
  chained?: boolean
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
  { name: 'muscleMass', label: 'Muscle Mass' },
  { name: 'bust', label: 'Bust' },
  { name: 'butt', label: 'Butt' }
]

const ref = referenceSkeleton as { aliases: Record<string, string> }

const BONE_MORPHS: Record<string, ProportionDef[]> = {
  height: [
    {
      bones: ['spine_01', 'spine_02', 'spine_03', 'neck_01'],
      axis: 'y',
      range: [0.88, 1.12],
      chained: true
    },
    {
      bones: ['thigh_l', 'calf_l'],
      axis: 'y',
      range: [0.88, 1.12],
      chained: true
    },
    {
      bones: ['thigh_r', 'calf_r'],
      axis: 'y',
      range: [0.88, 1.12],
      chained: true
    }
  ],
  shoulderWidth: [{ bone: 'clavicle_l', axis: 'x', range: [0.8, 1.35], mirror: 'clavicle_r' }],
  headSize: [{ bone: 'Head', axis: 'y', range: [0.82, 1.22] }],
  legLength: [
    {
      bones: ['thigh_l', 'calf_l'],
      axis: 'y',
      range: [0.75, 1.25],
      chained: true
    },
    {
      bones: ['thigh_r', 'calf_r'],
      axis: 'y',
      range: [0.75, 1.25],
      chained: true
    }
  ],
  armLength: [{ bone: 'lowerarm_l', axis: 'y', range: [0.8, 1.25], mirror: 'lowerarm_r' }],
  muscleMass: [
    {
      bones: [
        'upperarm_l',
        'upperarm_r',
        'lowerarm_l',
        'lowerarm_r',
        'thigh_l',
        'thigh_r'
      ],
      axis: 'xz',
      range: [0.8, 1.3]
    }
  ]
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
      const defs = BONE_MORPHS[name]
      if (defs) {
        for (const def of defs) {
          this.applyBoneScale(def, value)
        }
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
      const perBone = def.chained ? Math.pow(scale, 1 / def.bones.length) : scale
      for (const name of def.bones) {
        const bone = this.boneMap.get(name) ?? this.resolveBone(name)
        if (bone) {
          applyAxisScale(bone, def.axis, perBone)
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

function applyAxisScale(bone: THREE.Bone, axis: 'x' | 'y' | 'z' | 'xz', scale: number): void {
  if (axis === 'x') bone.scale.x = scale
  else if (axis === 'y') bone.scale.y = scale
  else if (axis === 'z') bone.scale.z = scale
  else {
    bone.scale.x = scale
    bone.scale.z = scale
  }
}
