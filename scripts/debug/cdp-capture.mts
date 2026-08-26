// Capture full state of the live app: screenshot + DNA + geometry metrics.
// Run while the broken character is on screen. Usage: npx tsx scripts/debug/cdp-capture.mts [label]

import { writeFileSync } from 'node:fs'

const label = process.argv[2] ?? 'capture'

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

const dna = await evalExpr('window.__app.getDNA()')
writeFileSync(`scripts/debug/${label}.dna.json`, JSON.stringify(dna, null, 2))

const shot = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync(`scripts/debug/${label}.png`, Buffer.from(shot.data, 'base64'))

console.log(`captured: scripts/debug/${label}.dna.json + ${label}.png`)
console.log('morphs:', JSON.stringify(dna.morphs))
console.log('face:', JSON.stringify(dna.face))
ws.close()
