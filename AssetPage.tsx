import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { loadAssets, removeAsset, updateAsset, type SavedAsset, type AssetKind } from '../store/assets'
import { animateEntrance, bindCardLift } from '../motion/gsapMotion'

const FILTERS: { key: 'all' | AssetKind; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'prompt', label: '提示词' },
  { key: 'text', label: '文本' },
  { key: 'image', label: '图片' },
  { key: 'video', label: '视频' },
  { key: 'audio', label: '音频' },
  { key: 'node', label: '节点' },
]

const LABELS: Record<AssetKind, string> = {
  prompt: '提示词', text: '文本', image: '图片', video: '视频', audio: '音频', node: '节点',
}

export default function AssetPage({ onInsert }: { onInsert: (asset: SavedAsset) => void }) {
  const [assets, setAssets] = useState<SavedAsset[]>([])
  const [filter, setFilter] = useState<'all' | AssetKind>('all')
  const [query, setQuery] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const pageRef = useRef<HTMLElement>(null)

  useEffect(() => setAssets(loadAssets()), [])

  const tags = [...new Set(assets.flatMap((asset) => asset.tags ?? []))].sort()
  const visible = assets.filter((asset) => {
    const haystack = `${asset.name} ${asset.content}`.toLowerCase()
    const matchesQuery = !query.trim() || haystack.includes(query.trim().toLowerCase())
    const matchesKind = filter === 'all' || asset.kind === filter
    const matchesTag = !tagFilter || (asset.tags ?? []).includes(tagFilter)
    return matchesQuery && matchesKind && matchesTag
  })
  const copy = async (asset: SavedAsset) => {
    await navigator.clipboard?.writeText(asset.content)
  }
  const download = async (asset: SavedAsset) => {
    try {
      const blob = asset.content.startsWith('data:')
        ? await (await fetch(asset.content)).blob()
        : asset.kind === 'text' || asset.kind === 'prompt' || asset.kind === 'node'
          ? new Blob([asset.content], { type: 'text/plain;charset=utf-8' })
          : await (await fetch(asset.content)).blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${asset.name || 'magine-asset'}.${asset.kind === 'video' ? 'mp4' : asset.kind === 'audio' ? 'mp3' : asset.kind === 'image' ? 'png' : 'txt'}`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      window.open(asset.content, '_blank', 'noopener,noreferrer')
    }
  }

  useLayoutEffect(() => {
    const stopEntrance = animateEntrance(pageRef.current, '[data-motion-card]')
    const stopLift = bindCardLift(pageRef.current)
    return () => { stopEntrance(); stopLift() }
  }, [filter, query, tagFilter, assets.length])

  return (
    <main ref={pageRef} className="asset-page">
      <div className="asset-head">
        <div>
          <h2>资产</h2>
          <p>保存的提示词、文本和媒体都在这里，可随时放回自由画布。</p>
        </div>
        <span className="asset-count">{assets.length} 项</span>
      </div>
      <div className="asset-search-row">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索资产名称或内容…" />
        {tags.map((tag) => <button key={tag} type="button" className={tagFilter === tag ? 'active' : ''} onClick={() => setTagFilter(tagFilter === tag ? '' : tag)}>#{tag}</button>)}
      </div>
      <div className="asset-filters">
        {FILTERS.map((item) => (
          <button key={item.key} type="button" className={filter === item.key ? 'active' : ''} onClick={() => setFilter(item.key)}>
            {item.label}
          </button>
        ))}
      </div>
      {visible.length === 0 ? (
        <div className="asset-empty">还没有保存的资产。可以在画布节点右上角点击“存资产”。</div>
      ) : (
        <div className="asset-grid">
          {visible.map((asset) => (
            <article className="asset-card" data-motion-card key={asset.id}>
              <div className="asset-card-head"><span>{LABELS[asset.kind]}</span><time>{new Date(asset.createdAt).toLocaleString()}</time></div>
              {asset.kind === 'image' && <img src={asset.content} alt={asset.name} />}
              {asset.kind === 'video' && <video src={asset.content} controls />}
              {asset.kind === 'audio' && <audio src={asset.content} controls />}
              {(asset.kind === 'prompt' || asset.kind === 'text' || asset.kind === 'node') && <pre>{asset.content}</pre>}
              <h3>{asset.name}</h3>
              {(asset.sourceNodeId || asset.model || asset.ratio) && <div className="asset-source">来源节点：{asset.sourceNodeId ?? '未知'}{asset.model ? ` · ${asset.model}` : ''}{asset.ratio ? ` · ${asset.ratio}` : ''}</div>}
              <div className="asset-tags">
                {(asset.tags ?? []).map((tag) => <span key={tag}>#{tag}</span>)}
                <input
                  defaultValue={(asset.tags ?? []).join(', ')}
                  aria-label={`编辑${asset.name}标签`}
                  placeholder="添加标签，用逗号分隔"
                  onBlur={(e) => {
                    const nextTags = e.target.value.split(',').map((tag) => tag.trim()).filter(Boolean)
                    updateAsset(asset.id, { tags: nextTags })
                    setAssets(loadAssets())
                  }}
                />
              </div>
              <div className="asset-actions">
                {(asset.kind === 'prompt' || asset.kind === 'text' || asset.kind === 'node') && <button type="button" onClick={() => void copy(asset)}>复制</button>}
                <button type="button" onClick={() => void download(asset)}>导出</button>
                <button type="button" onClick={() => onInsert(asset)}>放入画布</button>
                <button type="button" className="danger" onClick={() => { removeAsset(asset.id); setAssets(loadAssets()) }}>删除</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  )
}
