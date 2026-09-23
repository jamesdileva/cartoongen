const list = await fetch('http://127.0.0.1:9222/json/list').then((r) => r.json())
const page = list.find((t) => t.type === 'page' && t.url.includes('5173'))
if (!page) process.exit(1)
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  ws.onopen = res
  ws.onerror = rej
})
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
  const r = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  })
  if (r.exceptionDetails) {
    throw new Error(
      r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails)
    )
  }
  return r.result?.value
}

const out = await evalExpr(`
(() => {
  const ccm = window.__ccm
  const scene = ccm.getSceneGroup()
  const info = {
    lastAssetIds: ccm.lastAssetIds || ccm._lastAssetIds || 'private',
    bones: [...(ccm.boneMap?.keys?.() || ccm._boneMap?.keys?.() || [])],
    slots: []
  }
  // dump private fields via known names
  const priv = {}
  for (const k of Object.keys(ccm)) priv[k] = typeof ccm[k]
  // Try common private access patterns - CharacterManager fields are TS private (still enumerable sometimes)
  info.fields = Object.getOwnPropertyNames(ccm).filter(n => !n.startsWith('__'))
  info.hasBaseBody = ccm.getHasBodyRendering?.()
  info.sceneChildren = scene.children.map(c => ({
    type: c.type, name: c.name, visible: c.visible,
    kids: c.children.length
  }))

  // material names in scene
  const mats = new Set()
  scene.traverse(o => {
    if (o.isMesh && o.material) {
      const m = Array.isArray(o.material) ? o.material[0] : o.material
      mats.add(m?.name || '(unnamed)')
    }
  })
  info.materialNames = [...mats]

  // Try calling buildProceduralSlotGroup via reflection
  const proto = Object.getPrototypeOf(ccm)
  info.methods = Object.getOwnPropertyNames(proto).filter(n => n.toLowerCase().includes('proc') || n.toLowerCase().includes('garment') || n.toLowerCase().includes('slot'))

  const dna = window.__app.getDNA()
  info.dnaSlots = dna.slots
  return info
})()
`)
console.log(JSON.stringify(out, null, 2))
process.exit(0)
