// 小云雀风：选中节点 → 节点下方浮现宽大提示词框
// 整框可输入（绑定该节点 data.text）+ 底部工具条（＋/@/风格/模型/比例/画质/🎁预设/生成）
// 「生成」通过自定义事件 mc-run-node 触发 NodeCard 内部对应 run 逻辑（解耦，不动 12 分支）
// 预设 / 比例 / 模型面板用 React Portal 渲染到 body（脱离 .mc-prompt-box overflow 裁剪，永远最上层）
import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { createPortal } from 'react-dom'
import { loadAssets, savePromptPreset } from '../store/assets'

interface ModelOpt { id: string; label: string }

interface Props {
  selectedId: string | null
  text: string
  kind: string
  ratio: string
  model?: string
  modelOptions?: ModelOpt[]
  onPatchText: (t: string) => void
  onChangeRatio: (r: string) => void
  onChangeModel: (m: string) => void
  onAddFile: (files: File[]) => void
}

// 4 个比例（小云雀口径，删除 9:18 这种非标）
const RATIOS = ['9:16', '16:9', '3:4', '4:3']

// 9 条常用预设提示词
const PRESETS = [
  { icon: '🧑', cls: 'gi-pink', name: '写实肖像', prompt: '极致写实人像，影棚柔光，85mm 镜头，浅景深，皮肤纹理细腻，自然肤质，杂志级质感' },
  { icon: '🎨', cls: 'gi-purple', name: '二次元', prompt: '二次元厚涂动漫风格，鲜艳色彩，清晰线条，梦幻氛围，光影柔和，发光边缘' },
  { icon: '🖌', cls: 'gi-blue', name: '国风水墨', prompt: '中国风水墨意境，留白构图，淡墨晕染，雾气缭绕，禅意古朴，远山隐现' },
  { icon: '🎬', cls: 'gi-orange', name: '电影感', prompt: '电影质感胶片颗粒，高对比度冷色调，浅景深特写，导演级打光，arri Alexa 质感' },
  { icon: '📦', cls: 'gi-green', name: '产品图', prompt: '极简商业产品摄影，纯白背景，柔和顶光，无倒影，电商主图级，主角突出，超清细节' },
  { icon: '🏔', cls: 'gi-cyan', name: '风景大片', prompt: '史诗广角自然风景，金色阳光穿透云层，镜头光晕，远山湖泊倒影，国家地理级摄影' },
  { icon: '🔬', cls: 'gi-cyan', name: '微观特写', prompt: '微观特写镜头，超浅景深，自然光线，细节放大，昆虫或水滴，4K 微距摄影质感' },
  { icon: '🎥', cls: 'gi-purple', name: '视频跟拍', prompt: '稳定器跟拍运镜，平滑缓推，专业电影摄影，自然光线，主体清晰，背景柔和' },
  { icon: '⚡', cls: 'gi-pink', name: '赛博朋克', prompt: '低角度仰拍英雄镜头，雨夜霓虹，赛博朋克色调，雾气，强光反差，氛围紧张' },
]

const VIDEO_STYLES = [
  { icon: '🎬', name: '电影叙事', prompt: '电影级叙事风格，真实摄影质感，细腻光影，镜头语言清晰，节奏舒缓自然，画面有情绪递进' },
  { icon: '📱', name: '短视频爆款', prompt: '短视频高留存风格，开场快速抓住注意力，节奏明快，镜头切换利落，主体突出，画面鲜明' },
  { icon: '🌌', name: '梦幻奇幻', prompt: '梦幻奇幻风格，柔和发光，空气中有细小光粒，色彩绚丽，镜头缓慢推进，营造沉浸式氛围' },
  { icon: '🧊', name: '高级广告', prompt: '高级商业广告风格，极简构图，产品级布光，材质细节清晰，镜头稳定克制，画面干净高级' },
  { icon: '🎞️', name: '复古胶片', prompt: '复古胶片电影风格，颗粒质感，低饱和暖色调，轻微漏光，手持摄影感，怀旧氛围' },
  { icon: '⚡', name: '赛博未来', prompt: '赛博朋克未来风格，霓虹灯光，冷暖强对比，雨夜反光，快速运镜，科技感与压迫感并存' },
]

