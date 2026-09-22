// Check front/back symmetry of the live skull at the equator.
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
  return heads.map((h) => {
    const pos = h.geometry.attributes.position
    // verts near the equator ring y=1.86, |x|<0.03
    const front = []
    const back = []
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
      if (Math.abs(x) < 0.03 && Math.abs(y - 1.86) < 0.02) {
        if (z > 0) front.push(+z.toFixed(3))
        else back.push(+z.toFixed(3))
      }
    }
    front.sort((a, b) => b - a)
    back.sort((a, b) => a - b)
    return {
      verts: pos.count,
      frontTop3: front.slice(0, 3),
      backTop3: back.slice(0, 3),
      dnaL: dna.bodyShape.headLength
    }
  })
})()
`

console.log(JSON.stringify(await evalExpr(probe), null, 2))
ws.close()
