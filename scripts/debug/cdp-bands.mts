// Dump live skull rest verts in the mouth region, grouped by z.
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
  let skull = null
  scene.traverse((o) => {
    if (o.isSkinnedMesh && o.geometry.attributes.position.count > 400 &&
        o.skeleton.bones.some((b) => b && b.name === 'Head')) {
      if (!skull || o.geometry.attributes.position.count > skull.geometry.attributes.position.count) skull = o
    }
  })
  const pos = skull.geometry.attributes.position
  const si = skull.geometry.attributes.skinIndex.array
  const buckets = {}
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    if (Math.abs(x) < 0.08 && y > 1.6 && y < 1.82) {
      const band = y.toFixed(2)
      if (!buckets[band]) buckets[band] = { count: 0, maxZ: -1e9, names: {} }
      buckets[band].count++
      if (z > buckets[band].maxZ) buckets[band].maxZ = z
      const key = skull.skeleton.bones[si[i * 4]].name + ':' + si[i * 4]
      buckets[band].names[key] = (buckets[band].names[key] || 0) + 1
    }
  }
  for (const k of Object.keys(buckets)) buckets[k].maxZ = +buckets[k].maxZ.toFixed(3)
  return { skullVerts: pos.count, buckets }
})()
`

console.log(JSON.stringify(await evalExpr(probe), null, 2))
ws.close()
