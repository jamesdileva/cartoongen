/**
 * Phase 1: Asset Pipeline — Convert all GLTF assets to self-contained GLB
 * and register them in a fresh project.
 *
 * Usage: node scripts/import-all-assets.mjs
 *
 * This script:
 *   1. Converts all GLTF to self-contained GLB via @gltf-transform/cli
 *   2. Creates a fresh project at assets/imported-project/
 *   3. Copies all GLB files into project assets
 *   4. Writes assets/index.json with correct slot/tag assignments
 *   5. Generates a setup script for thumbnail generation
 */

import { execSync } from 'node:child_process'
import { mkdir, copyFile, writeFile, readFile } from 'node:fs/promises'
import { join, dirname, basename, extname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const ASSETS_DIR = join(ROOT, 'assets')
const CONVERTED_DIR = join(ASSETS_DIR, 'converted-glb')
const PROJECT_DIR = join(ROOT, 'imported-project')

// ---- Asset Definitions ----
// Each entry: { source, slot, tags, name }
// source is relative to the GLTF source directory

const HAIR_SRC = join(ASSETS_DIR, 'Universal Base Characters[Standard]', 'Hairstyles', 'Rigged to Head Bone', 'glTF (Godot -Unreal)')

const BODY_SRC = join(ASSETS_DIR, 'Universal Base Characters[Standard]', 'Base Characters', 'Godot - UE')

const OUTFIT_SRC = join(ASSETS_DIR, 'Modular Character Outfits - Fantasy[Standard]', 'Exports', 'glTF (Godot-Unreal)', 'Modular Parts')

function defineAssets() {
  return [
    // ---- Bodies ----
    { source: join(BODY_SRC, 'Superhero_Male_FullBody.gltf'), slot: 'body', tags: ['body', 'superhero', 'male', 'base_body'], name: 'Superhero Male' },
    { source: join(BODY_SRC, 'Superhero_Female_FullBody.gltf'), slot: 'body', tags: ['body', 'superhero', 'female', 'base_body'], name: 'Superhero Female' },

    // ---- Hairstyles ----
    { source: join(HAIR_SRC, 'Hair_SimpleParted.gltf'), slot: 'hair', tags: ['hair', 'male', 'female'], name: 'Simple Parted' },
    { source: join(HAIR_SRC, 'Hair_Long.gltf'), slot: 'hair', tags: ['hair', 'female'], name: 'Long Hair' },
    { source: join(HAIR_SRC, 'Hair_BuzzedFemale.gltf'), slot: 'hair', tags: ['hair', 'female'], name: 'Buzzed Female' },
    { source: join(HAIR_SRC, 'Hair_Buzzed.gltf'), slot: 'hair', tags: ['hair', 'male'], name: 'Buzzed' },
    { source: join(HAIR_SRC, 'Hair_Buns.gltf'), slot: 'hair', tags: ['hair', 'female'], name: 'Buns' },
    { source: join(HAIR_SRC, 'Hair_Beard.gltf'), slot: 'beard', tags: ['beard', 'male'], name: 'Beard' },
    { source: join(HAIR_SRC, 'Eyebrows_Regular.gltf'), slot: 'eyebrows', tags: ['eyebrows', 'male'], name: 'Eyebrows Regular' },
    { source: join(HAIR_SRC, 'Eyebrows_Female.gltf'), slot: 'eyebrows', tags: ['eyebrows', 'female'], name: 'Eyebrows Female' },

    // ---- Peasant (Male) ----
    { source: join(OUTFIT_SRC, 'Male_Peasant_Body.gltf'), slot: 'shirt', tags: ['shirt', 'peasant', 'fantasy', 'male'], name: 'Peasant Tunic (M)' },
    { source: join(OUTFIT_SRC, 'Male_Peasant_Legs.gltf'), slot: 'pants', tags: ['pants', 'peasant', 'fantasy', 'male'], name: 'Peasant Leggings (M)' },
    { source: join(OUTFIT_SRC, 'Male_Peasant_Arms.gltf'), slot: 'gloves', tags: ['gloves', 'peasant', 'fantasy', 'male'], name: 'Peasant Sleeves (M)' },
    { source: join(OUTFIT_SRC, 'Male_Peasant_Feet.gltf'), slot: 'shoes', tags: ['shoes', 'peasant', 'fantasy', 'male'], name: 'Peasant Boots (M)' },

    // ---- Peasant (Female) ----
    { source: join(OUTFIT_SRC, 'Female_Peasant_Body.gltf'), slot: 'shirt', tags: ['shirt', 'peasant', 'fantasy', 'female'], name: 'Peasant Tunic (F)' },
    { source: join(OUTFIT_SRC, 'Female_Peasant_Legs.gltf'), slot: 'pants', tags: ['pants', 'peasant', 'fantasy', 'female'], name: 'Peasant Leggings (F)' },
    { source: join(OUTFIT_SRC, 'Female_Peasant_Arms.gltf'), slot: 'gloves', tags: ['gloves', 'peasant', 'fantasy', 'female'], name: 'Peasant Sleeves (F)' },
    { source: join(OUTFIT_SRC, 'Female_Peasant_Feet.gltf'), slot: 'shoes', tags: ['shoes', 'peasant', 'fantasy', 'female'], name: 'Peasant Boots (F)' },

    // ---- Ranger (Male) ----
    { source: join(OUTFIT_SRC, 'Male_Ranger_Body.gltf'), slot: 'shirt', tags: ['shirt', 'ranger', 'fantasy', 'leather', 'male'], name: 'Ranger Tunic (M)' },
    { source: join(OUTFIT_SRC, 'Male_Ranger_Legs.gltf'), slot: 'pants', tags: ['pants', 'ranger', 'fantasy', 'leather', 'male'], name: 'Ranger Leggings (M)' },
    { source: join(OUTFIT_SRC, 'Male_Ranger_Arms.gltf'), slot: 'gloves', tags: ['gloves', 'ranger', 'fantasy', 'leather', 'male'], name: 'Ranger Bracers (M)' },
    { source: join(OUTFIT_SRC, 'Male_Ranger_Feet_Boots.gltf'), slot: 'shoes', tags: ['shoes', 'ranger', 'fantasy', 'leather', 'male', 'boots'], name: 'Ranger Boots (M)' },
    { source: join(OUTFIT_SRC, 'Male_Ranger_Head_Hood.gltf'), slot: 'helmet', tags: ['helmet', 'hood', 'ranger', 'fantasy', 'male'], name: 'Ranger Hood (M)' },
    { source: join(OUTFIT_SRC, 'Male_Ranger_Acc_Pauldron.gltf'), slot: 'cape', tags: ['cape', 'back', 'pauldron', 'ranger', 'fantasy', 'male'], name: 'Ranger Pauldron (M)' },

    // ---- Ranger (Female) ----
    { source: join(OUTFIT_SRC, 'Female_Ranger_Body.gltf'), slot: 'shirt', tags: ['shirt', 'ranger', 'fantasy', 'leather', 'female'], name: 'Ranger Tunic (F)' },
    { source: join(OUTFIT_SRC, 'Female_Ranger_Legs.gltf'), slot: 'pants', tags: ['pants', 'ranger', 'fantasy', 'leather', 'female'], name: 'Ranger Leggings (F)' },
    { source: join(OUTFIT_SRC, 'Female_Ranger_Arms.gltf'), slot: 'gloves', tags: ['gloves', 'ranger', 'fantasy', 'leather', 'female'], name: 'Ranger Bracers (F)' },
    { source: join(OUTFIT_SRC, 'Female_Ranger_Feet.gltf'), slot: 'shoes', tags: ['shoes', 'ranger', 'fantasy', 'leather', 'female'], name: 'Ranger Boots (F)' },
    { source: join(OUTFIT_SRC, 'Female_Ranger_Head_Hood.gltf'), slot: 'helmet', tags: ['helmet', 'hood', 'ranger', 'fantasy', 'female'], name: 'Ranger Hood (F)' },
    { source: join(OUTFIT_SRC, 'Female_Ranger_Acc_Pauldrons.gltf'), slot: 'cape', tags: ['cape', 'back', 'pauldron', 'ranger', 'fantasy', 'female'], name: 'Ranger Pauldrons (F)' },
  ]
}

async function ensureDir(dir) {
  await mkdir(dir, { recursive: true })
}

async function convertToGLB(sourceGltf, outputDir) {
  const baseName = basename(sourceGltf, '.gltf')
  const outputPath = join(outputDir, `${baseName}.glb`)

  if (existsSync(outputPath)) {
    console.log(`  [SKIP] ${baseName}.glb already exists`)
    return outputPath
  }

  console.log(`  [CONVERT] ${baseName}.gltf → ${baseName}.glb`)
  try {
    execSync(
      `npx @gltf-transform/cli optimize "${sourceGltf}" "${outputPath}" --compress draco`,
      { stdio: 'pipe', timeout: 60000 }
    )
    return outputPath
  } catch (err) {
    console.error(`  [FAIL] ${baseName}: ${err.message}`)
    return null
  }
}

async function main() {
  console.log('=== Phase 1: Asset Import Pipeline ===')
  console.log('')

  const assets = defineAssets()
  console.log(`Found ${assets.length} assets to process\n`)

  // ---- Step 1: Convert all GLTF to GLB ----
  console.log('--- Step 1: Converting GLTF → GLB ---')
  await ensureDir(CONVERTED_DIR)

  const convertedPaths = []
  for (const asset of assets) {
    const glbPath = await convertToGLB(asset.source, CONVERTED_DIR)
    convertedPaths.push({ ...asset, glbPath })
  }

  const successCount = convertedPaths.filter(a => a.glbPath).length
  const failCount = convertedPaths.filter(a => !a.glbPath).length
  console.log(`\nConverted: ${successCount}, Failed: ${failCount}\n`)

  if (successCount === 0) {
    console.error('No assets converted. Aborting.')
    process.exit(1)
  }

  // ---- Step 2: Create project scaffold ----
  console.log('--- Step 2: Creating project ---')
  const projectDir = PROJECT_DIR
  const meshDir = join(projectDir, 'assets', 'meshes')
  const thumbDir = join(projectDir, 'assets', 'thumbnails')
  await ensureDir(meshDir)
  await ensureDir(thumbDir)
  await ensureDir(join(projectDir, 'characters'))

  const projectManifest = {
    name: 'Imported Assets Project',
    version: 1,
    created: new Date().toISOString(),
    modified: new Date().toISOString()
  }
  await writeFile(join(projectDir, 'project.json'), JSON.stringify(projectManifest, null, 2))
  console.log('  Project created at:', projectDir)

  // ---- Step 3: Copy GLB files and build asset index ----
  console.log('\n--- Step 3: Copying assets and building index ---')

  const assetIndex = []
  for (const asset of convertedPaths) {
    if (!asset.glbPath) continue

    const assetId = randomUUID()
    const destPath = join(meshDir, `${assetId}.glb`)

    await copyFile(asset.glbPath, destPath)

    const entry = {
      id: assetId,
      slotId: asset.slot,
      path: `assets/meshes/${assetId}.glb`,
      tags: asset.tags,
      version: 1,
      created: new Date().toISOString()
    }

    assetIndex.push(entry)
    console.log(`  [COPY] ${asset.name} → ${assetId.slice(0, 8)}... (slot: ${asset.slot})`)
  }

  await writeFile(join(projectDir, 'assets', 'index.json'), JSON.stringify(assetIndex, null, 2))
  console.log(`\n  Index written: ${assetIndex.length} entries`)

  // ---- Step 4: Summary ----
  console.log('\n--- Summary ---')
  const slots = {}
  for (const a of assetIndex) {
    if (!slots[a.slotId]) slots[a.slotId] = 0
    slots[a.slotId]++
  }
  for (const [slot, count] of Object.entries(slots)) {
    console.log(`  ${slot}: ${count} assets`)
  }
  console.log(`\n  Total: ${assetIndex.length} assets registered`)
  console.log(`  Project: ${projectDir}`)

  // Write a mapping file for reference
  const mapping = convertedPaths
    .filter(a => a.glbPath)
    .map(a => ({
      name: a.name,
      slot: a.slot,
      tags: a.tags,
      source: a.source,
      glb: a.glbPath
    }))
  const mappingPath = join(CONVERTED_DIR, 'asset-mapping.json')
  await writeFile(mappingPath, JSON.stringify(mapping, null, 2))
  console.log(`\n  Asset mapping written to: ${mappingPath}`)

  console.log('\n=== Done ===')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
