export interface Template {
  id: string
  name: string
  description: string
  icon: string
  morphs: Record<string, number>
  colors: Record<string, string>
}
