export interface FaceShape {
  eyeScale: number
  eyeSpacing: number
  browTilt: number
  browHeight: number
  mouthCurve: number
  mouthWidth: number
  noseSize: number
}

export const DEFAULT_FACE_SHAPE: FaceShape = {
  eyeScale: 1,
  eyeSpacing: 1,
  browTilt: 0,
  browHeight: 1,
  mouthCurve: 0.4,
  mouthWidth: 1,
  noseSize: 1
}

export function mergeFaceShape(partial?: Partial<FaceShape>): FaceShape {
  return { ...DEFAULT_FACE_SHAPE, ...partial }
}

const FACE_RANGES: Record<keyof FaceShape, [number, number]> = {
  eyeScale: [0.6, 1.6],
  eyeSpacing: [0.7, 1.4],
  browTilt: [-1, 1],
  browHeight: [0.8, 1.25],
  mouthCurve: [-1, 1],
  mouthWidth: [0.7, 1.4],
  noseSize: [0.6, 1.6]
}

export function sanitizeFaceShape(partial?: Partial<FaceShape>): FaceShape {
  const merged = mergeFaceShape(partial)
  const out = { ...merged }
  for (const [key, [min, max]] of Object.entries(FACE_RANGES) as Array<[keyof FaceShape, [number, number]]>) {
    out[key] = Math.max(min, Math.min(max, merged[key]))
  }
  return out
}
