import { create } from 'zustand'

interface ProjectState {
  currentProjectPath: string | null
  projectName: string | null
  characterNames: string[]
  loading: boolean
  error: string | null

  createProject: (root: string, name: string) => Promise<void>
  openProject: (root: string) => Promise<void>
  refreshCharacterList: () => Promise<void>
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  currentProjectPath: null,
  projectName: null,
  characterNames: [],
  loading: false,
  error: null,

  createProject: async (root, name) => {
    set({ loading: true, error: null })
    const api = window.electronAPI
    const result = await api.project.create(root, name)
    if (result.ok) {
      set({ currentProjectPath: root, projectName: name, loading: false })
    } else {
      set({ error: result.error, loading: false })
    }
  },

  openProject: async (root) => {
    set({ loading: true, error: null })
    const api = window.electronAPI
    const result = await api.project.open(root)
    if (result.ok) {
      set({
        currentProjectPath: root,
        projectName: result.projectName,
        loading: false
      })
      await get().refreshCharacterList()
    } else {
      set({ error: result.error, loading: false })
    }
  },

  refreshCharacterList: async () => {
    const api = window.electronAPI
    const names = await api.project.listCharacters()
    set({ characterNames: names })
  }
}))
