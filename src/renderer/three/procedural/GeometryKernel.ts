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
  capEnd = false
): THREE.BufferGeometry {
  if (stations.length < 2) {
    throw new Error('makeSweep requires at least 2 stations')
  }

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

  for (let i = 0; i < ringCount; i++) {
    const tangent = tangents[i]
    const refUp = Math.abs(tangent.y) > 0.999 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
    const side = new THREE.Vector3().crossVectors(tangent, refUp).normalize()
    const up2 = new THREE.Vector3().crossVectors(side, tangent).normalize()
    const c = centers[i]
    const { width, height } = stations[i]

    for (let j = 0; j < radialSegments; j++) {
      const a = (j / radialSegments) * Math.PI * 2
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
      const jn = (j + 1) % radialSegments
      const a = i * radialSegments + j
      const b = i * radialSegments + jn
      const c = (i + 1) * radialSegments + j
      const d = (i + 1) * radialSegments + jn
      indices.push(a, c, d)
      indices.push(a, d, b)
    }
  }

  if (capStart) {
    const capCenterIndex = positions.length / 3
    const c0 = centers[0]
    positions.push(c0.x, c0.y, c0.z)
    uvs.push(0.5, 0)
    for (let j = 0; j < radialSegments; j++) {
      const jn = (j + 1) % radialSegments
      indices.push(capCenterIndex, j, jn)
    }
  }

  if (capEnd) {
    const capCenterIndex = positions.length / 3
    const cn = centers[ringCount - 1]
    positions.push(cn.x, cn.y, cn.z)
    uvs.push(0.5, 1)
    const ringBase = (ringCount - 1) * radialSegments
    for (let j = 0; j < radialSegments; j++) {
      const jn = (j + 1) % radialSegments
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
