// Randomize N times via CDP; after each roll verify the head bone has no
// ancestor x/z squash (the bellySize/neckWidth bug) and features poke out.
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

const checkExpr = `
(() => {
  const ccm = window.__ccm
  if (!ccm) return { error: 'no __ccm' }
  const scene = ccm.getSceneGroup()
  let skull = null
  let faceGroup = null
  scene.traverse((o) => {
    if (o.isSkinnedMesh && o.geometry.attributes.position.count > 400 &&
        o.skeleton.bones.some((b) => b && b.name === 'Head')) {
      if (!skull || o.geometry.attributes.position.count > skull.geometry.attributes.position.count) skull = o
    }
    if (o.type === 'Group' && o.children.some((c) => c.name === 'Nose')) faceGroup = o
  })
  if (!skull || !faceGroup) return { error: 'meshes missing' }
  const headBone = skull.skeleton.bones.find((b) => b.name === 'Head')
  const e = headBone.matrixWorld.elements
  const sx = e[0], sy = e[5], sz = e[10]

  // feature front vs own-latitude deformed skull surface
  const pos = skull.geometry.attributes.position
  const si = skull.geometry.attributes.skinIndex.array
  const sw = skull.geometry.attributes.skinWeight.array
  const bones = skull.skeleton.bones
  const mats = bones.map((b, i) => {
    const inv = skull.skeleton.boneInverses[i].elements
    const w = b.matrixWorld.elements
    const out = new Array(16)
    for (let c = 0; c < 4; c++) for (let r2 = 0; r2 < 4; r2++) {
      out[c * 4 + r2] = w[r2] * inv[c * 4] + w[4 + r2] * inv[c * 4 + 1] + w[8 + r2] * inv[c * 4 + 2] + w[12 + r2] * inv[c * 4 + 3]
    }
    return out
  })
  const half = { Eye_Left: 0.05, Eye_Right: 0.05, Nose: 0.03, Mouth: 0.012, Eyebrow_Left: 0.014, Eyebrow_Right: 0.014 }
  const problems = []
  for (const c of faceGroup.children) {
    if (!c.isMesh) continue
    const m = c.matrixWorld.elements
    const fx = m[12], fy = m[13], fz = m[14]
    const he = half[c.name] ?? 0.02
    let surfZ = -1e9
    const p = { x: 0, y: 0, z: 0 }
    for (let i = 0; i < pos.count; i += 2) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
      let dx = 0, dy = 0, dz = 0
      for (let k = 0; k < 4; k++) {
        const w = sw[i * 4 + k]
        if (w <= 0) continue
        const mm = mats[si[i * 4 + k]]
        dx += w * (mm[0] * x + mm[4] * y + mm[8] * z + mm[12])
        dy += w * (mm[1] * x + mm[5] * y + mm[9] * z + mm[13])
        dz += w * (mm[2] * x + mm[6] * y + mm[10] * z + mm[14])
      }
      if (Math.abs(dy - fy) < 0.02 && Math.abs(dx - fx) < 0.02 && dz > surfZ) surfZ = dz
    }
    const front = fz + he
    if (surfZ > -1e8 && front < surfZ - 0.004) {
      problems.push({ name: c.name, front: +front.toFixed(3), surf: +surfZ.toFixed(3) })
    }
  }
  return { scaleX: +sx.toFixed(3), scaleY: +sy.toFixed(3), scaleZ: +sz.toFixed(3), problems }
})()
`

let bad = 0
const N = Number(process.argv[2] ?? 15)
for (let i = 0; i < N; i++) {
  await evalExpr('window.__app.randomize()')
  await new Promise((r) => setTimeout(r, 250))
  const res = await evalExpr(checkExpr)
  const squash = res.scaleX !== undefined && (Math.abs(res.scaleX - 1) > 0.01 || Math.abs(res.scaleZ - 1) > 0.01)
  const flag = res.error ? 'ERR ' : squash || (res.problems && res.problems.length) ? 'BAD ' : 'ok  '
  if (flag !== 'ok  ') bad++
  console.log(flag, JSON.stringify(res))
}
console.log(`\\n${N - bad}/${N} rolls clean`)
ws.close()
