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

// Open Export dialog
await evalExpr(`
(() => {
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Export')
  if (!btn) throw new Error('no Export button')
  btn.click()
})()
`)
await new Promise((r) => setTimeout(r, 500))

const dialogState = await evalExpr(`
(() => {
  const text = document.body.innerText
  return {
    hasDialog: text.includes('Export') && (text.includes('GLB') || text.includes('Profile') || text.includes('validation')),
    snippet: text.slice(0, 500)
  }
})()
`)
console.log('dialog', JSON.stringify(dialogState, null, 2))

// Look for Export/confirm button inside dialog
const clickResult = await evalExpr(`
(() => {
  const buttons = [...document.querySelectorAll('button')].map(b => b.textContent.trim())
  // Prefer a button that is not the toolbar Export
  const candidates = buttons.filter(t => t && t !== 'Export' && t !== 'Cancel')
  // Find visible dialog buttons
  const overlay = [...document.querySelectorAll('div')].find(d => d.style.position === 'fixed' && d.style.zIndex)
  const dialogButtons = overlay ? [...overlay.querySelectorAll('button')].map(b => ({ text: b.textContent.trim(), disabled: b.disabled })) : []
  return { allButtons: buttons, dialogButtons }
})()
`)
console.log('buttons', JSON.stringify(clickResult, null, 2))

// Click the profile export execute button (usually labeled Export or similar in dialog)
const execute = await evalExpr(`
(() => {
  const overlay = [...document.querySelectorAll('div')].find(d => d.style.position === 'fixed' && d.style.zIndex)
  if (!overlay) return { error: 'no overlay' }
  const btn = [...overlay.querySelectorAll('button')].find(b => !b.disabled && /export|save|write/i.test(b.textContent) && !/cancel/i.test(b.textContent))
    || [...overlay.querySelectorAll('button')].find(b => !b.disabled && b.textContent.trim() === 'Export')
  if (!btn) return { error: 'no execute', texts: [...overlay.querySelectorAll('button')].map(b => b.textContent.trim()) }
  btn.click()
  return { clicked: btn.textContent.trim() }
})()
`)
console.log('execute', JSON.stringify(execute))

await new Promise((r) => setTimeout(r, 1500))

const after = await evalExpr(`
(() => {
  const text = document.body.innerText
  const hasSuccess = /export(ed| complete| success)|\.glb|exports\\//i.test(text)
  return { hasSuccess, snippet: text.slice(0, 800) }
})()
`)
console.log('after', JSON.stringify(after, null, 2))

const { writeFileSync } = await import('node:fs')
const shot = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync('scripts/debug/sprint20-export.png', Buffer.from(shot.data, 'base64'))
console.log('export shot written')

process.exit(0)
