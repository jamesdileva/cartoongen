// Raycast from the camera through the mouth midpoint against the DEFORMED
// skull triangles (Moller-Trumbore, CPU) to find the true occluder.
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

const probe = `
(() => {
  const ccm = window.__ccm
  const scene = ccm.getSceneGroup()
  let skull = null
  let mouthMid = null
  scene.traverse((o) => {
    if (o.isSkinnedMesh && o.geometry.attributes.position.count > 400 &&
        o.skeleton.bones.some((b) => b && b.name === 'Head')) {
      if (!skull || o.geometry.attributes.position.count > skull.geometry.attributes.position.count) skull = o
    }
    if (o.isMesh && o.name === 'Mouth' && o.geometry.attributes.position.count > 100) {
      // tube: take the middle sample = deepest point of the smile
      const m = o.matrixWorld.elements
      const lx = 0, ly = -0.05, lz = 0.13
      mouthMid = [m[0]*lx + m[4]*ly + m[8]*lz + m[12], m[1]*lx + m[5]*ly + m[9]*lz + m[13], m[2]*lx + m[6]*ly + m[10]*lz + m[14]]
    }
  })
  const cam = window.__camera
  const co = [cam.position.x, cam.position.y, cam.position.z]
  // ray origin + direction
  const dir = [mouthMid[0]-co[0], mouthMid[1]-co[1], mouthMid[2]-co[2]]
  const len = Math.hypot(...dir)
  const d = dir.map((v) => v / len)
  // deform skull verts
  const pos = skull.geometry.attributes.position
  const si = skull.geometry.attributes.skinIndex.array
  const sw = skull.geometry.attributes.skinWeight.array
  const bones = skull.skeleton.bones
  const mats = bones.map((b, i) => {
    const inv = skull.skeleton.boneInverses[i].elements
    const w = b.matrixWorld.elements
    const out = new Array(16)
    for (let c = 0; c < 4; c++) for (let r2 = 0; r2 < 4; r2++) {
      out[c*4+r2] = w[r2]*inv[c*4] + w[4+r2]*inv[c*4+1] + w[8+r2]*inv[c*4+2] + w[12+r2]*inv[c*4+3]
    }
    return out
  })
  const V = (i) => {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    let dx=0, dy=0, dz=0
    for (let k = 0; k < 4; k++) {
      const w = sw[i*4+k]
      if (w <= 0) continue
      const mm = mats[si[i*4+k]]
      dx += w*(mm[0]*x+mm[4]*y+mm[8]*z+mm[12])
      dy += w*(mm[1]*x+mm[5]*y+mm[9]*z+mm[13])
      dz += w*(mm[2]*x+mm[6]*y+mm[10]*z+mm[14])
    }
    return [dx,dy,dz]
  }
  // Moller-Trumbore over all tris
  const idx = skull.geometry.index.array
  const hits = []
  const edge1=[0,0,0], edge2=[0,0,0], pvec=[0,0,0], tvec=[0,0,0], qvec=[0,0,0]
  const cross = (a,b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]
  const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2]
  const sub = (a,b) => [a[0]-b[0],a[1]-b[1],a[2]-b[2]]
  for (let t = 0; t < idx.length; t += 3) {
    const v0 = V(idx[t]), v1 = V(idx[t+1]), v2 = V(idx[t+2])
    const e1 = sub(v1,v0), e2 = sub(v2,v0)
    const p = cross(d,e1)
    const det = dot(e1,p)
    if (Math.abs(det) < 1e-9) continue
    const inv = 1/det
    const tv = sub(co,v0)
    const u = dot(tv,p)*inv
    if (u < 0 || u > 1) continue
    const q = cross(tv,e1)
    const v = dot(d,q)*inv
    if (v < 0 || u+v > 1) continue
    const tt = dot(e2,q)*inv
    if (tt > 1e-4) hits.push({ t: tt, tri: t/3 })
  }
  hits.sort((a,b) => a.t - b.t)
  return {
    camPos: co.map((n) => +n.toFixed(3)),
    mouthMid: mouthMid.map((n) => +n.toFixed(3)),
    mouthDist: +len.toFixed(3),
    hits: hits.slice(0, 5).map((h) => ({ t: +h.t.toFixed(3) }))
  }
})()
`

console.log(JSON.stringify(await evalExpr(probe), null, 2))
ws.close()
