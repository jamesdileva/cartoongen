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
const evalExpr = async (expression) => {
  const r = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  })
  if (r.result?.exceptionDetails) {
    throw new Error(r.result.exceptionDetails.exception?.description ?? 'exception')
  }
  return r.result?.result?.value
}

// Wait for export to finish if still running
let status = null
for (let i = 0; i < 15; i++) {
  status = await evalExpr(`
(() => {
  const text = document.body.innerText
  if (text.includes('Exporting...')) return 'exporting'
  if (/export(ed| success)|exports[/\\\\]/i.test(text)) {
    const m = text.match(/.{0,200}(export(ed| success)|exports[/\\\\]).{0,200}/i)
    return m ? m[0] : 'exported-unknown'
  }
  if (/error|failed/i.test(text)) {
    const m = text.match(/.{0,200}(error|failed).{0,200}/i)
    return m ? m[0] : 'error'
  }
  return 'idle'
})()
`)
  if (status !== 'exporting') break
  await new Promise((r) => setTimeout(r, 1000))
}
console.log('export status:', JSON.stringify(status))

const full = await evalExpr(`document.body.innerText`)
console.log('--- body tail ---')
console.log(full.slice(-600))

// Also try reading export via IPC path in main if dialog closed
const fileProbe = await evalExpr(`
window.electronAPI?.project?.getRoot?.() ?? null
`)
console.log('projectRoot via ipc:', fileProbe)

process.exit(0)
