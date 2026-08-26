import * as fs from 'node:fs'
import * as path from 'node:path'
import { app } from 'electron'

export interface WorkspaceState {
  lastCharacterName: string | null
  bgIndex: number
  projectRoot: string | null
}

const STATE_FILE = 'app-state.json'

function getGlobalStatePath(): string {
  return path.join(app.getPath('userData'), STATE_FILE)
}

export class WorkspaceService {
  static load(root: string): WorkspaceState | null {
    try {
      const filePath = path.join(root, STATE_FILE)
      if (!fs.existsSync(filePath)) return null
      const raw = fs.readFileSync(filePath, 'utf-8')
      return JSON.parse(raw) as WorkspaceState
    } catch {
      return null
    }
  }

  static save(root: string, state: WorkspaceState): boolean {
    try {
      const filePath = path.join(root, STATE_FILE)
      fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8')

      // Also save projectRoot to global state for startup
      if (state.projectRoot) {
        const globalPath = getGlobalStatePath()
        fs.writeFileSync(globalPath, JSON.stringify({ projectRoot: state.projectRoot }, null, 2), 'utf-8')
      }

      return true
    } catch {
      return false
    }
  }

  static loadGlobalProjectRoot(): string | null {
    try {
      const filePath = getGlobalStatePath()
      if (!fs.existsSync(filePath)) return null
      const raw = fs.readFileSync(filePath, 'utf-8')
      const state = JSON.parse(raw) as { projectRoot?: string }
      return state.projectRoot ?? null
    } catch {
      return null
    }
  }
}
