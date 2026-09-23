// Sprint 20 live check: equip proc:tshirt + proc:jeans, mutate morphs, screenshot.
const list = await fetch('http://127.0.0.1:9222/json/list').then((r) => r.json())
const page = list.find((t) => t.type === 'page' && t.url.includes('5173'))
if (!page) {
  console.error(
    'page not found',
    list.map((t) => t.url)
  )
  process.exit(1)
}

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
    throw new Error(r.exceptionDetails.exception?.description ?? 'page exception')
  }
  return r.result?.value
}

await send('Page.enable')
await send('Runtime.enable')

// Wait for stores
for (let i = 0; i < 20; i++) {
  const ready = await evalExpr(
    `!!(window.__ccm && window.__app && window.__app.getDNA && document.querySelector('button'))`
  )
  if (ready) break
  await new Promise((r) => setTimeout(r, 250))
}

const equipResult = await evalExpr(`
(() => {
  const ccm = window.__ccm
  if (!ccm) return { error: 'no __ccm' }
  // Use character store via React - expose path: set slots through __app if present
  const stores = window.__stores
  // Fallback: click UI tabs + cards
  const clickText = (sel, text) => {
    const el = [...document.querySelectorAll(sel)].find(e => e.textContent.trim().toLowerCase().includes(text.toLowerCase()))
    if (el) { el.click(); return true }
    return false
  }
  // Open Shirt tab
  const shirtTab = [...document.querySelectorAll('div')].find(d => d.textContent.trim() === 'Shirt' && d.style.cursor === 'pointer')
  const pantsTab = [...document.querySelectorAll('div')].find(d => d.textContent.trim() === 'Pants' && d.style.cursor === 'pointer')
  return {
    hasCcm: !!ccm,
    hasApp: !!(window.__app && window.__app.getDNA),
    shirtTab: !!shirtTab,
    pantsTab: !!pantsTab,
    buttons: [...document.querySelectorAll('button')].map(b => b.textContent.trim()).slice(0, 20)
  }
})()
`)
console.log('probe', JSON.stringify(equipResult, null, 2))

// Prefer programmatic store access if we can find zustand via React fiber - instead use __app.setDNA
const setResult = await evalExpr(`
(() => {
  if (!window.__app || !window.__app.getDNA) return { error: 'no __app' }
  const dna = window.__app.getDNA()
  if (!dna) return { error: 'no dna' }
  const next = {
    ...dna,
    slots: { ...dna.slots, shirt: 'proc:tshirt', pants: 'proc:jeans' },
    colors: { ...dna.colors, cloth: '#3366cc' },
    morphs: { ...dna.morphs, bellySize: 0.8, bust: dna.morphs?.bust ?? 0.4, butt: 0.7 }
  }
  window.__app.setDNA(next)
  return { ok: true, shirt: next.slots.shirt, pants: next.slots.pants }
})()
`)
console.log('setDNA', JSON.stringify(setResult))

await new Promise((r) => setTimeout(r, 800))

const inspect = await evalExpr(`
(() => {
  const ccm = window.__ccm
  const scene = ccm.getSceneGroup()
  const cloth = []
  scene.traverse((o) => {
    if (o.isSkinnedMesh && o.material && o.material.name === 'cloth') {
      const box = new (o.boundingBox?.constructor || Object)()
      cloth.push({
        name: o.name || '(unnamed)',
        verts: o.geometry.attributes.position.count,
        renderOrder: o.renderOrder,
        bones: o.skeleton.bones.map(b => b.name).slice(0, 8),
        visible: o.visible && o.parent?.visible !== false
      })
    }
  })
  // Also count any mesh whose material color matches cloth default path
  let clothMatMeshes = 0
  scene.traverse((o) => {
    if (o.isMesh && o.material && !Array.isArray(o.material) && o.material.name === 'cloth') clothMatMeshes++
  })
  const dna = window.__app.getDNA()
  return {
    clothSkinned: cloth.length,
    clothMatMeshes,
    shirt: dna.slots.shirt,
    pants: dna.slots.pants,
    belly: dna.morphs.bellySize,
    cloth: cloth[0] || null
  }
})()
`)
console.log('inspect', JSON.stringify(inspect, null, 2))

// Full-body camera (keyboard preset)
await evalExpr(`
(() => {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }))
})()
`)
await new Promise((r) => setTimeout(r, 400))

const shot = await send('Page.captureScreenshot', { format: 'png' })
const { writeFileSync } = await import('node:fs')
writeFileSync('scripts/debug/sprint20-garments.png', Buffer.from(shot.data, 'base64'))
console.log('wrote scripts/debug/sprint20-garments.png')

// Belly morph change rebuild check
await evalExpr(`
(() => {
  const dna = window.__app.getDNA()
  window.__app.setDNA({ ...dna, morphs: { ...dna.morphs, bellySize: 0.1 } })
})()
`)
await new Promise((r) => setTimeout(r, 500))

const afterBelly = await evalExpr(`
(() => {
  const scene = window.__ccm.getSceneGroup()
  let clothSkinned = 0
  scene.traverse((o) => {
    if (o.isSkinnedMesh && o.material && o.material.name === 'cloth') clothSkinned++
  })
  return { clothSkinned, belly: window.__app.getDNA().morphs.bellySize }
})()
`)
console.log('afterBelly', JSON.stringify(afterBelly))

const shot2 = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync('scripts/debug/sprint20-garments-lean.png', Buffer.from(shot2.data, 'base64'))
console.log('wrote scripts/debug/sprint20-garments-lean.png')

process.exit(0)
