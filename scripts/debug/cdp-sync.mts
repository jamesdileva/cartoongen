// Precise live probe: is the face group's transform consistent with the skull's
// skinning for the same rest positions? Usage: npx tsx scripts/debug/cdp-sync.mts
import { writeFileSync } from 'node:fs'

const list = await fetch('http://127.0.0.1:9222/json/list').then((r) => r.json())
const page = list.find((t: { type: string; url: string }) => t.type === 'page' && t.url.includes('5173'))
if (!page) { console.error('no page'); process.exit(1) }

const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })

let msgId = 0
const pending = new Map<number, (v: unknown) => void>()
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data as string)
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)!(msg.result)
    pending.delete(msg.id)
  }
}
const send = (method: string, params: Record<string, unknown> = {}) =>
  new Promise((resolve) => {
    const id = ++msgId
    pending.set(id, resolve)
    ws.send(JSON.stringify({ id, method, params }))
  })

async function evaluate<T>(expression: string): Promise<T> {
  const r = (await send('Runtime.evaluate', {
    expression, returnByValue: true, awaitPromise: true
  })) as { result?: { value?: T }; exceptionDetails?: { exception?: { description?: string } } }
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'page exception')
  return r.result?.value as T
}

const expr = `
(() => {
  const ccm = window.__ccm
  const scene = ccm.getSceneGroup()

  let skull = null
  scene.traverse((o) => {
    if (o.isSkinnedMesh && o.geometry.attributes.position.count > 400) {
      const hasHead = o.skeleton && o.skeleton.bones.some((b) => b && b.name === 'Head')
      if (hasHead && (!skull || o.geometry.attributes.position.count > skull.geometry.attributes.position.count)) skull = o
    }
  })
  if (!skull) return { error: 'no skull' }

  const headBone = skull.skeleton.bones.find((b) => b.name === 'Head')
  const neckBone = skull.skeleton.bones.find((b) => b.name === 'Neck')
  const headBoneIdx = skull.skeleton.bones.indexOf(headBone)
  const boneInv = skull.skeleton.boneInverses[headBoneIdx]

  // face group
  let face = null
  scene.traverse((o) => {
    if (o.type === 'Group' && o.children.some((c) => c.name === 'Nose')) face = o
  })
  if (!face) return { error: 'no face' }

  // Is face a child of THE Head bone in the skeleton?
  let p = face.parent
  const chain = []
  while (p) { chain.push(p.name || p.type); p = p.parent }
  const faceParentIsHead = face.parent === headBone

  // mouth mesh
  const mouth = face.children.find((c) => c.name === 'Mouth')
  if (!mouth) return { error: 'no mouth' }
  scene.updateMatrixWorld(true)

  // For a few mouth verts: 
  // A) actual world via scene graph
  // B) world if we treat local as being in head-bone space: headBone.matrixWorld * local
  // C) implied rest world from skull formula: inv(boneInverse) applied... 
  //    actually: if face local L should equal boneInverse * restV, then restV = inv(boneInverse)*L
  //    skull deform of restV should equal headBone.matrixWorld * boneInverse * restV = headBone.matrixWorld * L
  // So B and skull-deform-of-inv(boneInverse)*L should MATCH always by construction.
  // The question is whether face local L is in the same space as boneInverse expects.

  const mp = mouth.geometry.attributes.position
  const mouthM = mouth.matrixWorld.elements
  const samples = []
  for (let i = 0; i < Math.min(mp.count, 200); i += 40) {
    const lx = mp.getX(i), ly = mp.getY(i), lz = mp.getZ(i)
    // actual world
    const ax = mouthM[0]*lx + mouthM[4]*ly + mouthM[8]*lz + mouthM[12]
    const ay = mouthM[1]*lx + mouthM[5]*ly + mouthM[9]*lz + mouthM[13]
    const az = mouthM[2]*lx + mouthM[6]*ly + mouthM[10]*lz + mouthM[14]
    // head bone * local (as if face local were head-bone-local)
    const hw = headBone.matrixWorld.elements
    const bx = hw[0]*lx + hw[4]*ly + hw[8]*lz + hw[12]
    const by = hw[1]*lx + hw[5]*ly + hw[9]*lz + hw[13]
    const bz = hw[2]*lx + hw[6]*ly + hw[10]*lz + hw[14]
    // implied rest vertex from boneInverse * L (what skull thinks the rest vert is)
    const bi = boneInv.elements
    const rx = bi[0]*lx + bi[4]*ly + bi[8]*lz + bi[12]
    const ry = bi[1]*lx + bi[5]*ly + bi[9]*lz + bi[13]
    const rz = bi[2]*lx + bi[6]*ly + bi[10]*lz + bi[14]
    samples.push({
      local: [lx, ly, lz].map((n) => +n.toFixed(4)),
      actualWorld: [ax, ay, az].map((n) => +n.toFixed(4)),
      headTimesLocal: [bx, by, bz].map((n) => +n.toFixed(4)),
      impliedRestFromInv: [rx, ry, rz].map((n) => +n.toFixed(4)),
      same: Math.abs(ax-bx)<1e-6 && Math.abs(ay-by)<1e-6 && Math.abs(az-bz)<1e-6
    })
  }

  // Does face.localToWorld match headBone.localToWorld for mouth verts? (should if parented correctly)
  // Also: what is the offset between face.matrixWorld and headBone.matrixWorld?
  const fm = face.matrixWorld.elements
  const hm = headBone.matrixWorld.elements
  const faceOffset = [fm[12]-hm[12], fm[13]-hm[13], fm[14]-hm[14]]

  // boneInverse should be inv of matrixWorld AT BIND TIME (rest).
  // inv(boneInverse) should equal rest matrixWorld (scale 1).
  const restMW = boneInv.clone().invert()
  const restScaleY = Math.sqrt(restMW.elements[5]**2 + restMW.elements[9]**2 + restMW.elements[13]**2)
  // actually column 1 length: elements 4,5,6 in row-major... three.js is column-major
  // column1 = e[4],e[5],e[6] -> length = sqrt(e[4]^2+e[5]^2+e[6]^2)
  const c1 = Math.sqrt(restMW.elements[4]**2 + restMW.elements[5]**2 + restMW.elements[6]**2)

  // Find nearest skull vert to implied rest pos for first mouth sample, check deform
  const pos = skull.geometry.attributes.position
  const si = skull.geometry.attributes.skinIndex.array
  const sw = skull.geometry.attributes.skinWeight.array
  const bones = skull.skeleton.bones
  const inverses = skull.skeleton.boneInverses

  function deform(ri) {
    const x = pos.getX(ri), y = pos.getY(ri), z = pos.getZ(ri)
    let dx=0, dy=0, dz=0
    for (let k=0;k<4;k++) {
      const w = sw[ri*4+k]
      if (w<=0) continue
      const bi = bones[si[ri*4+k]]
      const inv = inverses[si[ri*4+k]].elements
      const mw = bi.matrixWorld.elements
      // m = mw * inv
      const m = new Array(16)
      for (let c=0;c<4;c++) for (let r=0;r<4;r++) {
        m[c*4+r] = mw[r]*inv[c*4] + mw[4+r]*inv[c*4+1] + mw[8+r]*inv[c*4+2] + mw[12+r]*inv[c*4+3]
      }
      dx += w*(m[0]*x+m[4]*y+m[8]*z+m[12])
      dy += w*(m[1]*x+m[5]*y+m[9]*z+m[13])
      dz += w*(m[2]*x+m[6]*y+m[10]*z+m[14])
    }
    return [dx,dy,dz]
  }

  // compare mouth actual world vs skull deform of nearest vert to implied rest
  const comparisons = []
  for (const s of samples.slice(0, 5)) {
    const [rx, ry, rz] = s.impliedRestFromInv
    let best = -1, bestD = 1e9
    for (let i = 0; i < pos.count; i += 3) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
      const d = (x-rx)**2 + (y-ry)**2 + (z-rz)**2
      if (d < bestD) { bestD = d; best = i }
    }
    const def = deform(best)
    const restPos = [pos.getX(best), pos.getY(best), pos.getZ(best)]
    comparisons.push({
      mouthActual: s.actualWorld,
      impliedRest: s.impliedRestFromInv,
      nearestSkirtRest: restPos.map((n)=>+n.toFixed(4)),
      restDist: +Math.sqrt(bestD).toFixed(4),
      nearestSkullDeformed: def.map((n)=>+n.toFixed(4)),
      mouthVsSkull: [
        +(s.actualWorld[0]-def[0]).toFixed(4),
        +(s.actualWorld[1]-def[1]).toFixed(4),
        +(s.actualWorld[2]-def[2]).toFixed(4)
      ]
    })
  }

  return {
    faceParentIsHead,
    faceParent: face.parent?.name || face.parent?.type,
    faceParentChain: chain,
    headBoneWorldPos: [hm[12], hm[13], hm[14]].map((n)=>+n.toFixed(4)),
    headBoneScale: [headBone.scale.x, headBone.scale.y, headBone.scale.z],
    faceWorldPos: [fm[12], fm[13], fm[14]].map((n)=>+n.toFixed(4)),
    faceOffsetFromHead: faceOffset.map((n)=>+n.toFixed(4)),
    faceLocalPos: [face.position.x, face.position.y, face.position.z],
    restInvRestScaleY: +c1.toFixed(6),
    restInvRestPos: [restMW.elements[12], restMW.elements[13], restMW.elements[14]].map((n)=>+n.toFixed(4)),
    headScaleY: headBone.scale.y,
    neckScaleY: neckBone?.scale.y,
    samples: samples.slice(0, 3),
    comparisons
  }
})()
`

const state = await evaluate(expr)
console.log(JSON.stringify(state, null, 2))
writeFileSync('scripts/debug/sync-result.json', JSON.stringify(state, null, 2))
ws.close()