const PLACEHOLDER: Record<string, string> = {
  image: '描述你想要的画面内容…',
  video: '描述你想要的视频内容…',
  music: '描述你想要的音频 / 配乐…',
  llm: '给大模型的提示词…',
  agent: '给 Agent 的指令，例如：加一个生图节点并生成一只猫',
  prompt: '输入创作灵感…',
}

export default function NodePromptBar({
  selectedId, text, kind, ratio, model, modelOptions = [],
  onPatchText, onChangeRatio, onChangeModel, onAddFile,
}: Props) {
  const [showPreset, setShowPreset] = useState(false)
  const [savedPresets, setSavedPresets] = useState<{ name: string; prompt: string; icon: string; cls: string }[]>([])
  const [showRatio, setShowRatio] = useState(false)
  const [showModel, setShowModel] = useState(false)
  const [showStyle, setShowStyle] = useState(false)
  const [presetPos, setPresetPos] = useState<{ left: number; top: number } | null>(null)
  const [ratioPos, setRatioPos] = useState<{ left: number; top: number } | null>(null)
  const [modelPos, setModelPos] = useState<{ left: number; top: number } | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const presetBtnRef = useRef<HTMLButtonElement>(null)
  const ratioBtnRef = useRef<HTMLButtonElement>(null)
  const modelBtnRef = useRef<HTMLButtonElement>(null)
  const styleBtnRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const [stylePos, setStylePos] = useState<{ left: number; top: number } | null>(null)
  // 中文拼音 IME 兼容：本地 state 缓冲，上屏/失焦才同步到画布 store
  const [localText, setLocalText] = useState(text)
  // 外部 text 变化（切节点、预设填入）→ 同步本地
  useEffect(() => { setLocalText(text) }, [text])
  const commitText = (v: string) => {
    if (v !== text) onPatchText(v)
  }

  // 跟随选中节点位置（50ms 轮询 rect，简单可靠，覆盖拖动/缩放/平移）
  useEffect(() => {
    setSavedPresets(loadAssets().filter((a) => a.kind === 'prompt').map((a) => ({ name: a.name, prompt: a.content, icon: '⭐', cls: 'gi-yellow' })))
  }, [showPreset])

  useEffect(() => {
    if (!selectedId) { setPos(null); return }
    let raf = 0
    const tick = () => {
      const el = document.querySelector(`.react-flow__node[data-id="${selectedId}"]`)
      if (el) {
        const r = el.getBoundingClientRect()
        const w = boxRef.current?.offsetWidth ?? 560
        const gap = 24
        const boxHeight = boxRef.current?.offsetHeight ?? 220
        const belowTop = r.bottom + gap
        const top = belowTop + boxHeight <= window.innerHeight - 12
          ? belowTop
          : Math.max(12, r.top - boxHeight - gap)
        setPos({
          left: Math.max(12, Math.min(window.innerWidth - w - 12, r.left + r.width / 2 - w / 2)),
          top,
        })
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [selectedId])

  // 选中节点 → 自动聚焦输入框（解决输入法不弹、必须先点输入框才能打字）
  useEffect(() => {
    if (!selectedId) return
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        taRef.current?.focus({ preventScroll: true })
      })
    })
    return () => window.cancelAnimationFrame(id)
  }, [selectedId])

  // 点击外部关闭预设/比例/模型面板（均 portal 到 body，用 .closest 检测）
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (showRatio && ratioBtnRef.current && !ratioBtnRef.current.contains(t) && !t.closest('.mc-ratio-panel')) setShowRatio(false)
      if (showPreset && presetBtnRef.current && !presetBtnRef.current.contains(t) && !t.closest('.mc-preset-panel')) setShowPreset(false)
      if (showModel && modelBtnRef.current && !modelBtnRef.current.contains(t) && !t.closest('.mc-model-panel')) setShowModel(false)
      if (showStyle && styleBtnRef.current && !styleBtnRef.current.contains(t) && !t.closest('.mc-style-panel')) setShowStyle(false)
    }
    document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
  }, [showPreset, showRatio, showModel, showStyle])

  // 打开面板时记录 rect（用于 portal 位置）
  useEffect(() => {
    if (showPreset && presetBtnRef.current) {
      const r = presetBtnRef.current.getBoundingClientRect()
      const w = 240
      setPresetPos({ left: Math.max(12, Math.min(window.innerWidth - w - 12, r.left + r.width / 2 - w / 2)), top: r.top - 8 })
    } else setPresetPos(null)
  }, [showPreset])
  useEffect(() => {
    if (showRatio && ratioBtnRef.current) {
      const r = ratioBtnRef.current.getBoundingClientRect()
      const w = 180
      setRatioPos({ left: Math.max(12, Math.min(window.innerWidth - w - 12, r.left)), top: r.top - 8 })
    } else setRatioPos(null)
  }, [showRatio])
  useEffect(() => {
    if (showModel && modelBtnRef.current) {
      const r = modelBtnRef.current.getBoundingClientRect()
      const w = 220
      setModelPos({ left: Math.max(12, Math.min(window.innerWidth - w - 12, r.left)), top: r.top - 8 })
    } else setModelPos(null)
  }, [showModel])
  useEffect(() => {
    if (showStyle && styleBtnRef.current) {
      const r = styleBtnRef.current.getBoundingClientRect()
      const w = 260
      setStylePos({ left: Math.max(12, Math.min(window.innerWidth - w - 12, r.left)), top: r.top - 8 })
    } else setStylePos(null)
  }, [showStyle])

  if (!selectedId || !pos) return null

  const placeholder = PLACEHOLDER[kind] ?? '输入内容，或连接上游节点…'
  const modelLabel = modelOptions.find((o) => o.id === model)?.label ?? model ?? '选择模型'
  const hasModel = modelOptions.length > 0

  const runNode = () => {
    if (!selectedId) return
    // 强制把 IME 缓冲的本地文本同步到画布 store（避免拼音上屏后未触发 commit、）
    // 导致 NodeCard 读到旧 d.text 误判为空）
    if (localText !== text) onPatchText(localText)
    // 把当前最新文本随事件传给 NodeCard，避开 React 异步 render 闭包旧值问题
    document.dispatchEvent(
      new CustomEvent('mc-run-node', { detail: { id: selectedId, text: localText } }),
    )
  }

  const pickFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const fs = Array.from(e.target.files ?? [])
    if (fs.length) onAddFile(fs)
    e.target.value = ''
  }

  return (
    <div className="mc-prompt-box" ref={boxRef} style={{ left: pos.left, top: pos.top }}>
      <textarea
        ref={taRef}
        className="mc-prompt-input"
        value={localText}
        placeholder={placeholder}
        onChange={(e) => {
          const v = e.target.value
          setLocalText(v)
          // IME composition 期间不同步到 store，避免重渲染打断拼音上屏
          if (!(e.nativeEvent as InputEvent).isComposing) commitText(v)
        }}
        onCompositionEnd={(e) => {
          const v = e.currentTarget.value
          setLocalText(v)
          commitText(v)
        }}
        onBlur={(e) => commitText(e.currentTarget.value)}
      />
      <div className="mc-prompt-tools">
        <button className="mc-pt-btn round" title="添加文件" onClick={() => fileRef.current?.click()}>＋</button>
        <button className="mc-pt-btn round" title="引用">@</button>
        <button
          ref={styleBtnRef}
          className="mc-pt-btn"
          onClick={() => setShowStyle((v) => !v)}
        >🎨 风格 <span className="caret">▼</span></button>
        {hasModel && (
          <button
            ref={modelBtnRef}
            className="mc-pt-btn"
            title="模型（点击切换）"
            onClick={() => setShowModel((v) => !v)}
          >📊 {modelLabel} <span className="caret">▼</span></button>
        )}
        <div className="mc-ratio-wrap">
          <button
            ref={ratioBtnRef}
            className="mc-pt-btn"
            title="画面比例"
            onClick={() => setShowRatio((v) => !v)}
          >📱 {ratio} <span className="caret">▼</span></button>
        </div>
        <button className="mc-pt-btn">1K</button>
        <div className="mc-pt-grow" />
        <button
          ref={presetBtnRef}
          className="mc-pt-btn round"
          title="预设提示词"
          onClick={() => setShowPreset((v) => !v)}
        >🎁</button>
        <button className="mc-pt-btn solid" onClick={runNode}>生成 ↑</button>
      </div>

      {/* 模型面板：Portal 到 body，列出当前节点类型可用模型 */}
      {showStyle && stylePos && createPortal(
        <div className="mc-style-panel" style={{ position: 'fixed', left: stylePos.left, top: stylePos.top, bottom: 'auto' }}>
          <div className="mc-add-title">视频风格 · 选择模板</div>
          {VIDEO_STYLES.map((style) => (
            <button
              key={style.name}
              type="button"
              className="mc-style-item"
              onClick={() => {
                const next = localText.trim() ? `${localText.trim()}，${style.prompt}` : style.prompt
                setLocalText(next)
                onPatchText(next)
                setShowStyle(false)
              }}
            >
              <span className="mc-style-icon">{style.icon}</span>
              <span>
                <strong>{style.name}</strong>
                <small>{style.prompt}</small>
              </span>
            </button>
          ))}
        </div>,
        document.body,
      )}

      {/* 模型面板：Portal 到 body，列出当前节点类型可用模型 */}
      {showModel && modelPos && createPortal(
        <div className="mc-model-panel" style={{ position: 'fixed', left: modelPos.left, top: modelPos.top, bottom: 'auto' }}>
          <div className="mc-add-title">模型 · 切换</div>
          {modelOptions.map((o) => (
            <button
              key={o.id}
              type="button"
              className={`mc-model-item${o.id === model ? ' active' : ''}`}
              onClick={() => { onChangeModel(o.id); setShowModel(false) }}
            >
              <span className="mc-model-label">{o.label}</span>
              <span className="mc-model-id">{o.id}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}

      {/* 比例面板：Portal 到 body，最高层 fixed 定位，脱离任何父级 overflow 裁剪 */}
      {showRatio && ratioPos && createPortal(
        <div className="mc-ratio-panel" style={{ position: 'fixed', left: ratioPos.left, top: ratioPos.top, bottom: 'auto' }}>
          {RATIOS.map((r) => (
            <button
              key={r}
              type="button"
              className={`mc-ratio-item${r === ratio ? ' active' : ''}`}
              onClick={() => { onChangeRatio(r); setShowRatio(false) }}
            >
              <span className="mc-ratio-name">{r}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}

      {/* 预设提示词面板：Portal 到 body，最高层 fixed 定位 */}
      {showPreset && presetPos && createPortal(
        <div className="mc-preset-panel" style={{ position: 'fixed', left: presetPos.left, top: presetPos.top, bottom: 'auto' }}>
          <div className="mc-add-title">预设提示词 · 点选填入</div>
          {[...PRESETS, ...savedPresets].map((p) => (
            <button
              key={p.name}
              type="button"
              className="mc-preset-item"
              onClick={() => { onPatchText(p.prompt); setShowPreset(false) }}
            >
              <span className={`mc-add-ic ${p.cls}`}>{p.icon}</span>
              <span className="mc-preset-name">{p.name}</span>
            </button>
          ))}
          <button
            type="button"
            className="mc-preset-save"
            onClick={() => {
              if (!text.trim()) return
              savePromptPreset('我的提示词', text, selectedId)
              setSavedPresets(loadAssets().filter((a) => a.kind === 'prompt').map((a) => ({ name: a.name, prompt: a.content, icon: '⭐', cls: 'gi-yellow' })))
            }}
          >＋ 保存当前为预设提示词</button>
        </div>,
        document.body,
      )}

      <input ref={fileRef} type="file" multiple hidden accept="image/*,video/*,.pdf,.doc,.docx,.txt,.md" onChange={pickFiles} />
    </div>
  )
}
