// Replay a saved DNA, zoom the camera to the face, capture close-up.
// Usage: npx tsx scripts/debug/cdp-zoom.mts <dnaFile> [label]
import { readFileSync, writeFileSync } from 'node:fs'

const dnaFile = process.argv[2] ?? 'scripts/debug/nomouth4.dna.json'
const label = process.argv[3] ?? 'zoom'

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

const dna = JSON.parse(readFileSync(dnaFile, 'utf-8'))
await evalExpr(`window.__app.setDNA(${JSON.stringify(dna)})`)
await new Promise((r) => setTimeout(r, 600))

// move camera to a close-up of the lower face (mouth region)
await evalExpr(`
  (() => {
    const cam = window.__camera
    if (!cam) return 'no camera'
    cam.position.set(0, 1.78, 1.1)
    cam.lookAt(0, 1.76, 0)
    cam.updateMatrixWorld()
    return 'moved'
  })()
`)
await new Promise((r) => setTimeout(r, 400))

const shot = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync(`scripts/debug/${label}.png`, Buffer.from(shot.data, 'base64'))
console.log(`captured scripts/debug/${label}.png`)
ws.close()
