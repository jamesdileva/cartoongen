const list = await fetch('http://127.0.0.1:9222/json/list').then((r) => r.json())
const page = list.find((t) => t.type === 'page' && t.url.includes('5173')) ?? list.find((t) => t.type === 'page')

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

await send('Runtime.enable')
await send('Log.enable')

const errors = []
ws.onmessage2 = null
const origHandler = ws.onmessage
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.method === 'Runtime.consoleAPICalled') {
    const args = (msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ')
    errors.push(`[console.${msg.params.type}] ${args.slice(0, 300)}`)
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails
    errors.push(`[exception] ${(d.exception?.description || d.text || '').slice(0, 500)}`)
  }
  if (msg.method === 'Log.entryAdded') {
    errors.push(`[log.${msg.params.entry.level}] ${msg.params.entry.text.slice(0, 300)}`)
  }
  if (msg.id && pending.has(msg.id)) {
    const p = pending.get(msg.id)
    pending.delete(msg.id)
    p(msg.result)
  }
}

const evalExpr = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  return r.result ? r.result.value : r
}

console.log('body snippet:', (await evalExpr('document.body.innerHTML.slice(0, 400)')) ?? '')
// trigger a reload to capture startup errors
await send('Page.enable')
await send('Page.reload')
await new Promise((r) => setTimeout(r, 6000))
console.log('--- captured messages after reload ---')
for (const e of errors.slice(0, 30)) console.log(e)
ws.close()
