// S3.6 全景查看器组件：把 equirectangular 全景图交给 Three.js 球体内贴图渲染。
// 独立组件以便用 useEffect 精确管理 Three.js 生命周期（卸载即 dispose，避免内存泄漏）。
import { useEffect, useRef } from 'react'
import { createPanoramaViewer } from '../gateway/panorama'

export default function PanoramaView({ url }: { url: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current || !url) return
    const handle = createPanoramaViewer(ref.current, url)
    return () => handle.dispose()
  }, [url])
  if (!url) {
    return <div className="pano-view pano-empty">全景图未载入（运行节点或本地导入等距全景图）</div>
  }
  return <div className="pano-view" ref={ref} />
}
