import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import referenceSkeleton from '../../shared/data/reference-skeleton.json'

export interface ValidationIssue {
  type: 'error' | 'warning'
  category: 'format' | 'skeleton' | 'scale' | 'texture'
  message: string
}

export interface ValidationReport {
  valid: boolean
  issues: ValidationIssue[]
  skeletonBones: string[]
  boundingBox: { width: number; height: number; depth: number } | null
  slotHints: string[]
}

const EXPECTED_SCALE_BY_SLOT: Record<string, number> = {
  body: 0.7,
  head: 0.44,
  hair: 0.4,
  helmet: 0.4,
  shirt: 0.6,
  pants: 0.5,
  shoes: 0.2,
  gloves: 0.15,
  cape: 0.5,
  wings: 0.6
}

const loader = new GLTFLoader()
const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/')
loader.setDRACOLoader(dracoLoader)
loader.setMeshoptDecoder(MeshoptDecoder)

export async function validateGLB(buffer: ArrayBuffer, slotId?: string): Promise<ValidationReport> {
  const issues: ValidationIssue[] = []
  let skeletonBones: string[] = []
  let boundingBox: ValidationReport['boundingBox'] = null
  const slotHints: string[] = []

  let scene: THREE.Group
  try {
    const gltf = await loader.parseAsync(buffer, '')
    scene = gltf.scene
  } catch {
    issues.push({
      type: 'error',
      category: 'format',
      message: 'Failed to parse GLB file. File may be corrupt.'
    })
    return { valid: false, issues, skeletonBones: [], boundingBox: null, slotHints: [] }
  }

  const boneSet = new Set<string>()
  scene.traverse((child) => {
    if (child instanceof THREE.Bone) {
      boneSet.add(child.name)
    }
  })
  skeletonBones = Array.from(boneSet)

  const ref = referenceSkeleton as {
    critical: string[]
    optional: string[]
    hierarchy: Array<{ parent: string | null; bone: string }>
    aliases: Record<string, string>
  }

  const aliasToCanonical: Record<string, string> = ref.aliases
  function hasCanonicalBone(canonicalName: string): boolean {
    if (boneSet.has(canonicalName)) return true
    for (const [alias, target] of Object.entries(aliasToCanonical)) {
      if (target === canonicalName && boneSet.has(alias)) return true
    }
    return false
  }

  const criticalMissing = ref.critical.filter((name) => !hasCanonicalBone(name))
  const optionalMissing = ref.optional.filter((name) => !hasCanonicalBone(name))

  for (const name of criticalMissing) {
    issues.push({
      type: 'error',
      category: 'skeleton',
      message: `Missing critical bone: "${name}"`
    })
  }
  for (const name of optionalMissing) {
    issues.push({
      type: 'warning',
      category: 'skeleton',
      message: `Missing optional bone: "${name}"`
    })
  }

  if (criticalMissing.length === 0 && optionalMissing.length > 0) {
    issues.push({
      type: 'warning',
      category: 'skeleton',
      message: 'Skeleton is valid but missing some optional bones.'
    })
  }

  const bbox = new THREE.Box3()
  scene.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.computeBoundingBox()
      if (child.geometry.boundingBox) {
        bbox.expandByPoint(new THREE.Vector3())
        bbox.min.min(child.geometry.boundingBox.min)
        bbox.max.max(child.geometry.boundingBox.max)
      }
    }
  })

  if (bbox.isEmpty() === false) {
    const size = new THREE.Vector3()
    bbox.getSize(size)
    boundingBox = { width: size.x, height: size.y, depth: size.z }

    if (slotId && EXPECTED_SCALE_BY_SLOT[slotId]) {
      const expected = EXPECTED_SCALE_BY_SLOT[slotId]
      const maxDim = Math.max(size.x, size.y, size.z)
      const ratio = maxDim / expected
      if (ratio > 10 || ratio < 0.1) {
        issues.push({
          type: 'warning',
          category: 'scale',
          message: `Scale may be incorrect. Expected ~${expected.toFixed(1)}m for slot "${slotId}", got ${maxDim.toFixed(2)}m (${ratio.toFixed(1)}x difference).`
        })
      }
    } else {
      const maxDim = Math.max(size.x, size.y, size.z)
      if (maxDim < 0.01 || maxDim > 10) {
        issues.push({
          type: 'warning',
          category: 'scale',
          message: `Unusual scale: bounding box is ${size.x.toFixed(3)} x ${size.y.toFixed(3)} x ${size.z.toFixed(3)}. Expected roughly 0.1-2m.`
        })
      }
    }
  }

  if (boneSet.size > 0 && criticalMissing.length === 0) {
    slotHints.push('skeleton')
  }

  return {
    valid: issues.filter((i) => i.type === 'error').length === 0,
    issues,
    skeletonBones,
    boundingBox,
    slotHints
  }
}
