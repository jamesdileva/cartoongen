import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'

let offscreenRenderer: THREE.WebGLRenderer | null = null
const loader = new GLTFLoader()
const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/')
loader.setDRACOLoader(dracoLoader)
loader.setMeshoptDecoder(MeshoptDecoder)

export function getOffscreenRenderer(): THREE.WebGLRenderer {
  if (!offscreenRenderer) {
    offscreenRenderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true
    })
    offscreenRenderer.setSize(256, 256)
    offscreenRenderer.setPixelRatio(1)
  }
  return offscreenRenderer
}

export async function generateThumbnail(buffer: ArrayBuffer): Promise<string> {
  const renderer = getOffscreenRenderer()
  const scene = new THREE.Scene()

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
  scene.add(ambientLight)
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.5)
  dirLight.position.set(3, 5, 4)
  scene.add(dirLight)
  const fillLight = new THREE.DirectionalLight(0x8888ff, 0.4)
  fillLight.position.set(-3, 1, 2)
  scene.add(fillLight)

  let model: THREE.Group
  try {
    const gltf = await loader.parseAsync(buffer, '')
    model = gltf.scene
  } catch {
    throw new Error('Failed to load asset for thumbnail')
  }

  const box = new THREE.Box3().setFromObject(model)
  const center = new THREE.Vector3()
  box.getCenter(center)
  const size = new THREE.Vector3()
  box.getSize(size)
  const maxDim = Math.max(size.x, size.y, size.z)
  const scale = maxDim > 0 ? 1.8 / maxDim : 1
  model.position.sub(center)

  scene.add(model)

  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100)
  camera.position.set(0, 0, 3.5 / scale)
  camera.lookAt(0, 0, 0)

  renderer.render(scene, camera)
  const dataUrl = renderer.domElement.toDataURL('image/png')

  scene.clear()
  model.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose()
    }
  })

  return dataUrl
}

export function disposeThumbnailRenderer(): void {
  if (offscreenRenderer) {
    offscreenRenderer.dispose()
    offscreenRenderer = null
  }
}
