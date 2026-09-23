const list = await fetch('http://127.0.0.1:9222/json/list').then((r) => r.json())
const page = list.find((t) => t.type === 'page' && t.url.includes('517'))
console.log('page', page?.url)
if (!page) process.exit(1)
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

await send('Page.enable')
console.log('reloading...')
await send('Page.reload', { ignoreCache: true })
await new Promise((r) => setTimeout(r, 4000))

const ready = await evalExpr(`!!(window.__app && window.__ccm && window.__app.getDNA())`)
console.log('ready', ready)

const equip = await evalExpr(`
(async () => {
  for (let i = 0; i < 30; i++) {
    if (window.__app?.getDNA?.() && window.__ccm) break
    await new Promise(r => setTimeout(r, 200))
  }
  const dna = window.__app.getDNA()
  window.__app.setDNA({
    ...dna,
    slots: { ...dna.slots, shirt: 'proc:tshirt', pants: 'proc:jeans' },
    colors: { ...dna.colors, cloth: '#3366cc' },
    morphs: { ...dna.morphs, bellySize: 0.8, bust: 0.5, butt: 0.8 }
  })
  await new Promise(r => setTimeout(r, 700))
  window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }))
  await new Promise(r => setTimeout(r, 500))
  const scene = window.__ccm.getSceneGroup()
  const groups = scene.children.filter(c => c.type === 'Group' && c.children.some(ch => ch.isSkinnedMesh))
  return {
    groups: groups.length,
    shirt: window.__app.getDNA().slots.shirt,
    pants: window.__app.getDNA().slots.pants,
    clothColor: (() => {
      let c = null
      scene.traverse(o => {
        if (!c && o.isMesh && o.material?.name === 'cloth') c = '#' + o.material.color.getHexString()
      })
      return c
    })()
  }
})()
`)
console.log('equip', JSON.stringify(equip))

const { writeFileSync } = await import('node:fs')
const shot = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync('scripts/debug/sprint20-garments-fixed.png', Buffer.from(shot.data, 'base64'))
console.log('front shot written')

await evalExpr(`window.dispatchEvent(new KeyboardEvent('keydown', { key: '3', bubbles: true }))`)
await new Promise((r) => setTimeout(r, 500))
const shot2 = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync('scripts/debug/sprint20-garments-side.png', Buffer.from(shot2.data, 'base64'))
console.log('side shot written')

process.exit(0)
