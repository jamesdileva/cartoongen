import { vi, beforeEach } from 'vitest'

export function mockElectronAPI(overrides?: Partial<ElectronAPI>): void {
  const mockAPI: ElectronAPI = {
    platform: 'win32',
    project: {
      create: vi.fn(),
      open: vi.fn(),
      refresh: vi.fn()
    },
    character: {
      save: vi.fn().mockResolvedValue({ ok: true }),
      load: vi.fn().mockResolvedValue({ ok: true, dna: null }),
      delete: vi.fn(),
      list: vi.fn().mockResolvedValue([]),
      saveThumbnail: vi.fn(),
      readThumbnail: vi.fn()
    },
    asset: {
      query: vi.fn().mockResolvedValue([]),
      getById: vi.fn(),
      register: vi.fn(),
      unregister: vi.fn(),
      readFile: vi.fn(),
      readThumbnail: vi.fn()
    },
    slot: {
      listAll: vi.fn().mockResolvedValue([]),
      getById: vi.fn()
    },
    rule: {
      listAll: vi.fn().mockResolvedValue([])
    },
    import: {
      pickFile: vi.fn(),
      confirm: vi.fn()
    },
    export: {
      execute: vi.fn().mockResolvedValue({ ok: true, filePath: '' })
    },
    plugin: {
      list: vi.fn().mockResolvedValue([]),
      toggle: vi.fn()
    },
    data: {
      getRules: vi.fn().mockResolvedValue([]),
      getPresets: vi.fn().mockResolvedValue([]),
      getPalettes: vi.fn().mockResolvedValue({})
    },
    workspace: {
      load: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue(true)
    },
    ...overrides
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).window = { electronAPI: mockAPI }
}

export function cleanupElectronAPI(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (globalThis as any).window
}

export function setupStoreTests(): void {
  beforeEach(() => {
    mockElectronAPI()
  })
}
