import * as THREE from 'three'

export interface SweepStation {
  center: [number, number, number]
  width: number
  height: number
}

export function makeEllipsoid(
  rx: number,
  ry: number,
  rz: number,
  widthSegments = 24,
  heightSegments = 18
): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, widthSegments, heightSegments)
  const pos = geo.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i, pos.getX(i) * rx, pos.getY(i) * ry, pos.getZ(i) * rz)
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  return geo
}

export function translateGeometry(
  geo: THREE.BufferGeometry,
  x: number,
  y: number,
  z: number
): THREE.BufferGeometry {
  geo.translate(x, y, z)
  return geo
}

export function makeLathe(
  profile: Array<[number, number]>,
  radialSegments = 24,
  phiStart = 0,
  phiLength = Math.PI * 2
): THREE.BufferGeometry {
  const points = profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0), y))
  return new THREE.LatheGeometry(points, radialSegments, phiStart, phiLength)
}

export function makeSweep(
  stations: SweepStation[],
  radialSegments = 12,
  capStart = false,
  capEnd = false,
  phiStart = 0,
  phiLength = Math.PI * 2
): THREE.BufferGeometry {
  if (stations.length < 2) {
    throw new Error('makeSweep requires at least 2 stations')
  }
  // Partial arcs (open-front jackets) need an open seam: no wrap, and one
  // extra vertex per ring so both cut edges exist. Full circles keep the
  // exact legacy layout (wrapped indices) for bit-identical output.
  const fullCircle = Math.abs(phiLength - Math.PI * 2) < 1e-9
  const vertsPerRing = fullCircle ? radialSegments : radialSegments + 1

  const centers = stations.map((s) => new THREE.Vector3(...s.center))
  const tangents: THREE.Vector3[] = []
  for (let i = 0; i < centers.length; i++) {
    const prev = centers[Math.max(i - 1, 0)]
    const next = centers[Math.min(i + 1, centers.length - 1)]
    const t = new THREE.Vector3().subVectors(next, prev)
    if (t.lengthSq() < 1e-10) t.set(0, 1, 0)
    tangents.push(t.normalize())
  }

  const ringCount = stations.length
  const positions: number[] = []
  const uvs: number[] = []

  // Twist-free frames: consecutive rings must share the same phase (vertex j
  // at the same geometric angle), or quads pinch through the tube. The
  // cross-product frame has a sign discontinuity (near-vertical paths: side
  // flips when tangent.z crosses zero), so carry the previous side forward
  // and un-flip on mismatch. Paths that never flipped are bit-identical.
  let prevSide: THREE.Vector3 | null = null

  for (let i = 0; i < ringCount; i++) {
    const tangent = tangents[i]
    const refUp =
      Math.abs(tangent.y) > 0.999 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0)
    const side = new THREE.Vector3().crossVectors(tangent, refUp).normalize()
    if (prevSide && side.dot(prevSide) < 0) {
      side.negate()
    }
    prevSide = side.clone()
    const up2 = new THREE.Vector3().crossVectors(side, tangent).normalize()
    const c = centers[i]
    const { width, height } = stations[i]

    for (let j = 0; j < vertsPerRing; j++) {
      const a = phiStart + (j / radialSegments) * phiLength
      const off = new THREE.Vector3()
        .addScaledVector(side, Math.cos(a) * width * 0.5)
        .addScaledVector(up2, Math.sin(a) * height * 0.5)
      positions.push(c.x + off.x, c.y + off.y, c.z + off.z)
      uvs.push(j / radialSegments, i / (ringCount - 1))
    }
  }

  const indices: number[] = []
  for (let i = 0; i < ringCount - 1; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const jn = fullCircle ? (j + 1) % radialSegments : j + 1
      const a = i * vertsPerRing + j
      const b = i * vertsPerRing + jn
      const c = (i + 1) * vertsPerRing + j
      const d = (i + 1) * vertsPerRing + jn
      indices.push(a, c, d)
      indices.push(a, d, b)
    }
  }

  if (capStart) {
    const capCenterIndex = positions.length / 3
    const c0 = centers[0]
    positions.push(c0.x, c0.y, c0.z)
    uvs.push(0.5, 0)
    const capQuads = fullCircle ? vertsPerRing : vertsPerRing - 1
    for (let j = 0; j < capQuads; j++) {
      const jn = fullCircle ? (j + 1) % vertsPerRing : j + 1
      indices.push(capCenterIndex, j, jn)
    }
  }

  if (capEnd) {
    const capCenterIndex = positions.length / 3
    const cn = centers[ringCount - 1]
    positions.push(cn.x, cn.y, cn.z)
    uvs.push(0.5, 1)
    const ringBase = (ringCount - 1) * vertsPerRing
    const capQuads = fullCircle ? vertsPerRing : vertsPerRing - 1
    for (let j = 0; j < capQuads; j++) {
      const jn = fullCircle ? (j + 1) % vertsPerRing : j + 1
      indices.push(capCenterIndex, ringBase + jn, ringBase + j)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}
