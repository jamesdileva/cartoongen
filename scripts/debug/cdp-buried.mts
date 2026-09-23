// Live probe: load a DNA into the running app and measure mouth vs deformed
// skull + bone scales. Usage: npx tsx scripts/debug/cdp-buried.mts <dna.json> [label]

import { readFileSync, writeFileSync } from 'node:fs'

const dnaFile = process.argv[2]
const label = process.argv[3] ?? 'buried'
if (!dnaFile) {
  console.error('usage: npx tsx scripts/debug/cdp-buried.mts <dna.json> [label]')
  process.exit(1)
}

const dna = JSON.parse(readFileSync(dnaFile, 'utf8'))

const list = await fetch('http://127.0.0.1:9222/json/list').then((r) => r.json())
const page = list.find((t: { type: string; url: string }) => t.type === 'page' && t.url.includes('5173'))
if (!page) {
  console.error('app page not found')
  process.exit(1)
}

const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  ws.onopen = res
  ws.onerror = rej
})

let msgId = 0
const pending = new Map<number, (v: unknown) => void>()
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data as string)
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)!(msg.result)
    pending.delete(msg.id)
  }
}
const send = (method: string, params: Record<string, unknown> = {}) =>
  new Promise((resolve) => {
    const id = ++msgId
    pending.set(id, resolve)
    ws.send(JSON.stringify({ id, method, params }))
  })

async function evaluate<T>(expression: string): Promise<T> {
  const r = (await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  })) as { result?: { value?: T }; exceptionDetails?: { exception?: { description?: string } } }
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'page exception')
  return r.result?.value as T
}

// install DNA and wait for rebuilds to settle
await evaluate(`window.__app.setDNA(${JSON.stringify(dna)})`)
await new Promise((r) => setTimeout(r, 600))
await evaluate('window.__app.faceCam()')
await new Promise((r) => setTimeout(r, 300))

const inspect = `
(() => {
  const ccm = window.__ccm
  if (!ccm) return { error: 'no __ccm' }
  const scene = ccm.getSceneGroup()

  // find skull (Head-bound skinned mesh)
  let skull = null
  scene.traverse((o) => {
    if (o.isSkinnedMesh && o.geometry.attributes.position.count > 400) {
      const hasHead = o.skeleton && o.skeleton.bones.some((b) => b && b.name === 'Head')
      if (hasHead && (!skull || o.geometry.attributes.position.count > skull.geometry.attributes.position.count)) skull = o
    }
  })
  if (!skull) return { error: 'no skull' }

  // face group
  let face = null
  scene.traverse((o) => {
    if (o.type === 'Group' && o.children.some((c) => c.name === 'Nose')) face = o
  })

  const bones = skull.skeleton.bones
  const interesting = ['Head', 'Neck', 'Spine', 'Spine1', 'Spine2', 'Root', 'neck_01', 'spine_01', 'spine_02', 'spine_03']
  const scales = {}
  for (const b of bones) {
    if (interesting.includes(b.name) || b.name.toLowerCase().includes('neck') || b.name.toLowerCase().includes('spine')) {
      scales[b.name] = [b.scale.x, b.scale.y, b.scale.z].map((n) => +n.toFixed(4))
    }
  }

  // deformed skull verts
  const pos = skull.geometry.attributes.position
  const si = skull.geometry.attributes.skinIndex.array
  const sw = skull.geometry.attributes.skinWeight.array
  const mats = bones.map((b, i) => {
    const inv = skull.skeleton.boneInverses[i].elements
    const w = b.matrixWorld.elements
    const out = new Array(16)
    for (let col = 0; col < 4; col++) {
      for (let row = 0; row < 4; row++) {
        out[col * 4 + row] =
          w[row] * inv[col * 4] +
          w[4 + row] * inv[col * 4 + 1] +
          w[8 + row] * inv[col * 4 + 2] +
          w[12 + row] * inv[col * 4 + 3]
      }
    }
    return out
  })
  const deformed = []
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    let dx = 0, dy = 0, dz = 0
    for (let k = 0; k < 4; k++) {
      const w = sw[i * 4 + k]
      if (w <= 0) continue
      const m = mats[si[i * 4 + k]]
      dx += w * (m[0] * x + m[4] * y + m[8] * z + m[12])
      dy += w * (m[1] * x + m[5] * y + m[9] * z + m[13])
      dz += w * (m[2] * x + m[6] * y + m[10] * z + m[14])
    }
    deformed.push([dx, dy, dz])
  }

  // mouth world verts
  let mouth = null
  if (face) mouth = face.children.find((c) => c.name === 'Mouth')
  const mouthWorld = []
  if (mouth) {
    mouth.updateMatrixWorld(true)
    const mp = mouth.geometry.attributes.position
    const e = mouth.matrixWorld.elements
    for (let i = 0; i < mp.count; i++) {
      const x = mp.getX(i), y = mp.getY(i), z = mp.getZ(i)
      mouthWorld.push([
        e[0] * x + e[4] * y + e[8] * z + e[12],
        e[1] * x + e[5] * y + e[9] * z + e[13],
        e[2] * x + e[6] * y + e[10] * z + e[14]
      ])
    }
  }

  // for each mouth vert: deformed skull max z in tight band
  let buried = 0
  let worst = 1e9
  const samples = []
  for (const [mx, my, mz] of mouthWorld) {
    let surf = -1e9
    for (const [dx, dy, dz] of deformed) {
      if (Math.abs(dx - mx) < 0.015 && Math.abs(dy - my) < 0.012) {
        if (dz > surf) surf = dz
      }
    }
    if (surf === -1e9) continue
    const clear = mz - surf
    if (clear < worst) worst = clear
    if (clear < -0.005) buried++
    if (samples.length < 8) samples.push({ m: [+mx.toFixed(3), +my.toFixed(3), +mz.toFixed(3)], surf: +surf.toFixed(4), clear: +clear.toFixed(4) })
  }

  // mouth max z overall vs skull max z in mouth y-band
  let mMaxZ = -1e9, mMinY = 1e9, mMaxY = -1e9
  for (const [x, y, z] of mouthWorld) {
    if (z > mMaxZ) mMaxZ = z
    if (y < mMinY) mMinY = y
    if (y > mMaxY) mMaxY = y
  }
  let skMaxZ = -1e9
  for (const [x, y, z] of deformed) {
    if (y >= mMinY - 0.01 && y <= mMaxY + 0.01 && Math.abs(x) < 0.08 && z > skMaxZ) skMaxZ = z
  }

  const dna = window.__app.getDNA()
  return {
    buriedVerts: buried,
    mouthVerts: mouthWorld.length,
    worstClear: +worst.toFixed(4),
    mouthMaxZ: +mMaxZ.toFixed(4),
    skullMaxZInBand: +skMaxZ.toFixed(4),
    boneScales: scales,
    headKeyish: dna.bodyShape,
    samples
  }
})()
`

const state = await evaluate(inspect)
console.log(JSON.stringify(state, null, 2))

const shot = await send('Page.captureScreenshot', { format: 'png' })
const shotData = shot as { data: string }
writeFileSync(`scripts/debug/${label}.png`, Buffer.from(shotData.data, 'base64'))
console.log(`screenshot: scripts/debug/${label}.png`)
ws.close()
