// Dump live skull vert stats: total count, verts in the deep band, and
// whether fresh-geometry positions exist alongside stale ones.
const list = await fetch('http://127.0.0.1:9222/json/list').then((r) => r.json())
const page = list.find((t) => t.type === 'page' && t.url.includes('5173'))
if (!page) { console.error('app page not found'); process.exit(1) }

const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })

let msgId = 0
const pending = new Map()
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    const p = pending.get(msg.id)
    pending.delete(msg.id)
    p(msg.result)
  }
}
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++msgId
    pending.set(id, resolve)
    ws.send(JSON.stringify({ id, method, params }))
  })

const evalExpr = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'page exception')
  return r.result?.value
}

const probe = `
(() => {
  const ccm = window.__ccm
  const scene = ccm.getSceneGroup()
  const heads = []
  scene.traverse((o) => {
    if (o.isSkinnedMesh && o.skeleton && o.skeleton.bones.some((b) => b && b.name === 'Head')) {
      heads.push(o)
    }
  })
  const dna = window.__app.getDNA()
  const info = heads.map((h) => {
    const pos = h.geometry.attributes.position
    let maxZ = -1e9
    let minZ = 1e9
    let minY = 1e9
    let maxY = -1e9
    let deepBandCount = 0
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
      if (z > maxZ) maxZ = z
      if (z < minZ) minZ = z
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      if (y > 1.68 && y < 1.715 && Math.abs(x) < 0.015 && z > 0.17) deepBandCount++
    }
    return {
      name: h.name,
      verts: pos.count,
      maxZ: +maxZ.toFixed(3),
      minZ: +minZ.toFixed(3),
      minY: +minY.toFixed(3),
      maxY: +maxY.toFixed(3),
      deepBandCount,
      skeletonBones: h.skeleton.bones.length
    }
  })
  return { headMeshCount: heads.length, dnaL: dna.bodyShape.headLength, dnaH: dna.bodyShape.headHeight, info }
})()
`

console.log(JSON.stringify(await evalExpr(probe), null, 2))
ws.close()
