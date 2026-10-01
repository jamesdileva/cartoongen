export type NoseStyle = 'button' | 'pointed' | 'broad'
export type EyeStyle = 'round' | 'narrow' | 'deep'
export type BrowStyle = 'arc' | 'straight' | 'bushy'
export type EarStyle = 'round' | 'pointy'

export const NOSE_STYLES: NoseStyle[] = ['button', 'pointed', 'broad']
export const EYE_STYLES: EyeStyle[] = ['round', 'narrow', 'deep']
export const BROW_STYLES: BrowStyle[] = ['arc', 'straight', 'bushy']
export const EAR_STYLES: EarStyle[] = ['round', 'pointy']

export interface FaceShape {
  eyeScale: number
  eyeSpacing: number
  browTilt: number
  browHeight: number
  mouthCurve: number
  mouthWidth: number
  noseSize: number
  noseStyle: NoseStyle
  eyeStyle: EyeStyle
  browStyle: BrowStyle
  earStyle: EarStyle
}

export const DEFAULT_FACE_SHAPE: FaceShape = {
  eyeScale: 1,
  eyeSpacing: 1,
  browTilt: 0,
  browHeight: 1,
  mouthCurve: 0.4,
  mouthWidth: 1,
  noseSize: 1,
  noseStyle: 'button',
  eyeStyle: 'round',
  browStyle: 'arc',
  earStyle: 'round'
}

export function mergeFaceShape(partial?: Partial<FaceShape>): FaceShape {
  return { ...DEFAULT_FACE_SHAPE, ...partial }
}

type NumericFaceKey = 'eyeScale' | 'eyeSpacing' | 'browTilt' | 'browHeight' | 'mouthCurve' | 'mouthWidth' | 'noseSize'

const FACE_RANGES: Record<NumericFaceKey, [number, number]> = {
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
  for (const [key, [min, max]] of Object.entries(FACE_RANGES) as Array<[NumericFaceKey, [number, number]]>) {
    const v = merged[key]
    out[key] = typeof v === 'number' ? Math.max(min, Math.min(max, v)) : DEFAULT_FACE_SHAPE[key]
  }
  if (!NOSE_STYLES.includes(merged.noseStyle as NoseStyle)) out.noseStyle = 'button'
  if (!EYE_STYLES.includes(merged.eyeStyle as EyeStyle)) out.eyeStyle = 'round'
  if (!BROW_STYLES.includes(merged.browStyle as BrowStyle)) out.browStyle = 'arc'
  if (!EAR_STYLES.includes(merged.earStyle as EarStyle)) out.earStyle = 'round'
  return out
}
