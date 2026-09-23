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

// 1) Slot panel shows procedural garments
const ui = await evalExpr(`
(() => {
  const clickTab = (label) => {
    const tab = [...document.querySelectorAll('div')].find(
      d => d.textContent.trim() === label && d.style.cursor === 'pointer'
    )
    if (tab) tab.click()
    return !!tab
  }
  clickTab('Shirt')
  await new Promise(r => setTimeout(r, 200))
  const shirtHas = [...document.querySelectorAll('div')].some(d => d.textContent.trim() === 'T-Shirt')
  clickTab('Pants')
  await new Promise(r => setTimeout(r, 200))
  const pantsHas = [...document.querySelectorAll('div')].some(d => d.textContent.trim() === 'Jeans')
  return { shirtHas, pantsHas }
})()
`).catch(async () => {
  // clickTab can't await inside non-async IIFE with top-level await - redo properly
  return evalExpr(`
  (async () => {
    const clickTab = (label) => {
      const tab = [...document.querySelectorAll('div')].find(
        d => d.textContent.trim() === label && d.style.cursor === 'pointer'
      )
      if (tab) tab.click()
      return !!tab
    }
    clickTab('Shirt')
    await new Promise(r => setTimeout(r, 250))
    const shirtHas = [...document.querySelectorAll('div')].some(d => d.textContent.trim() === 'T-Shirt')
    clickTab('Pants')
    await new Promise(r => setTimeout(r, 250))
    const pantsHas = [...document.querySelectorAll('div')].some(d => d.textContent.trim() === 'Jeans')
    return { shirtHas, pantsHas }
  })()
  `)
})
console.log('slot panel', JSON.stringify(ui))

// 2) Undo: clear shirt, ctrl+z restores
const undo = await evalExpr(`
(async () => {
  const dna0 = window.__app.getDNA()
  const before = dna0.slots.shirt
  window.__app.setDNA({ ...dna0, slots: { ...dna0.slots, shirt: null } })
  await new Promise(r => setTimeout(r, 350))
  const mid = window.__app.getDNA().slots.shirt
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }))
  await new Promise(r => setTimeout(r, 350))
  const after = window.__app.getDNA().slots.shirt
  return { before, mid, after }
})()
`)
console.log('undo', JSON.stringify(undo))

// 3) Export GLB via ExportManager path
const exportResult = await evalExpr(`
(async () => {
  const sceneGroup = window.__ccm.getSceneGroup()
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js')
  const exporter = new GLTFExporter()
  const buffer = await exporter.parseAsync(sceneGroup, { binary: true, embedImages: true })
  const bytes = new Uint8Array(buffer)
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])
  // count cloth meshes in export via re-parse as json
  const json = await exporter.parseAsync(sceneGroup, { binary: false })
  const clothNodes = (json.nodes || []).length
  const meshCount = (json.meshes || []).length
  return { magic, byteLength: bytes.byteLength, meshCount, nodeCount: clothNodes }
})()
`)
console.log('export', JSON.stringify(exportResult))

// 4) Belly morph rebuild still keeps garments
const morph = await evalExpr(`
(async () => {
  const dna = window.__app.getDNA()
  window.__app.setDNA({ ...dna, morphs: { ...dna.morphs, bellySize: 0.05, bust: 0, butt: 0 } })
  await new Promise(r => setTimeout(r, 500))
  const scene = window.__ccm.getSceneGroup()
  let groups = 0
  scene.children.forEach(c => {
    if (c.type === 'Group' && c.children.some(ch => ch.isSkinnedMesh && ch.material?.name === 'cloth')) groups++
  })
  window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }))
  await new Promise(r => setTimeout(r, 400))
  return { clothGroups: groups, belly: window.__app.getDNA().morphs.bellySize }
})()
`)
console.log('morph', JSON.stringify(morph))

const { writeFileSync } = await import('node:fs')
const shot = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync('scripts/debug/sprint20-garments-lean2.png', Buffer.from(shot.data, 'base64'))
console.log('lean shot written')

process.exit(0)
