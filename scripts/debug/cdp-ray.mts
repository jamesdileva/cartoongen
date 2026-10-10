// Live sightline probe: dense front+back grid, reports non-metal first-hits.
// Usage: app running with --remote-debugging-port=9223, then:
//   npx tsx scripts/debug/cdp-ray.mts
const list = await fetch('http://127.0.0.1:9223/json/list').then((r) => r.json())
const page = (Array.isArray(list) ? list : []).find((t) => t.type === 'page')
if (!page) throw new Error('no page target')
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
  } else if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails
    console.log(`[EXCEPTION] ${(d.exception?.description || d.text || '').slice(0, 200)}`)
  }
}
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++msgId
    pending.set(id, resolve)
    ws.send(JSON.stringify({ id, method, params }))
  })
await send('Runtime.enable')
const evalJs = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  return r.result?.result?.value
}
const report = await evalJs(`(() => {
  const mgr = window.__ccm
  if (!mgr || typeof mgr.getSceneGroup !== 'function') return { err: 'no scene' }
  const group = mgr.getSceneGroup()
  group.updateWorldMatrix(true, true)
  const tris = []
  group.traverse((o) => {
    if (!o.isMesh || !o.visible) return
    const pos = o.geometry.attributes.position
    const idx = o.geometry.index
    const mat = Array.isArray(o.material) ? o.material[0] : o.material
    const hex = mat && mat.color ? mat.color.getHexString() : '?'
    o.updateWorldMatrix(true, false)
    const e = o.matrixWorld.elements
    const v = (i) => {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
      return [e[0]*x+e[4]*y+e[8]*z+e[12], e[1]*x+e[5]*y+e[9]*z+e[13], e[2]*x+e[6]*y+e[10]*z+e[14]]
    }
    const n = idx ? idx.count : pos.count
    for (let t = 0; t < n; t += 3) {
      const a = idx ? v(idx.getX(t)) : v(t)
      const b = idx ? v(idx.getX(t+1)) : v(t+1)
      const c = idx ? v(idx.getX(t+2)) : v(t+2)
      tris.push([a, b, c, hex])
    }
  })
  function rayTri(o, d, a, b, c) {
    const e1x=b[0]-a[0], e1y=b[1]-a[1], e1z=b[2]-a[2]
    const e2x=c[0]-a[0], e2y=c[1]-a[1], e2z=c[2]-a[2]
    const px=d[1]*e2z-d[2]*e2y, py=d[2]*e2x-d[0]*e2z, pz=d[0]*e2y-d[1]*e2x
    const det=e1x*px+e1y*py+e1z*pz
    if (Math.abs(det) < 1e-12) return -1
    const inv=1/det
    const tx=o[0]-a[0], ty=o[1]-a[1], tz=o[2]-a[2]
    const u=(tx*px+ty*py+tz*pz)*inv
    if (u < -0.001 || u > 1.001) return -1
    const qx=ty*e1z-tz*e1y, qy=tz*e1x-tx*e1z, qz=tx*e1y-ty*e1x
    const v2=(d[0]*qx+d[1]*qy+d[2]*qz)*inv
    if (v2 < -0.001 || u+v2 > 1.001) return -1
    const t=(e2x*qx+e2y*qy+e2z*qz)*inv
    return t > 1e-6 ? t : -1
  }
  const out = []
  for (let ix = 0; ix <= 22; ix++) {
    const sx = 0.1 + ix * 0.025
    for (let iy = 0; iy <= 18; iy++) {
      const sy = 0.8 + iy * 0.05
      for (const sgn of [1, -1]) {
        for (const [zo, dz, dir] of [[3, -1, 'F'], [-3, 1, 'B']]) {
          const o = [sgn * sx, sy, zo], d = [0, 0, dz]
          let best = -1, tag = null
          for (const [a, b, c, hex] of tris) {
            const t2 = rayTri(o, d, a, b, c)
            if (t2 > 0 && (best < 0 || t2 < best)) { best = t2; tag = hex }
          }
          if (tag && tag !== 'a0a0a0') {
            const zhit = dz < 0 ? 3 - best : best - 3
            out.push([+(sgn*sx).toFixed(2), +sy.toFixed(2), dir, +zhit.toFixed(2), tag])
          }
        }
      }
    }
  }
  return out
})()`)
for (const [x, y, dir, z, mat] of report) {
  console.log(`NONMETAL (${x},${y}) ${dir} z=${z} mat=${mat}`)
}
console.log('count:', report.length)
ws.close()
console.log('DONE')
