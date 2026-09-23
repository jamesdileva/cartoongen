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

// Cancel any stuck dialog
await evalExpr(`
(() => {
  const text = document.body.innerText
  if (text.includes('Exporting...')) {
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Cancel')
    if (btn) { btn.click(); return 'cancelled' }
  }
  if (text.includes('Export Successful') || text.includes('Export Failed') || text.includes('Export Character')) {
    const close = [...document.querySelectorAll('button')].find(b => ['Close','Cancel'].includes(b.textContent.trim()))
    if (close) { close.click(); return 'closed' }
  }
  return 'no-dialog'
})()
`)
await new Promise((r) => setTimeout(r, 300))

// Step 1: clone only
const cloneStep = await evalExpr(`
(() => {
  const t0 = performance.now()
  const sceneGroup = window.__ccm.getSceneGroup()
  let helpers = 0
  sceneGroup.traverse(c => { if (c.isSkeletonHelper || c.isLineSegments) helpers++ })
  const detached = []
  sceneGroup.traverse(child => {
    if (child.isSkeletonHelper || child.isLineSegments) {
      if (child.parent) detached.push({ obj: child, parent: child.parent, index: child.parent.children.indexOf(child) })
    }
  })
  for (const d of detached) d.parent.remove(d.obj)
  let clone
  try {
    clone = sceneGroup.clone(true)
  } finally {
    for (const d of detached) {
      const at = Math.min(d.index, d.parent.children.length)
      d.parent.children.splice(at, 0, d.obj)
      d.obj.parent = d.parent
    }
  }
  return { ok: !!clone, helpers, cloneMs: performance.now() - t0, children: clone?.children?.length }
})()
`)
console.log('clone:', JSON.stringify(cloneStep))

// Step 2: full exportCharacter
const expStep = await evalExpr(`
(async () => {
  const t0 = performance.now()
  const sceneGroup = window.__ccm.getSceneGroup()
  const dna = window.__app.getDNA()
  const profile = { id: 'glb-standard', name: 'GLB', description: 'bin', binary: true, embedImages: true }
  // Import the same module the dialog uses via vite dependency graph
  const mod = await import('/src/renderer/services/ExportManager.ts').catch(() => null)
  if (!mod) return { error: 'import failed' }
  const { buffer } = await mod.exportCharacter(sceneGroup, dna, profile, 'probe')
  return { ok: true, ms: performance.now() - t0, len: buffer.byteLength }
})()
`)
console.log('exportCharacter:', JSON.stringify(expStep))

// Step 3: IPC write
if (expStep?.ok) {
  const ipcStep = await evalExpr(`
  (async () => {
    const t0 = performance.now()
    const sceneGroup = window.__ccm.getSceneGroup()
    const dna = window.__app.getDNA()
    const profile = { id: 'glb-standard', name: 'GLB', description: 'bin', binary: true, embedImages: true }
    const mod = await import('/src/renderer/services/ExportManager.ts')
    const { buffer } = await mod.exportCharacter(sceneGroup, dna, profile, 'probe')
    const result = await window.electronAPI.export.execute({
      buffer,
      fileName: 'Character',
      profileName: 'glb-standard',
      characterDna: JSON.stringify(dna)
    })
    return { ok: true, ms: performance.now() - t0, result }
  })()
  `)
  console.log('ipc:', JSON.stringify(ipcStep, null, 2))
}

process.exit(0)
