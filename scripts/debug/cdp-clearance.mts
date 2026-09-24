const list = await fetch('http://127.0.0.1:9222/json/list').then((r) => r.json())
const page = list.find((t) => t.type === 'page' && t.url.includes('5173'))
if (!page) {
  console.error('no page')
  process.exit(1)
}
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  ws.onopen = res
  ws.onerror = rej
})
let id = 0
const pending = new Map()
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m.result)
    pending.delete(m.id)
  }
}
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const i = ++id
    pending.set(i, resolve)
    ws.send(JSON.stringify({ id: i, method, params }))
  })
const evalExpr = async (expression) => {
  const r = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  })
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description ?? 'exception')
  }
  return r.result?.value
}

const { writeFileSync } = await import('node:fs')

// Ensure procedural garments equipped, then randomize N times with front/side shots.
const setup = await evalExpr(`
(async () => {
  const dna = window.__app.getDNA()
  if (!dna) return { error: 'no dna' }
  window.__app.setDNA({
    ...dna,
    slots: { ...dna.slots, shirt: 'proc:tshirt', pants: 'proc:jeans' }
  })
  await new Promise(r => setTimeout(r, 400))
  return { shirt: window.__app.getDNA().slots.shirt, pants: window.__app.getDNA().slots.pants }
})()
`)
console.log('setup', JSON.stringify(setup))

const rolls = 6
for (let i = 0; i < rolls; i++) {
  const info = await evalExpr(`
  (async () => {
    window.__app.randomize()
    await new Promise(r => setTimeout(r, 600))
    // re-equip garments if randomize cleared/changed them
    const dna = window.__app.getDNA()
    if (dna.slots.shirt !== 'proc:tshirt' || dna.slots.pants !== 'proc:jeans') {
      window.__app.setDNA({
        ...dna,
        slots: { ...dna.slots, shirt: 'proc:tshirt', pants: 'proc:jeans' }
      })
      await new Promise(r => setTimeout(r, 400))
    }
    const d = window.__app.getDNA()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }))
    await new Promise(r => setTimeout(r, 350))
    return {
      morphs: {
        bust: d.morphs.bust, butt: d.morphs.butt, belly: d.morphs.bellySize,
        shoulderWidth: d.morphs.shoulderWidth, muscleMass: d.morphs.muscleMass
      },
      shape: d.bodyShape,
      shirt: d.slots.shirt,
      pants: d.slots.pants
    }
  })()
  `)
  const front = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(`scripts/debug/clearance-front-${i}.png`, Buffer.from(front.data, 'base64'))

  await evalExpr(`
  (async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '4', bubbles: true }))
    await new Promise(r => setTimeout(r, 350))
  })()
  `)
  const back = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(`scripts/debug/clearance-back-${i}.png`, Buffer.from(back.data, 'base64'))

  await evalExpr(`
  (async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '3', bubbles: true }))
    await new Promise(r => setTimeout(r, 350))
  })()
  `)
  const side = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(`scripts/debug/clearance-side-${i}.png`, Buffer.from(side.data, 'base64'))

  console.log(`roll ${i}`, JSON.stringify(info))
}

console.log('done')
process.exit(0)
