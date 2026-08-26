/**
 * Import Quaternius Regular Male/Female base bodies into imported-project.
 *
 * Usage:
 *   node scripts/import-regular-bodies.mjs <path-to-unpacked-pack-root>
 *
 * Example:
 *   node scripts/import-regular-bodies.mjs "C:\Users\j\Downloads\Universal Base Characters[Standard]"
 *
 * The pack root is expected to contain:
 *   Base Characters/Godot - UE/Regular_Male_FullBody.gltf
 *   Base Characters/Godot - UE/Regular_Female_FullBody.gltf
 *
 * Steps:
 *   1. Convert each GLTF to self-contained Draco-compressed GLB
 *   2. Verify skeleton bone names match the existing base body skeleton
 *   3. Copy into imported-project/assets/meshes with fresh UUIDs
 *   4. Append entries to imported-project/assets/index.json (idempotent)
 */

import { execSync } from 'node:child_process'
import { mkdir, copyFile, writeFile, readFile } from 'node:fs/promises'
import { join, dirname, basename } from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { existsSync, readFileSync, readdirSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const CONVERTED_DIR = join(ROOT, 'assets', 'converted-glb')
const PROJECT_DIR = join(ROOT, 'imported-project')
const MESH_DIR = join(PROJECT_DIR, 'assets', 'meshes')
const INDEX_PATH = join(PROJECT_DIR, 'assets', 'index.json')

const BODIES = [
  {
    gltfName: 'Regular_Male_FullBody.gltf',
    name: 'Regular Male',
    tags: ['body', 'regular', 'male', 'base_body']
  },
  {
    gltfName: 'Regular_Female_FullBody.gltf',
    name: 'Regular Female',
    tags: ['body', 'regular', 'female', 'base_body']
  }
]

// Reference bone set taken from the existing Superhero base body GLB.
const EXPECTED_BONES = [
  'root', 'pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'Head',
  'clavicle_l', 'upperarm_l', 'lowerarm_l', 'hand_l',
  'clavicle_r', 'upperarm_r', 'lowerarm_r', 'hand_r',
  'thigh_l', 'calf_l', 'foot_l', 'ball_l',
  'thigh_r', 'calf_r', 'foot_r', 'ball_r'
]

function parseGlbJson(glbPath) {
  const buf = readFileSync(glbPath)
  const jsonLen = buf.readUInt32LE(12)
  return JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'))
}

function extractBoneNames(gltfJson) {
  const skin = (gltfJson.skins || [])[0]
  if (!skin) return []
  return (skin.joints || []).map((i) => gltfJson.nodes[i]?.name ?? `#${i}`)
}

function verifySkeleton(glbPath) {
  const bones = extractBoneNames(parseGlbJson(glbPath))
  const boneSet = new Set(bones)
  const missing = EXPECTED_BONES.filter((b) => !boneSet.has(b))
  return { jointCount: bones.length, missing }
}

function findPackFile(packRoot, relative) {
  const candidate = join(packRoot, relative)
  if (existsSync(candidate)) return candidate
  // Fall back to recursive search by filename
  function walk(dir) {
    let out = []
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) out = out.concat(walk(p))
      else if (e.name === basename(relative)) out.push(p)
    }
    return out
  }
  const found = walk(packRoot)
  return found[0] ?? null
}

async function convertToGLB(sourceGltf, outputDir) {
  const baseName = basename(sourceGltf, '.gltf')
  const outputPath = join(outputDir, `${baseName}.glb`)
  if (existsSync(outputPath)) {
    console.log(`  [SKIP] ${baseName}.glb already exists`)
    return outputPath
  }
  console.log(`  [CONVERT] ${baseName}.gltf → ${baseName}.glb`)
  execSync(
    `npx @gltf-transform/cli optimize "${sourceGltf}" "${outputPath}" --compress draco`,
    { stdio: 'pipe', timeout: 120000 }
  )
  return outputPath
}

async function main() {
  const packRoot = process.argv[2]
  if (!packRoot || !existsSync(packRoot)) {
    console.error('Usage: node scripts/import-regular-bodies.mjs <path-to-unpacked-pack-root>')
    process.exit(1)
  }

  await mkdir(CONVERTED_DIR, { recursive: true })
  await mkdir(MESH_DIR, { recursive: true })

  const index = JSON.parse(await readFile(INDEX_PATH, 'utf8'))

  for (const body of BODIES) {
    console.log(`\n=== ${body.name} ===`)

    // Skip if already registered (match on 'regular' tag + exact gender tag)
    const genderTag = body.tags.includes('male') && !body.tags.includes('female') ? 'male' : 'female'
    const alreadyRegistered = index.some(
      (e) => e.slotId === 'body' && e.tags?.includes('regular') && e.tags?.includes(genderTag)
    )
    if (alreadyRegistered) {
      console.log('  [SKIP] already registered in index')
      continue
    }

    const gltfPath = findPackFile(packRoot, join('Base Characters', 'Godot - UE', body.gltfName))
    if (!gltfPath) {
      console.error(`  [FAIL] Could not find ${body.gltfName} under ${packRoot}`)
      continue
    }
    console.log(`  Source: ${gltfPath}`)

    const glbPath = await convertToGLB(gltfPath, CONVERTED_DIR)

    const { jointCount, missing } = verifySkeleton(glbPath)
    console.log(`  Skeleton: ${jointCount} joints`)
    if (missing.length > 0) {
      console.error(`  [WARN] Missing expected bones (${missing.length}): ${missing.join(', ')}`)
      console.error('         Outfits may not attach correctly. Review before use.')
    } else {
      console.log(`  Skeleton check: all ${EXPECTED_BONES.length} key bones present ✓`)
    }

    const assetId = randomUUID()
    const destPath = join(MESH_DIR, `${assetId}.glb`)
    await copyFile(glbPath, destPath)

    index.push({
      id: assetId,
      slotId: 'body',
      path: `assets/meshes/${assetId}.glb`,
      tags: body.tags,
      version: 1,
      created: new Date().toISOString()
    })
    console.log(`  [REGISTER] ${assetId.slice(0, 8)}... → body slot`)
  }

  await writeFile(INDEX_PATH, JSON.stringify(index, null, 2))
  console.log(`\nIndex updated: ${index.length} total assets`)
  console.log('=== Done ===')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
