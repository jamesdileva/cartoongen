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
const evalExpr = async (expression, timeoutMs = 90000) => {
  let timer
  const timeout = new Promise((_, rej) => {
    timer = setTimeout(() => rej(new Error('eval timeout')), timeoutMs)
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

// Close any open dialog
await evalExpr(`
(() => {
  for (const b of [...document.querySelectorAll('button')]) {
    if (['Close', 'Cancel'].includes(b.textContent.trim()) && b.offsetParent !== null) {
      // only close modal-looking buttons
    }
  }
  // click overlay to close
  const overlay = [...document.querySelectorAll('div')].find(d => getComputedStyle(d).position === 'fixed' && d.style.zIndex !== '' && d !== document.body)
  if (overlay) overlay.click()
  return true
})()
`)
await new Promise((r) => setTimeout(r, 400))

// Ensure named character + garments
const prep = await evalExpr(`
(async () => {
  const dna = window.__app.getDNA()
  window.__app.setDNA({
    ...dna,
    name: 'Sprint20Proof',
    slots: { ...dna.slots, shirt: 'proc:tshirt', pants: 'proc:jeans' },
    morphs: { ...dna.morphs, bellySize: 0.7, bust: 0.5, butt: 0.6 }
  })
  await new Promise(r => setTimeout(r, 700))
  return {
    name: window.__app.getDNA().name,
    slots: window.__app.getDNA().slots,
    hasCharacterName: !!window.__ccm
  }
})()
`)
console.log('prep', JSON.stringify(prep))

// Character name in store - check via react root is hard; export uses currentCharacterName
// which may be null if never saved. Force via store if possible.
const nameState = await evalExpr(`
(() => {
  // Try to find if Export button is disabled
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Export')
  return { exportDisabled: btn?.disabled ?? null }
})()
`)
console.log('toolbar', JSON.stringify(nameState))

await evalExpr(`
(() => {
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Export')
  if (!btn) throw new Error('no Export')
  if (btn.disabled) throw new Error('Export disabled - no characterName')
  btn.click()
})()
`)
await new Promise((r) => setTimeout(r, 800))

const formInfo = await evalExpr(`
(() => {
  const text = document.body.innerText
  return {
    hasForm: text.includes('Export Character'),
    hasExporting: text.includes('Exporting'),
    exportBtns: [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Export').map(b => ({ dis: b.disabled }))
  }
})()
`)
console.log('dialog', JSON.stringify(formInfo))

// Click dialog Export
await evalExpr(`
(() => {
  const all = [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Export' && !b.disabled)
  if (!all.length) throw new Error('no enabled Export in dialog')
  all[all.length - 1].click()
})()
`)

let last = null
for (let i = 0; i < 45; i++) {
  await new Promise((r) => setTimeout(r, 500))
  last = await evalExpr(`
(() => {
  const text = document.body.innerText
  if (text.includes('Exporting...')) return { s: 'exporting' }
  if (text.includes('Export Successful')) return { s: 'ok', p: text.match(/[A-Za-z]:[^\\n]*\\.glb/)?.[0] }
  if (text.includes('Export Failed')) return { s: 'err', d: text.match(/Export Failed[\\s\\S]{0,500}/)?.[0] }
  if (text.includes('Export Character')) return { s: 'form' }
  return { s: '?', t: text.slice(-150) }
})()
`)
  if (last.s !== 'exporting') break
}
console.log('final', JSON.stringify(last, null, 2))

const shot = await send('Page.captureScreenshot', { format: 'png' })
if (shot.data) {
  const { writeFileSync } = await import('node:fs')
  writeFileSync('scripts/debug/sprint20-export-success.png', Buffer.from(shot.data, 'base64'))
}

process.exit(0)
