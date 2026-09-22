// Inspect the live mouth tube geometry for NaN/degenerate data.
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
  const out = []
  scene.traverse((o) => {
    if (!o.isMesh || o.name !== 'Mouth') return
    const pos = o.geometry.attributes.position
    const norm = o.geometry.attributes.normal
    let nanPos = 0, nanNorm = 0, zeroNorm = 0
    let minY = 1e9, maxY = -1e9, minZ = 1e9, maxZ = -1e9
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
      if (!isFinite(x) || !isFinite(y) || !isFinite(z)) { nanPos++; continue }
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      if (z < minZ) minZ = z
      if (z > maxZ) maxZ = z
      if (norm) {
        const nx = norm.getX(i), ny = norm.getY(i), nz = norm.getZ(i)
        if (!isFinite(nx) || !isFinite(ny) || !isFinite(nz)) nanNorm++
        else if (nx === 0 && ny === 0 && nz === 0) zeroNorm++
      }
    }
    out.push({
      verts: pos.count,
      indexed: !!o.geometry.index,
      indexCount: o.geometry.index ? o.geometry.index.count : 0,
      nanPos, nanNorm, zeroNorm,
      localY: [minY, maxY].map((n) => +n.toFixed(4)),
      localZ: [minZ, maxZ].map((n) => +n.toFixed(4)),
      drawRange: [o.geometry.drawRange.start, o.geometry.drawRange.count]
    })
  })
  return out
})()
`

console.log(JSON.stringify(await evalExpr(probe), null, 2))
ws.close()
