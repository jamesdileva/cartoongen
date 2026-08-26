import { app, BrowserWindow, shell, dialog } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { ProjectService } from './services/ProjectService'
import { WorkspaceService } from './services/WorkspaceService'
import { setProjectService, registerAllIpcHandlers } from './ipc'
import { initializePluginService } from './ipc/pluginIpc'

let mainWindow: BrowserWindow | null = null

async function initializeApp(): Promise<void> {
  registerAllIpcHandlers()

  let projectRoot: string | null = null

  // Check for saved workspace state (last opened project)
  const savedRoot = WorkspaceService.loadGlobalProjectRoot()
  if (savedRoot && fs.existsSync(savedRoot)) {
    projectRoot = savedRoot
  }

  if (projectRoot) {
    try {
      const svc = await ProjectService.open(projectRoot)
      setProjectService(svc)
      await initializePluginService(projectRoot)
      createWindow()
      return
    } catch {
      // saved project is invalid, fall through to dialog
    }
  }

  const userDataPath = app.getPath('userData')
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select or Create a Project Folder'
  })

  if (result.canceled || result.filePaths.length === 0) {
    projectRoot = path.join(userDataPath, 'projects', 'MyProject')
    const svc = await ProjectService.create(projectRoot, 'MyProject')
    setProjectService(svc)
  } else {
    projectRoot = result.filePaths[0]
    try {
      const svc = await ProjectService.open(projectRoot)
      setProjectService(svc)
    } catch {
      const svc = await ProjectService.create(projectRoot, path.basename(projectRoot))
      setProjectService(svc)
    }
  }

  await initializePluginService(projectRoot)
  createWindow()
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    show: false
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  if (!app.isPackaged) {
    app.commandLine.appendSwitch('remote-debugging-port', '9222')
  }
  initializeApp()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
