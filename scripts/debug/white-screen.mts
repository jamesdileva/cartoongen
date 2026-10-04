const list = await fetch('http://127.0.0.1:9223/json/list').then((r) => r.json())
const page = list.find((t) => t.type === 'page')
console.log('TARGET:', page.url)
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  ws.onopen = res
  ws.onerror = rej
})
let msgId = 0
const pending = new Map()
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data.toString())
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
  } else if (msg.method === 'Runtime.consoleAPICalled') {
    const args = (msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ')
    console.log(`[console.${msg.params.type}] ${String(args).slice(0, 400)}`)
  } else if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails
    console.log(`[exception] ${(d.exception?.description || d.text || '').slice(0, 800)}`)
  } else if (msg.method === 'Log.entryAdded') {
    console.log(`[log.${msg.params.entry.level}] ${String(msg.params.entry.text).slice(0, 400)}`)
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
await send('Page.enable')
// DOM state: is #root empty?
const dom = await send('Runtime.evaluate', {
  expression: `({ title: document.title,
    rootKids: document.getElementById('root')?.childElementCount ?? -1,
    canvases: document.querySelectorAll('canvas').length,
    bodyText: document.body.innerText.slice(0, 200) })`,
  returnByValue: true
})
console.log('DOM:', JSON.stringify(dom.result?.result?.value))
// Screenshot for visual confirmation
await send('Page.bringToFront')
const shot = await send('Page.captureScreenshot', { format: 'png' })
if (shot.result?.result?.data) {
  const { writeFileSync } = await import('node:fs')
  writeFileSync('C:\\Users\\j\\Projects\\cartoongen\\white-screen.png', Buffer.from(shot.result.result.data, 'base64'))
  console.log('screenshot saved')
}
await new Promise((r) => setTimeout(r, 8000))
ws.close()
console.log('DONE')
