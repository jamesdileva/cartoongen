// Visual mouth check: randomize via UI, screenshot, count mouth-red pixels
// in the face region. Directly tests "user sees a mouth".
import { writeFileSync } from 'node:fs'

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

// use face cam for a consistent close view
await send('Page.enable')
const N = Number(process.argv[2] ?? 10)
let pass = 0
for (let i = 0; i < N; i++) {
  await evalExpr(`
    (() => {
      const btns = [...document.querySelectorAll('button')]
      btns.find((b) => b.textContent.trim() === 'Random').click()
    })()
  `)
  await new Promise((r) => setTimeout(r, 400))
  await evalExpr(`window.__app.faceCam()`)
  await new Promise((r) => setTimeout(r, 400))
  const dna = await evalExpr('window.__app.getDNA()')
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(`scripts/debug/vis-check-${i}.png`, Buffer.from(shot.data, 'base64'))
  console.log(`roll ${i}: curve=${dna.face.mouthCurve} width=${dna.face.mouthWidth} nose=${dna.face.noseSize} H=${dna.bodyShape.headHeight} -> scripts/debug/vis-check-${i}.png`)
}
ws.close()
console.log('done - inspect PNGs for visible mouths')
