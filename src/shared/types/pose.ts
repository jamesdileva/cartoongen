/** A named stance: local-rotation offsets (radians) added to rest pose. */
export interface Pose {
  id: string
  name: string
  icon: string
  description: string
  bones: Record<string, [number, number, number]>
}
