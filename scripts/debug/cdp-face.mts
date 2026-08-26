// Inspect the LIVE app via Chrome DevTools Protocol: find face features vs
// deformed skull surface inside the real render pipeline.
// Usage: npx tsx scripts/debug/cdp-face.mts [randomizeCount]

const COUNT = Number(process.argv[2] ?? 0)

interface CdpTarget {
  webSocketDebuggerUrl: string
  type: string
  url: string
}

const list = (await fetch('http://127.0.0.1:9222/json/list').then((r) => r.json())) as CdpTarget[]
const page =
  list.find((t) => t.type === 'page' && t.url.includes('5173')) ??
  list.find((t) => t.type === 'page' && t.url.includes('index.html')) ??
  list.find((t) => t.type === 'page')
if (!page) {
  console.error('No page target found. Is the app running with remote debugging?')
  process.exit(1)
}

const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  ws.onopen = res
  ws.onerror = rej
})

let msgId = 0
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>()
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data as string)
  if (msg.id && pending.has(msg.id)) {
    const p = pending.get(msg.id)!
    pending.delete(msg.id)
    if (msg.error) p.reject(new Error(msg.error.message))
    else p.resolve(msg.result)
  }
}

function send(method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const id = ++msgId
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
}

async function evaluate<T>(expression: string): Promise<T> {
  const result = (await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  })) as {
    result?: { value?: T }
    exceptionDetails?: { exception?: { description?: string }; text?: string }
  }
  if (result.exceptionDetails) {
    throw new Error(
      'Page exception: ' +
        (result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? 'unknown')
    )
  }
  return result.result?.value as T
}

const inspectExpr = `
(() => {
  const ccm = window.__ccm
  if (!ccm) return { error: 'no __ccm' }
  const scene = ccm.getSceneGroup()

  let skull = null
  let skullCount = 0
  const faceGroups = []
  scene.traverse((o) => {
    if (o.isSkinnedMesh && o.geometry.attributes.position.count > 400) {
      skullCount++
      const hasHead = o.skeleton && o.skeleton.bones.some((b) => b && b.name === 'Head')
      if (hasHead && (!skull || o.geometry.attributes.position.count > skull.geometry.attributes.position.count)) {
        skull = o
      }
    }
    if (o.type === 'Group' && o.children.some((c) => c.name === 'Nose')) faceGroups.push(o)
  })
  if (!skull) return { error: 'no skull mesh', skullCount }

  const bones = skull.skeleton.bones
  const headBone = bones.find((b) => b.name === 'Head')
  const neckBone = bones.find((b) => b.name === 'Neck')

  // face group parent chain
  const parentChain = faceGroups.map((g) => {
    const chain = []
    let p = g
    while (p) { chain.push(p.name || p.type); p = p.parent }
    return chain.join(' < ')
  })

  // feature world positions
  const v = { x: 0, y: 0, z: 0 }
  const features = []
  for (const g of faceGroups) {
    for (const c of g.children) {
      if (!c.isMesh) continue
      const e = c.matrixWorld.elements
      features.push({ name: c.name, pos: [e[12], e[13], e[14]] })
    }
  }

  // deform skull verts (sample every 3rd for speed)
  const pos = skull.geometry.attributes.position
  const si = skull.geometry.attributes.skinIndex.array
  const sw = skull.geometry.attributes.skinWeight.array
  const mats = bones.map((b, i) => {
    const inv = skull.skeleton.boneInverses[i].elements
    const w = b.matrixWorld.elements
    // combined = matrixWorld * inverse
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
  for (let i = 0; i < pos.count; i += 2) {
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

  // skull surface z near each feature (feature's own x band)
  const report = features.map((f) => {
    let surfZ = -1e9
    for (const d of deformed) {
      if (Math.abs(d[1] - f.pos[1]) < 0.03 && Math.abs(d[0] - f.pos[0]) < 0.045) {
        if (d[2] > surfZ) surfZ = d[2]
      }
    }
    return { name: f.name, pos: f.pos.map((n) => +n.toFixed(3)), surfZ: +surfZ.toFixed(3) }
  })

  const ys = deformed.map((d) => d[1])

  // local (untransformed) face feature positions + the face group's own scale
  const locals = []
  for (const g of faceGroups) {
    for (const c of g.children) {
      if (!c.isMesh) continue
      locals.push({ name: c.name, local: [c.position.x, c.position.y, c.position.z].map((n) => +n.toFixed(3)) })
    }
  }

  const dna = window.__app && window.__app.getDNA ? window.__app.getDNA() : null

  return {
    skullCount,
    faceGroupCount: faceGroups.length,
    parentChain,
    headBoneIsAncestorOfFace: faceGroups.every((g) => {
      let p = g.parent
      while (p) { if (p === headBone) return true; p = p.parent }
      return false
    }),
    headJointY: +headBone.matrixWorld.elements[13].toFixed(3),
    headScaleY: +headBone.matrixWorld.elements[5].toFixed(3),
    skullSpan: [+Math.min(...ys).toFixed(3), +Math.max(...ys).toFixed(3)],
    dnaMorphs: dna ? dna.morphs : null,
    dnaBodyShape: dna ? dna.bodyShape : null,
    dnaFace: dna ? dna.face : null,
    locals,
    features: report
  }
})()
`

if (COUNT > 0) {
  for (let i = 0; i < COUNT; i++) {
    await evaluate('window.__app && window.__app.randomize()')
    await new Promise((r) => setTimeout(r, 300))
  }
}

const state = await evaluate(inspectExpr)
console.log(JSON.stringify(state, null, 2))
ws.close()
