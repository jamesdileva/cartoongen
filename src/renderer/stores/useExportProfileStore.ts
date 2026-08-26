import type { ExportProfile } from '../../shared/types/export'
import profilesData from '../../shared/data/export-profiles.json'

const defaults = profilesData as ExportProfile[]
let currentProfiles: ExportProfile[] = [...defaults]

export function getExportProfiles(): ExportProfile[] {
  return currentProfiles
}

export function updateExportProfiles(profiles: ExportProfile[]): void {
  currentProfiles = [...profiles]
}

export function resetExportProfiles(): void {
  currentProfiles = [...defaults]
}
