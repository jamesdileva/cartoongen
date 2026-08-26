import * as THREE from 'three'
import { getOffscreenRenderer } from '../services/ThumbnailGenerator'

export async function generateCharacterThumbnail(group: THREE.Group): Promise<Blob> {
  const renderer = getOffscreenRenderer()
  const scene = new THREE.Scene()

  const ambient = new THREE.AmbientLight(0xffffff, 0.5)
  scene.add(ambient)
  const key = new THREE.DirectionalLight(0xffffff, 2)
  key.position.set(3, 5, 4)
  scene.add(key)
  const fill = new THREE.DirectionalLight(0x8888ff, 0.4)
  fill.position.set(-3, 1, 2)
  scene.add(fill)

  const box = new THREE.Box3().setFromObject(group)
  const center = new THREE.Vector3()
  box.getCenter(center)
  const size = new THREE.Vector3()
  box.getSize(size)
  const maxDim = Math.max(size.x, size.y, size.z, 0.01)

  const clone = group.clone(true)
  clone.position.sub(center)
  scene.add(clone)

  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100)
  const dist = 2.5 / (maxDim / 2)
  camera.position.set(0, 0, dist)
  camera.lookAt(0, 0, 0)

  renderer.render(scene, camera)

  return new Promise<Blob>((resolve) => {
    renderer.domElement.toBlob((blob) => {
      scene.clear()
      resolve(blob ?? new Blob([], { type: 'image/png' }))
    }, 'image/png')
  })
}
