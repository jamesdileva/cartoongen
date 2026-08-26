import * as fs from 'node:fs'
import * as path from 'node:path'
import { getProjectRoot } from '../ipc'

export class ExportFileService {
  static execute(params: {
    buffer: ArrayBuffer
    fileName: string
    profileName: string
    characterDna: string
  }): { ok: true; filePath: string } | { ok: false; error: string } {
    try {
      const projectRoot = getProjectRoot()
      const safeName = params.fileName.replace(/[<>:"/\\|?*]/g, '_')
      const exportDir = path.join(projectRoot, 'exports', params.profileName, safeName)
      fs.mkdirSync(exportDir, { recursive: true })

      const glbPath = path.join(exportDir, `${safeName}.glb`)
      fs.writeFileSync(glbPath, Buffer.from(params.buffer))

      const dnaPath = path.join(exportDir, `${safeName}.dna.json`)
      fs.writeFileSync(dnaPath, params.characterDna, 'utf-8')

      const logDir = path.join(projectRoot, 'exports')
      const logPath = path.join(logDir, 'export_log.json')
      const log: unknown[] = fs.existsSync(logPath)
        ? JSON.parse(fs.readFileSync(logPath, 'utf-8'))
        : []
      log.push({
        fileName: safeName,
        profile: params.profileName,
        timestamp: new Date().toISOString(),
        filePath: glbPath
      })
      fs.writeFileSync(logPath, JSON.stringify(log, null, 2), 'utf-8')

      return { ok: true, filePath: glbPath }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }
}
