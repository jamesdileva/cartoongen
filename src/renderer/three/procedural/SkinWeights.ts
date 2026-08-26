import * as THREE from 'three'

export interface BoneSegment {
  name: string
  start: [number, number, number]
  end: [number, number, number]
}

export interface SkinBinding {
  skinIndices: Uint16Array
  skinWeights: Float32Array
  segmentNames: string[]
}

export function pointSegmentDistance(
  px: number,
  py: number,
  pz: number,
  seg: BoneSegment
): number {
  const [ax, ay, az] = seg.start
  const [bx, by, bz] = seg.end
  const abx = bx - ax
  const aby = by - ay
  const abz = bz - az
  const apx = px - ax
  const apy = py - ay
  const apz = pz - az
  const abLenSq = abx * abx + aby * aby + abz * abz
  let t = abLenSq > 0 ? (apx * abx + apy * aby + apz * abz) / abLenSq : 0
  t = Math.max(0, Math.min(1, t))
  const dx = apx - abx * t
  const dy = apy - aby * t
  const dz = apz - abz * t
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

const INFLUENCES = 4

export function computeSkinBindings(
  positions: ArrayLike<number>,
  segments: BoneSegment[],
  sharpness = 2,
  maxInfluences = INFLUENCES
): SkinBinding {
  const influenceCount = Math.min(maxInfluences, segments.length)
  if (influenceCount === 0) {
    throw new Error('computeSkinBindings requires at least one bone segment')
  }

  const vertexCount = positions.length / 3
  const skinIndices = new Uint16Array(vertexCount * INFLUENCES)
  const skinWeights = new Float32Array(vertexCount * INFLUENCES)

  for (let v = 0; v < vertexCount; v++) {
    const px = positions[v * 3]
    const py = positions[v * 3 + 1]
    const pz = positions[v * 3 + 2]

    const dists: Array<{ index: number; d: number }> = []
    for (let s = 0; s < segments.length; s++) {
      dists.push({ index: s, d: pointSegmentDistance(px, py, pz, segments[s]) })
    }
    dists.sort((a, b) => a.d - b.d)

    const raw: Array<{ index: number; w: number }> = []
    for (let k = 0; k < influenceCount; k++) {
      const { index, d } = dists[k]
      const w = 1 / (Math.pow(d, sharpness) + 1e-6)
      raw.push({ index, w })
    }
    let sum = 0
    for (const r of raw) sum += r.w
    for (let k = 0; k < INFLUENCES; k++) {
      if (k < raw.length && sum > 0) {
        skinIndices[v * INFLUENCES + k] = raw[k].index
        skinWeights[v * INFLUENCES + k] = raw[k].w / sum
      } else if (k === 0) {
        skinIndices[v * INFLUENCES] = dists[0].index
        skinWeights[v * INFLUENCES] = 1
      }
    }
  }

  return { skinIndices, skinWeights, segmentNames: segments.map((s) => s.name) }
}

export function applySkinAttributes(
  geometry: THREE.BufferGeometry,
  binding: SkinBinding
): void {
  geometry.setAttribute('skinIndex', new THREE.BufferAttribute(binding.skinIndices, 4))
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(binding.skinWeights, 4))
}
