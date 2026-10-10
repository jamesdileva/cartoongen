// Post electron-builder step: rename the unpacked dir to the Sprint 38
// acceptance name (`dist/win-unpack`). Run via `npm run dist`.
import { rmSync, renameSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'dist', 'win-unpacked')
const dst = join(root, 'dist', 'win-unpack')
if (!existsSync(src)) {
  throw new Error(`expected unpacked dir missing: ${src}`)
}
if (existsSync(dst)) rmSync(dst, { recursive: true, force: true })
renameSync(src, dst)
console.log(`renamed win-unpacked -> win-unpack`)
