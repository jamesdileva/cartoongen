// Dump world bboxes of ALL meshes overlapping the mouth screen region.
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
    if (!o.isMesh && !o.isSkinnedMesh) return
    const pos = o.geometry.attributes.position
    const m = o.matrixWorld.elements
    const box = { min: [1e9,1e9,1e9], max: [-1e9,-1e9,-1e9] }
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
      const wx = m[0]*x + m[4]*y + m[8]*z + m[12]
      const wy = m[1]*x + m[5]*y + m[9]*z + m[13]
      const wz = m[2]*x + m[6]*y + m[10]*z + m[14]
      // mouth screen region: |x|<0.09, y in [1.70, 1.78]
      if (Math.abs(wx) < 0.09 && wy > 1.69 && wy < 1.79) {
        for (let a = 0; a < 3; a++) {
          const v = [wx,wy,wz][a]
          if (v < box.min[a]) box.min[a] = v
          if (v > box.max[a]) box.max[a] = v
        }
      }
    }
    if (box.max[0] > -1e8) {
      out.push({
        name: o.name || o.type,
        verts: pos.count,
        min: box.min.map((n) => +n.toFixed(3)),
        max: box.max.map((n) => +n.toFixed(3))
      })
    }
  })
  return out
})()
`

console.log(JSON.stringify(await evalExpr(probe), null, 2))
ws.close()
