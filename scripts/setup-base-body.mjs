import { mkdir, copyFile, writeFile, readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..', 'test-project')
const glbSrc = join(__dirname, '..', 'Superhero_Male_FullBody.glb')

async function main() {
  const assetId = randomUUID()
  const meshDir = join(projectRoot, 'assets', 'meshes')
  const thumbDir = join(projectRoot, 'assets', 'thumbnails')
  await mkdir(meshDir, { recursive: true })
  await mkdir(thumbDir, { recursive: true })

  await copyFile(glbSrc, join(meshDir, `${assetId}.glb`))

  const index = [
    {
      id: assetId,
      slotId: 'body',
      path: `assets/meshes/${assetId}.glb`,
      tags: ['base_body', 'superhero'],
      version: 1,
      created: new Date().toISOString()
    }
  ]
  await writeFile(join(projectRoot, 'assets', 'index.json'), JSON.stringify(index, null, 2))

  try {
    const projectJson = JSON.parse(await readFile(join(projectRoot, 'project.json'), 'utf-8'))
    const entry = {
      id: assetId,
      slotId: 'body',
      path: `assets/meshes/${assetId}.glb`,
      tags: ['base_body', 'superhero'],
      version: 1,
      created: new Date().toISOString()
    }
    const existing = JSON.parse(await readFile(join(projectRoot, 'assets', 'index.json'), 'utf-8'))
    existing.push(entry)
    await writeFile(join(projectRoot, 'assets', 'index.json'), JSON.stringify(existing, null, 2))
    console.log('Asset registered in existing project:', assetId)
  } catch {
    console.log('No existing project.json found. Creating project scaffold.')
    const projectManifest = {
      name: 'Test Project',
      version: 1,
      created: new Date().toISOString(),
      modified: new Date().toISOString()
    }
    await mkdir(join(projectRoot, 'characters'), { recursive: true })
    await writeFile(join(projectRoot, 'project.json'), JSON.stringify(projectManifest, null, 2))
    console.log('Project created at:', projectRoot)
  }

  console.log('Base body asset registered with id:', assetId)
}

main().catch(console.error)
