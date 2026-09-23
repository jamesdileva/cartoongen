const list = await fetch('http://127.0.0.1:9222/json/list').then((r) => r.json())
const page = list.find((t) => t.type === 'page' && t.url.includes('5173'))
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
    pending.get(m.id)(m)
    pending.delete(m.id)
  }
}
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const i = ++id
    pending.set(i, resolve)
    ws.send(JSON.stringify({ id: i, method, params }))
  })
const evalExpr = async (expression, timeoutMs = 60000) => {
  let timer
  const timeout = new Promise((_, rej) => {
    timer = setTimeout(() => rej(new Error('eval timeout ' + timeoutMs + 'ms')), timeoutMs)
  })
  try {
    const r = await Promise.race([
      send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
        userGesture: true
      }),
      timeout
    ])
    if (r.result?.exceptionDetails) {
      const d = r.result.exceptionDetails
      throw new Error(d.exception?.description || d.text || 'exception')
    }
    return r.result?.result?.value
  } finally {
    clearTimeout(timer)
  }
}

// Force reload to pick up ExportManager changes
await send('Page.reload', { ignoreCache: true })
await new Promise((r) => setTimeout(r, 4000))

const ready = await evalExpr(`!!(window.__app && window.__ccm)`)
console.log('app ready:', ready)

// Direct exportCharacter probe (module path via vite)
const probe = await evalExpr(`
(async () => {
  const t0 = performance.now()
  const sceneGroup = window.__ccm.getSceneGroup()
  let helperCount = 0
  sceneGroup.traverse(c => { if (c.isSkeletonHelper || c.isLineSegments) helperCount++ })
  const mod = await import('/src/renderer/services/ExportManager.ts')
  const dna = window.__app.getDNA()
  const profile = { id: 'glb-standard', name: 'GLB', description: 'bin', binary: true, embedImages: true }
  const te = performance.now()
  const { buffer, validation } = await mod.exportCharacter(sceneGroup, dna, profile, 'probe')
  const exportMs = performance.now() - te
  const bytes = new Uint8Array(buffer)
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])
  let helpersAfter = 0
  sceneGroup.traverse(c => { if (c.isSkeletonHelper || c.isLineSegments) helpersAfter++ })
  return {
    exportMs,
    bufLen: buffer.byteLength,
    magic,
    validation,
    helperCount,
    helpersAfter,
    totalMs: performance.now() - t0
  }
})()
`)
console.log('probe:', JSON.stringify(probe, null, 2))

// Equip garments + open dialog + export via UI
await evalExpr(`
(async () => {
  const dna = window.__app.getDNA()
  window.__app.setDNA({
    ...dna,
    slots: { ...dna.slots, shirt: 'proc:tshirt', pants: 'proc:jeans' },
    morphs: { ...dna.morphs, bellySize: 0.7, bust: 0.5, butt: 0.6 }
  })
  await new Promise(r => setTimeout(r, 600))
})()
`)

await evalExpr(`
(() => {
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Export')
  if (!btn) throw new Error('no Export button')
  btn.click()
})()
`)
await new Promise((r) => setTimeout(r, 700))

const clicked = await evalExpr(`
(() => {
  const all = [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Export' && !b.disabled)
  if (!all.length) return false
  all[all.length - 1].click()
  return true
})()
`)
console.log('ui export clicked:', clicked)

let result = null
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 500))
  result = await evalExpr(`
(() => {
  const text = document.body.innerText
  if (text.includes('Exporting...')) return { state: 'exporting' }
  if (text.includes('Export Successful')) {
    const m = text.match(/[A-Za-z]:[^\\n]*\\.glb/)
    return { state: 'success', path: m ? m[0] : text.slice(0, 400) }
  }
  if (text.includes('Export Failed')) {
    return { state: 'error', detail: text.match(/Export Failed[\\s\\S]{0,400}/)?.[0] }
  }
  if (text.includes('Export Character')) return { state: 'form' }
  return { state: 'unknown', tail: text.slice(-250) }
})()
`)
  if (result && result.state !== 'exporting' && result.state !== 'unknown') break
}
console.log('ui export result:', JSON.stringify(result, null, 2))

try {
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  if (shot?.data) {
    const { writeFileSync } = await import('node:fs')
    writeFileSync('scripts/debug/sprint20-export-final.png', Buffer.from(shot.data, 'base64'))
    console.log('screenshot written')
  }
} catch (e) {
  console.log('screenshot failed:', e)
}

process.exit(0)
