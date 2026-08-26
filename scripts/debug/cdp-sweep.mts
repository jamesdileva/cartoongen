// Randomize N times via CDP; verify structural invariants after each roll:
//   1. head bone world x/z scale == 1 (ancestor xz-squat bug)
//   2. live head mesh max depth == dna headLength (stale geometry bug)
// Per-feature surface checks live in unit tests (FaceFeatures.test.ts);
// visual verification via screenshots (cdp-capture.mts).
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

await send('Page.enable')

const checkExpr = `
(() => {
  const ccm = window.__ccm
  if (!ccm) return { error: 'no __ccm' }
  const scene = ccm.getSceneGroup()
  let skull = null
  scene.traverse((o) => {
    if (o.isSkinnedMesh && o.geometry.attributes.position.count > 400 &&
        o.skeleton.bones.some((b) => b && b.name === 'Head')) {
      if (!skull || o.geometry.attributes.position.count > skull.geometry.attributes.position.count) skull = o
    }
  })
  if (!skull) return { error: 'no skull mesh' }
  const headBone = skull.skeleton.bones.find((b) => b.name === 'Head')
  const e = headBone.matrixWorld.elements
  const pos = skull.geometry.attributes.position
  let meshMaxZ = -1e9
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(pos.getX(i)) < 0.02 && pos.getZ(i) > meshMaxZ) meshMaxZ = pos.getZ(i)
  }
  const dna = window.__app && window.__app.getDNA ? window.__app.getDNA() : null
  return {
    scaleX: +e[0].toFixed(3),
    scaleY: +e[5].toFixed(3),
    scaleZ: +e[10].toFixed(3),
    meshL: +(meshMaxZ - 0.005).toFixed(3),
    dnaL: dna && dna.bodyShape ? +dna.bodyShape.headLength.toFixed(3) : null,
    dnaH: dna && dna.bodyShape ? +dna.bodyShape.headHeight.toFixed(3) : null
  }
})()
`

let bad = 0
const N = Number(process.argv[2] ?? 15)
const viaUI = process.argv.includes('--ui')
const { writeFileSync } = await import('node:fs')
for (let i = 0; i < N; i++) {
  if (viaUI) {
    await evalExpr(`
      (() => {
        const btns = [...document.querySelectorAll('button')]
        const b = btns.find((b) => b.textContent.trim() === 'Random')
        if (!b) throw new Error('Random button not found')
        b.click()
      })()
    `)
  } else {
    await evalExpr('window.__app.randomize()')
  }
  await new Promise((r) => setTimeout(r, 250))
  const res = await evalExpr(checkExpr)
  const squash = Math.abs(res.scaleX - 1) > 0.01 || Math.abs(res.scaleZ - 1) > 0.01
  const stale = res.dnaL !== null && Math.abs(res.meshL - res.dnaL) > 0.005
  const flag = res.error ? 'ERR ' : squash || stale ? 'BAD ' : 'ok  '
  if (flag !== 'ok  ') {
    bad++
    console.log(flag, JSON.stringify(res))
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(`scripts/debug/sweep-bad-${i}.png`, Buffer.from(shot.data, 'base64'))
    const dna = await evalExpr('window.__app.getDNA()')
    writeFileSync(`scripts/debug/sweep-bad-${i}.dna.json`, JSON.stringify(dna, null, 2))
  }
}
console.log(`\n${N - bad}/${N} rolls clean`)
ws.close()
