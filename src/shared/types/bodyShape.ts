export interface BodyShape {
  headWidth: number
  headHeight: number
  headLength: number
  jawChin: number
  shoulderWidth: number
  chestDepth: number
  waistTaper: number
  hipWidth: number
}

export const DEFAULT_BODY_SHAPE: BodyShape = {
  headWidth: 0.25,
  headHeight: 0.22,
  headLength: 0.26,
  jawChin: 0.35,
  shoulderWidth: 1,
  chestDepth: 1,
  waistTaper: 1,
  hipWidth: 1
}

export function mergeBodyShape(partial?: Partial<BodyShape>): BodyShape {
  return { ...DEFAULT_BODY_SHAPE, ...partial }
}

const SHAPE_RANGES: Record<keyof BodyShape, [number, number]> = {
  headWidth: [0.15, 0.35],
  headHeight: [0.14, 0.3],
  headLength: [0.16, 0.36],
  jawChin: [0, 1],
  shoulderWidth: [0.6, 1.5],
  chestDepth: [0.6, 1.5],
  waistTaper: [0.6, 1.5],
  hipWidth: [0.6, 1.5]
}

export function sanitizeBodyShape(partial?: Partial<BodyShape>): BodyShape {
  const merged = mergeBodyShape(partial)
  const out = { ...merged }
  for (const [key, [min, max]] of Object.entries(SHAPE_RANGES) as Array<[keyof BodyShape, [number, number]]>) {
    out[key] = Math.max(min, Math.min(max, merged[key]))
  }
  return out
}
