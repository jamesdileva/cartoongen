// Dump ALL live skull rest verts to a file for offline diff.
import { writeFileSync } from 'node:fs'

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
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'page exception')
  return r.result?.value
}

const dump = `
(() => {
  const ccm = window.__ccm
  const scene = ccm.getSceneGroup()
  const heads = []
  scene.traverse((o) => {
    if (o.isSkinnedMesh && o.skeleton && o.skeleton.bones.some((b) => b && b.name === 'Head')) {
      heads.push(o)
    }
  })
  return heads.map((h) => {
    const pos = h.geometry.attributes.position
    const arr = []
    for (let i = 0; i < pos.count; i++) arr.push([+pos.getX(i).toFixed(4), +pos.getY(i).toFixed(4), +pos.getZ(i).toFixed(4)])
    return { verts: pos.count, points: arr }
  })
})()
`

const data = await evalExpr(dump)
writeFileSync('scripts/debug/live-skull.json', JSON.stringify(data))
console.log('heads:', data.length, 'verts:', data.map((h) => h.verts).join(','))
ws.close()
