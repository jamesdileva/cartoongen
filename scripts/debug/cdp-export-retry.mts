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
const evalExpr = async (expression, timeoutMs = 45000) => {
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

// Ensure garments equipped
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

// Open export dialog
await evalExpr(`
(() => {
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Export')
  if (!btn) throw new Error('no Export button')
  btn.click()
})()
`)
await new Promise((r) => setTimeout(r, 600))

const hasDialog = await evalExpr(`document.body.innerText.includes('Export Character') || document.body.innerText.includes('Exporting')`)
console.log('dialog open:', hasDialog)

// Click Export in dialog
const clicked = await evalExpr(`
(() => {
  const overlays = [...document.querySelectorAll('div')].filter(d => getComputedStyle(d).position === 'fixed' && d.style.zIndex !== '')
  for (const overlay of overlays) {
    const btn = [...overlay.querySelectorAll('button')].find(b => b.textContent.trim() === 'Export' && !b.disabled)
    if (btn) { btn.click(); return true }
  }
  // fallback: last Export button
  const all = [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Export' && !b.disabled)
  const btn = all[all.length - 1]
  if (btn) { btn.click(); return true }
  return false
})()
`)
console.log('clicked export:', clicked)

// Poll for success/error
let result = null
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 500))
  result = await evalExpr(`
(() => {
  const text = document.body.innerText
  if (text.includes('Exporting...')) return { state: 'exporting' }
  if (text.includes('Export Successful')) {
    const m = text.match(/[^\\n]*\\.glb/)
    return { state: 'success', path: m ? m[0] : 'no-path-in-text' }
  }
  if (text.includes('Export Failed')) {
    const m = text.match(/Export Failed[\\s\\S]{0,300}/)
    return { state: 'error', detail: m ? m[0] : 'unknown' }
  }
  if (text.includes('Export Character')) return { state: 'form' }
  return { state: 'unknown', tail: text.slice(-200) }
})()
`)
  if (result.state === 'success' || result.state === 'error' || result.state === 'form') break
}
console.log('export result:', JSON.stringify(result, null, 2))

const { writeFileSync } = await import('node:fs')
const shot = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync('scripts/debug/sprint20-export-final.png', Buffer.from(shot.data, 'base64'))
console.log('screenshot written')

process.exit(0)
