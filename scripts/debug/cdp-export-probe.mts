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
const listeners = []
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m)
    pending.delete(m.id)
  }
  if (m.method === 'Runtime.exceptionThrown' || m.method === 'Runtime.consoleAPICalled') {
    listeners.forEach((fn) => fn(m))
  }
}
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const i = ++id
    pending.set(i, resolve)
    ws.send(JSON.stringify({ id: i, method, params }))
  })
const evalExpr = async (expression, timeoutMs = 8000) => {
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

await send('Runtime.enable')
const logs = []
listeners.push((m) => {
  if (m.method === 'Runtime.consoleAPICalled') {
    logs.push(
      m.params.type +
        ': ' +
        m.params.args
          .map((a) => a.value ?? a.description ?? JSON.stringify(a))
          .join(' ')
    )
  }
  if (m.method === 'Runtime.exceptionThrown') {
    logs.push('EXC: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text))
  }
})

// Cancel stuck dialog if exporting
const cancelled = await evalExpr(`
(() => {
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Cancel' && b.closest('div')?.style?.textAlign === 'center')
  if (btn) { btn.click(); return 'clicked-cancel' }
  return 'no-cancel'
})()
`)
console.log('cancel:', cancelled)
await new Promise((r) => setTimeout(r, 300))

// Direct exportCharacter timing via module if available, else via scene clone timing
const direct = await evalExpr(
  `
(async () => {
  const t0 = performance.now()
  const sceneGroup = window.__ccm.getSceneGroup()
  const clone = sceneGroup.clone(true)
  const t1 = performance.now()
  let meshCount = 0, skinnedCount = 0, boneRefs = 0, brokenSkel = 0
  clone.traverse(c => {
    if (c.isMesh) meshCount++
    if (c.isSkinnedMesh) {
      skinnedCount++
      if (c.skeleton) boneRefs += c.skeleton.bones.length
      else brokenSkel++
    }
  })
  const t2 = performance.now()
  // try importing ExportManager from app modules - use dynamic vite path
  let exportMs = null, exportErr = null, bufLen = null
  try {
    const mod = await import('/src/renderer/services/ExportManager.ts')
    const dna = window.__app.getDNA()
    const profile = { id: 'glb-standard', name: 'GLB', description: 'bin', binary: true, embedImages: true }
    const te = performance.now()
    const { buffer } = await mod.exportCharacter(sceneGroup, dna, profile, 'probe')
    exportMs = performance.now() - te
    bufLen = buffer?.byteLength ?? null
  } catch (e) {
    exportErr = String(e && e.stack || e)
  }
  return {
    cloneMs: t1 - t0,
    meshCount, skinnedCount, boneRefs, brokenSkel,
    exportMs, exportErr, bufLen,
    totalMs: performance.now() - t0
  }
})()
`,
  30000
)
console.log('direct export:', JSON.stringify(direct, null, 2))

if (logs.length) {
  console.log('--- console ---')
  logs.slice(-30).forEach((l) => console.log(l))
}

process.exit(0)
