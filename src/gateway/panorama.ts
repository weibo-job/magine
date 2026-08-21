// S3.6 全景节点网关：Three.js 球体内贴图 720° 查看器（纯本地，无需任何 Key）
// 把一张等距全景图（equirectangular，2:1）贴到球内壁，相机置于球心，
// 鼠标拖拽旋转环视、滚轮缩放，实现真正的 720°（水平 360° + 垂直 360°）全景浏览。
// 非等距图也能贴（会略有形变），节点提示里已说明理想输入是等距全景图。
import * as THREE from 'three'

export interface PanoramaHandle {
  dispose: () => void
}

// 创建查看器：把 imageUrl 作为全景贴图渲染进 container。返回 dispose 以便组件卸载时清理。
export function createPanoramaViewer(
  container: HTMLElement,
  imageUrl: string,
): PanoramaHandle {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(
    75,
    container.clientWidth / Math.max(1, container.clientHeight),
    0.1,
    1000,
  )
  camera.position.set(0, 0, 0.01)

  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setSize(container.clientWidth, container.clientHeight)
  renderer.domElement.style.width = '100%'
  renderer.domElement.style.height = '100%'
  renderer.domElement.style.display = 'block'
  renderer.domElement.style.cursor = 'grab'
  container.appendChild(renderer.domElement)

  // 球内壁：半径 500，scale.x = -1 把法线翻到内侧，使贴图从球心可见
  const geometry = new THREE.SphereGeometry(500, 60, 40)
  geometry.scale(-1, 1, 1)
  const material = new THREE.MeshBasicMaterial()
  const mesh = new THREE.Mesh(geometry, material)
  scene.add(mesh)

  const loader = new THREE.TextureLoader()
  loader.setCrossOrigin('anonymous')
  loader.load(
    imageUrl,
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace
      material.map = tex
      material.needsUpdate = true
    },
    undefined,
    () => {
      // 加载失败：用占位色，避免黑屏（真机多为本地 dataURL，一般不会失败）
      material.color = new THREE.Color('#2b2d42')
      material.needsUpdate = true
    },
  )

  // 拖拽环视
  let lon = 0
  let lat = 0
  let isDown = false
  let downX = 0
  let downY = 0
  let downLon = 0
  let downLat = 0
  const target = new THREE.Vector3()

  const onDown = (e: PointerEvent) => {
    isDown = true
    downX = e.clientX
    downY = e.clientY
    downLon = lon
    downLat = lat
    renderer.domElement.style.cursor = 'grabbing'
    renderer.domElement.setPointerCapture(e.pointerId)
  }
  const onMove = (e: PointerEvent) => {
    if (!isDown) return
    lon = downLon + (e.clientX - downX) * 0.12
    lat = Math.max(-85, Math.min(85, downLat + (e.clientY - downY) * 0.12))
  }
  const onUp = (e: PointerEvent) => {
    isDown = false
    renderer.domElement.style.cursor = 'grab'
    try {
      renderer.domElement.releasePointerCapture(e.pointerId)
    } catch {
      /* noop */
    }
  }
  const onWheel = (e: WheelEvent) => {
    e.preventDefault()
    camera.fov = Math.max(35, Math.min(95, camera.fov + (e.deltaY > 0 ? 3 : -3)))
    camera.updateProjectionMatrix()
  }

  renderer.domElement.addEventListener('pointerdown', onDown)
  renderer.domElement.addEventListener('pointermove', onMove)
  renderer.domElement.addEventListener('pointerup', onUp)
  renderer.domElement.addEventListener('pointerleave', onUp)
  renderer.domElement.addEventListener('wheel', onWheel, { passive: false })

  let raf = 0
  const animate = () => {
    raf = requestAnimationFrame(animate)
    const phi = THREE.MathUtils.degToRad(90 - lat)
    const theta = THREE.MathUtils.degToRad(lon)
    target.x = Math.sin(phi) * Math.cos(theta)
    target.y = Math.cos(phi)
    target.z = Math.sin(phi) * Math.sin(theta)
    camera.lookAt(target)
    renderer.render(scene, camera)
  }
  animate()

  // 容器尺寸变化自适应
  const ro = new ResizeObserver(() => {
    const w = container.clientWidth
    const h = container.clientHeight
    if (w > 0 && h > 0) {
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
  })
  ro.observe(container)

  return {
    dispose() {
      cancelAnimationFrame(raf)
      ro.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onDown)
      renderer.domElement.removeEventListener('pointermove', onMove)
      renderer.domElement.removeEventListener('pointerup', onUp)
      renderer.domElement.removeEventListener('pointerleave', onUp)
      renderer.domElement.removeEventListener('wheel', onWheel)
      geometry.dispose()
      material.dispose()
      if (material.map) material.map.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement)
      }
    },
  }
}
