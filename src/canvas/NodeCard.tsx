// S1.6 节点卡片（自定义 React Flow 节点）：白卡 + 标题栏 + 左右锚点 + 状态徽标
// S2.4：LLM 节点对话交互（输入 → 调火山 → 结果回写节点 data）
// S2.5：所有节点可编辑文本（Prompt 等），LLM 可从上游连线自动取文本
// S2.6：异步状态机（idle/running/done/failed 徽标 + 节点 data 回写）已通用化
// S2.7：Image 节点接火山 Seedream 文生图，结果（图片 URL）回写并展示
// S2.8：Video 节点接火山 Seedance 文生视频（异步轮询结果）
// S2.9：Music 节点接 MiniMax 音乐生成
// S2.10：数据依赖检查（上游未生成则下游中断并精准提示）
import { Handle, NodeResizer, Position, type NodeProps, useReactFlow } from '@xyflow/react'
import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, MouseEvent } from 'react'
import { getKey } from '../settings/vaultStore'
import { volcanoChat, deepseekChat, runAgentLoop, createRendererEnvApi, selectProvider } from '../gateway'
import { seedreamGenerate } from '../gateway/seedream'
import { seedanceGenerate } from '../gateway/seedance'
import { minimaxMusic } from '../gateway/minimax'
import { klingTextToVideo } from '../gateway/kling'
import { enhanceImage } from '../gateway/enhance'
import { checkFaceCompliance } from '../gateway/face'
import type { AgentToolCall } from '../gateway'
import { buildCanvasApi } from './canvasApi'
import PanoramaView from './PanoramaView'
import type { NodeCardData, NodeStatus } from './types'
import { STATUS_LABEL, STATUS_COLOR } from './types'
import { getModelOptions, getDefaultModel, ratioToSeedreamSize } from './modelOptions'
import { saveAsset, saveAssetIfNew, savePromptPreset, type AssetKind } from '../store/assets'

// S4.1 图像编辑节点（edit）的编辑模式：复刻小云雀后期工具栏
// 每种模式把用户提示词包装成对应的 Seedream 图生图指令（拿上游原图作参考图重绘）。
export interface EditMode {
  id: string
  name: string
  build: (userPrompt: string) => string
}
export const EDIT_MODES: EditMode[] = [
  { id: 'inpaint', name: '局部重绘', build: (p) => `保持画面整体不变，仅精细修改指定区域：${p || '按语义优化局部细节、去除瑕疵'}` },
  { id: 'outpaint', name: '扩图', build: (p) => `将画面向四周智能扩展延伸，保持原有风格与构图连贯，新增区域内容：${p || '自然延展的背景与环境'}` },
  { id: 'style', name: '换风格', build: (p) => `保持画面主体与构图不变，整体转换为「${p || '电影感'}」风格` },
  { id: 'lighting', name: '打光', build: (p) => `重新布光，调整光影层次与氛围：${p || '自然柔光、增强立体感'}` },
  { id: 'lens', name: '镜头', build: (p) => `调整为「${p || '中景'}」镜头视角与景别，改变透视与焦距，保持主体` },
  { id: 'portrait', name: '人像', build: (p) => `优化人像：提升肤质细腻度、增强五官立体感与眼神光${p ? '，' + p : ''}` },
  { id: 'makeup', name: '妆容', build: (p) => `为人物添加「${p || '自然淡妆'}」妆容，保持肤色自然、不发灰` },
]

// S4.2 一次生成的结果数量（复刻小云雀多结果切换；4 张可在节点内左右切换）
const RESULT_COUNT = 4

// S2.13 撤销/重做栈（模块级，跨同一画布的所有 NodeCard 实例共享同一画布状态）
let _undoStack: { nodes: unknown[]; edges: unknown[] }[] = []
let _redoStack: { nodes: unknown[]; edges: unknown[] }[] = []
function _cloneState<T>(x: T): T {
  return JSON.parse(JSON.stringify(x))
}

export default function NodeCard({ id, data, selected }: NodeProps) {
  const d = data as NodeCardData
  const status: NodeStatus = d.status ?? 'idle'
  const { setNodes, getNodes, getEdges, setEdges } = useReactFlow()
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [assetSaved, setAssetSaved] = useState(false)
  const agentAbortRef = useRef<AbortController | null>(null)

  // 中文拼音输入法兼容：textarea 用本地 state 缓冲，IME 上屏/失焦才同步到 store
  const [localText, setLocalText] = useState<string>(d.text ?? '')
  // 外部 d.text 变化（其他路径改了 text，比如 NodePromptBar 预设填入、Agent run）→ 同步到本地
  useEffect(() => { setLocalText(d.text ?? '') }, [d.text])
  const commitText = (v: string) => {
    if (v !== (d.text ?? '')) patch({ text: v })
  }

  // 更新自身节点 data（text / status / result / imageUrl 回写）
  const patch = (p: Partial<NodeCardData>) =>
    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...p } } : n)))

  // S3.7 防御：节点 data.model 可能是旧模型 ID（例如代码更新前创建的节点/缓存），
  // 若不在当前可用列表里，自动 fallback 到当前默认模型，避免报 ModelNotOpen。
  const resolveModel = (): string => {
    const opts = getModelOptions(d.nodeTypeId)
    if (d.model && opts.some((o) => o.id === d.model)) return d.model
    return getDefaultModel(d.nodeTypeId) || d.model || ''
  }

  // S3.8 / S3.10：image/video 节点自动同步上游图像节点的产出作为参考图，做到「拉线即喂参考图」
  useEffect(() => {
    if (d.nodeTypeId !== 'video' && d.nodeTypeId !== 'image') return
    const up = upstreamNodes()
    const imgNode = up.find((n) => n.nodeTypeId === 'image' && n.imageUrl)
    const ref = imgNode?.imageUrl
    if (ref && ref !== d.refImageUrl) patch({ refImageUrl: ref })
  }, [getEdges(), getNodes()])

  // 下载节点图片（dataURL / 远端 URL 都支持）
  const downloadImage = async (url: string, name = 'generated.png') => {
    try {
      if (url.startsWith('data:')) {
        const a = document.createElement('a')
        a.href = url
        a.download = name
        a.click()
        return
      }
      const r = await fetch(url)
      const blob = await r.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = name
      a.click()
      URL.revokeObjectURL(blobUrl)
    } catch (e) {
      setErr(`下载失败：${(e as Error).message}`)
    }
  }

  const setText = (t: string) => patch({ text: t })

  function saveCurrentAsAsset() {
    const kind: AssetKind = d.nodeTypeId === 'prompt' ? 'prompt' : d.nodeTypeId === 'llm' ? 'text' : d.nodeTypeId === 'image' || d.nodeTypeId === 'edit' ? 'image' : d.nodeTypeId === 'video' ? 'video' : d.nodeTypeId === 'music' ? 'audio' : 'node'
    const content = d.text || d.result || d.imageUrl || d.videoUrl || d.audioUrl || ''
    if (!content) {
      setErr('当前节点还没有可保存的内容')
      return
    }
    if (kind === 'prompt') savePromptPreset(d.label || '未命名提示词', content, id)
    else saveAsset({ name: d.label || `${d.kind}资产`, kind, content, sourceNodeId: id, sourceNodeType: d.nodeTypeId, model: d.model, ratio: d.ratio, prompt: d.text })
    setAssetSaved(true)
    window.setTimeout(() => setAssetSaved(false), 1800)
  }

  // S2.5：收集上游节点的 text（连到本节点 target 的边），实现"Prompt 喂下游"
  const upstreamText = (): string => {
    const edges = getEdges()
    const nodes = getNodes()
    const srcIds = edges.filter((e) => e.target === id).map((e) => e.source)
    return srcIds
      .map((sid) => {
        const n = nodes.find((x) => x.id === sid)
        const t = n?.data ? (n.data as NodeCardData).text : undefined
        return t ? String(t) : ''
      })
      .filter(Boolean)
      .join('\n')
  }

  const resolvePrompt = (): string => (d.text && d.text.trim()) || upstreamText()

  // S2.10 数据依赖检查：拿到所有直接上游节点对象
  const upstreamNodes = (): NodeCardData[] => {
    const edges = getEdges()
    const nodes = getNodes()
    const srcIds = edges.filter((e) => e.target === id).map((e) => e.source)
    return srcIds
      .map((sid) => {
        const n = nodes.find((x) => x.id === sid)
        return n ? (n.data as NodeCardData) : undefined
      })
      .filter(Boolean) as NodeCardData[]
  }

  // 上游是否已有产出（文本 / 生成结果 / 图片 / 视频 / 音频）
  const upstreamHasOutput = (): boolean =>
    upstreamNodes().some(
      (n) =>
        (n.text && n.text.trim()) ||
        n.result ||
        n.imageUrl ||
        n.videoUrl ||
        n.audioUrl,
    )

  // 精准的"无 prompt"错误提示：区分"上游未生成"与"完全没内容"
  const emptyPromptErr = (): string => {
    if (upstreamNodes().length > 0 && !upstreamHasOutput()) {
      return '上游节点还没生成内容，请先运行上游节点，或将内容直接输入本节点'
    }
    return '请先输入内容，或上游连接一个已生成的文本节点'
  }

  async function runLLM(overridePrompt?: string | MouseEvent) {
    const provider = selectProvider('text')
    if (!provider) {
      setErr('没有可用的 LLM 服务商')
      return
    }
    const key = getKey(provider.id)
    if (!key) {
      setErr(`请先在"设置"里填 ${provider.name} Key 并解锁`)
      return
    }
    const prompt = (typeof overridePrompt === 'string' && overridePrompt.trim()) || resolvePrompt()
    if (!prompt) {
      setErr(emptyPromptErr())
      return
    }
    setLoading(true)
    setErr('')
    patch({ status: 'running', result: '' })
    try {
      const model = resolveModel()
      const r =
        provider.id === 'deepseek'
          ? await deepseekChat(
              key,
              [{ role: 'user', content: prompt }],
              model || getKey('deepseek_model') || undefined,
            )
          : await volcanoChat(key, [{ role: 'user', content: prompt }], model)
      patch({ status: 'done', result: r })
      saveAssetIfNew({ name: `${d.label || 'LLM'} 输出`, kind: 'text', content: r, sourceNodeId: id, sourceNodeType: d.nodeTypeId, model: resolveModel(), prompt: d.text, tags: ['自动结果'] })
    } catch (e) {
      patch({ status: 'failed', result: (e as Error).message })
      setErr((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function runImage(overridePrompt?: string | MouseEvent) {
    const key = getKey('volcano')
    if (!key) {
      setErr('请先在"设置"里填火山 Key 并解锁')
      return
    }
    const prompt = (typeof overridePrompt === 'string' && overridePrompt.trim()) || resolvePrompt()
    if (!prompt) {
      setErr(emptyPromptErr())
      return
    }
    // S3.10：图生图取最近上游 image 节点的生成图作为参考图
    const imgUp = upstreamNodes().find((n) => n.nodeTypeId === 'image')
    if (imgUp && !imgUp.imageUrl) {
      setErr('上游图片节点还没生成图片（图生图需参考图），请先运行该图片节点')
      return
    }
    setLoading(true)
    setErr('')
    patch({ status: 'running', imageUrl: '' })
    try {
      const size = ratioToSeedreamSize(d.ratio)
      const refUrl = imgUp?.imageUrl
      if (refUrl && refUrl !== d.refImageUrl) patch({ refImageUrl: refUrl })
      const urls = await seedreamGenerate(key, prompt, size, RESULT_COUNT, resolveModel(), refUrl, {
        seed: d.seed,
        resolution: d.resolution ?? 'standard',
      })
      patch({ status: 'done', imageUrl: urls[0] ?? '', results: urls, resultIndex: 0 })
      if (urls[0]) saveAssetIfNew({ name: `${d.label || '图片'} 输出`, kind: 'image', content: urls[0], sourceNodeId: id, sourceNodeType: d.nodeTypeId, model: resolveModel(), ratio: d.ratio, prompt, tags: ['自动结果'] })
    } catch (e) {
      patch({ status: 'failed', result: (e as Error).message })
      setErr((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function runEdit(overridePrompt?: string | MouseEvent) {
    const key = getKey('volcano')
    if (!key) {
      setErr('请先在"设置"里填火山 Key 并解锁')
      return
    }
    // S4.1：图像编辑必须连接上游「图像」节点并先生成图片，拿它作参考图重绘
    const imgUp = upstreamNodes().find((n) => n.nodeTypeId === 'image' && n.imageUrl)
    if (!imgUp?.imageUrl) {
      setErr('图像编辑需先连接上游「图像」节点并生成图片（作为参考原图）')
      return
    }
    const userPrompt = (typeof overridePrompt === 'string' && overridePrompt.trim()) || resolvePrompt()
    const mode = EDIT_MODES.find((m) => m.id === d.editMode) ?? EDIT_MODES[0]
    const prompt = mode.build(userPrompt)
    setLoading(true)
    setErr('')
    patch({ status: 'running', imageUrl: '' })
    try {
      const size = ratioToSeedreamSize(d.ratio)
      const refUrl = imgUp.imageUrl
      if (refUrl !== d.refImageUrl) patch({ refImageUrl: refUrl })
      const urls = await seedreamGenerate(key, prompt, size, RESULT_COUNT, resolveModel(), refUrl, {
        seed: d.seed,
        resolution: d.resolution ?? 'standard',
      })
      patch({ status: 'done', imageUrl: urls[0] ?? '', results: urls, resultIndex: 0 })
      if (urls[0]) saveAssetIfNew({ name: `${d.label || '编辑'} 输出`, kind: 'image', content: urls[0], sourceNodeId: id, sourceNodeType: d.nodeTypeId, model: resolveModel(), ratio: d.ratio, prompt, tags: ['自动结果'] })
    } catch (e) {
      patch({ status: 'failed', result: (e as Error).message })
      setErr((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function runVideo(overridePrompt?: string | MouseEvent) {
    const klingAccess = getKey('kling')
    const klingSecret = getKey('kling_secret')
    const useKling = Boolean(klingAccess && klingSecret)
    const volcanoKey = getKey('volcano')
    const key = useKling ? klingAccess : volcanoKey
    if (klingAccess && !klingSecret && !volcanoKey) {
      setErr('检测到 Kling Access Key，还需要在设置中补充 Kling Secret Key')
      return
    }
    if (!key) {
      setErr('请先在"设置"里填火山 Key 并解锁')
      return
    }
    // S2.10 / S3.8：图生视频依赖上游图片节点已生成首帧图
    const imgUp = upstreamNodes().find((n) => n.nodeTypeId === 'image')
    if (imgUp && !imgUp.imageUrl) {
      setErr('上游图片节点还没生成图片（图生视频需首帧图），请先运行该图片节点')
      return
    }
    const prompt = (typeof overridePrompt === 'string' && overridePrompt.trim()) || resolvePrompt()
    if (!prompt) {
      setErr(emptyPromptErr())
      return
    }
    setLoading(true)
    setErr('')
    patch({ status: 'running', videoUrl: '' })
    try {
      const refUrl = imgUp?.imageUrl
      if (refUrl && refUrl !== d.refImageUrl) patch({ refImageUrl: refUrl })
      const url = useKling
        ? await klingTextToVideo(klingAccess, klingSecret, prompt, d.ratio ?? '9:16')
        : await seedanceGenerate(key, prompt, resolveModel(), refUrl, {
            duration: d.duration ?? 5,
            seed: d.seed,
            resolution: d.resolution ?? 'standard',
          })
      patch({ status: 'done', videoUrl: url })
      saveAssetIfNew({ name: `${d.label || '视频'} 输出`, kind: 'video', content: url, sourceNodeId: id, sourceNodeType: d.nodeTypeId, model: resolveModel(), ratio: d.ratio, prompt, tags: ['自动结果'] })
    } catch (e) {
      patch({ status: 'failed', result: (e as Error).message })
      setErr((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const isLLM = d.nodeTypeId === 'llm'
  const isImage = d.nodeTypeId === 'image'
  const isEdit = d.nodeTypeId === 'edit'
  const isVideo = d.nodeTypeId === 'video'
  const isMusic = d.nodeTypeId === 'music'
  const isAgent = d.nodeTypeId === 'agent'
  const isMaterial = d.nodeTypeId === 'material'
  const isStoryboard = d.nodeTypeId === 'storyboard'
  const isRegion = d.nodeTypeId === 'region'
  const isPanorama = d.nodeTypeId === 'panorama'
  const isTopaz = d.nodeTypeId === 'topaz'
  const isFace = d.nodeTypeId === 'face'

  // S3.6：三节点共用的"取图"解析：优先上游图像节点已生成图，其次上游素材节点的图片 dataURL，再次本节点自带 imageUrl
  const resolveImageSource = (): string | undefined => {
    const up = upstreamNodes()
    const imgNode = up.find((n) => n.nodeTypeId === 'image' && n.imageUrl)
    if (imgNode?.imageUrl) return imgNode.imageUrl
    const matNode = up.find((n) => n.nodeTypeId === 'material' && Array.isArray(n.files))
    const f = matNode?.files?.find((x) => x.dataUrl)
    if (f?.dataUrl) return f.dataUrl
    if (d.imageUrl) return d.imageUrl
    return undefined
  }

  // S4.2 多图结果切换：左右翻看本次生成的多张结果（复刻小云雀"结果 N 可切前一张"）
  const switchResult = (dir: 1 | -1) => {
    const list = d.results
    if (!list || list.length <= 1) return
    const cur = d.resultIndex ?? 0
    const next = (cur + dir + list.length) % list.length
    patch({ resultIndex: next, imageUrl: list[next] ?? d.imageUrl })
  }

  async function runMusic(overridePrompt?: string | MouseEvent) {
    const key = getKey('minimax')
    const group = getKey('minimax_group') ?? ''
    if (!key) {
      setErr('请先在"设置"里填 MiniMax Key（音乐/语音底座）并解锁')
      return
    }
    const prompt = (typeof overridePrompt === 'string' && overridePrompt.trim()) || resolvePrompt()
    if (!prompt) {
      setErr(emptyPromptErr())
      return
    }
    setLoading(true)
    setErr('')
    patch({ status: 'running', audioUrl: '' })
    try {
      const url = await minimaxMusic(key, group, prompt, resolveModel())
      patch({ status: 'done', audioUrl: url })
      saveAssetIfNew({ name: `${d.label || '音乐'} 输出`, kind: 'audio', content: url, sourceNodeId: id, sourceNodeType: d.nodeTypeId, model: resolveModel(), prompt, tags: ['自动结果'] })
    } catch (e) {
      patch({ status: 'failed', result: (e as Error).message })
      setErr((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  // S2.11 / S2.15：Agent 的"画布手"——复用共享 buildCanvasApi（与全局入口同源，避免双源不一致）
  const canvasApi = buildCanvasApi({ setNodes, getNodes, getEdges, setEdges })

  // S3.3 素材节点：本地文件导入引用（图片存缩略 dataURL，非图片存文件名）
  const [matFiles, setMatFiles] = useState<{ name: string; size: number; dataUrl?: string }[]>(d.files ?? [])
  const onPickFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? [])
    if (picked.length === 0) return
    const next: { name: string; size: number; dataUrl?: string }[] = []
    let pending = picked.length
    const commit = () => { setMatFiles(next); patch({ files: next }) }
    picked.forEach((f) => {
      const base = { name: f.name, size: f.size }
      if (f.type.startsWith('image/')) {
        const r = new FileReader()
        r.onload = () => { next.push({ ...base, dataUrl: String(r.result) }); if (--pending === 0) commit() }
        r.readAsDataURL(f)
      } else { next.push(base); if (--pending === 0) commit() }
    })
  }

  // S3.3 分镜节点：基础手绘板（canvas 鼠标绘制 + 清空）
  const sbRef = useRef<HTMLCanvasElement>(null)
  const sbDrawing = useRef(false)
  const sbPos = (e: MouseEvent) => {
    const c = sbRef.current
    if (!c) return null
    const r = c.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const sbDown = (e: MouseEvent) => {
    sbDrawing.current = true
    const p = sbPos(e)
    const ctx = sbRef.current?.getContext('2d')
    if (p && ctx) { ctx.beginPath(); ctx.moveTo(p.x, p.y) }
  }
  const sbMove = (e: MouseEvent) => {
    if (!sbDrawing.current) return
    const p = sbPos(e)
    const c = sbRef.current
    const ctx = c?.getContext('2d')
    if (p && ctx && c) { ctx.strokeStyle = '#2b2d42'; ctx.lineWidth = 2; ctx.lineTo(p.x, p.y); ctx.stroke() }
  }
  const sbUp = () => { sbDrawing.current = false }
  const sbClear = () => { const c = sbRef.current; const ctx = c?.getContext('2d'); if (c && ctx) ctx.clearRect(0, 0, c.width, c.height) }

  // S3.3 区域节点：定义区域名 + 统计本区域成员
  const regionName = (d.regionName ?? '区域').trim() || '区域'
  const regionMembers = () =>
    getNodes().filter((n) => (n.data as NodeCardData)?.region === regionName).length

  async function runAgent(overridePrompt?: string | MouseEvent) {
    if (agentAbortRef.current) return
    const provider = selectProvider('text')
    if (!provider) {
      setErr('没有可用的 LLM 服务商')
      return
    }
    const key = getKey(provider.id)
    if (!key) {
      setErr(`请先在"设置"里填 ${provider.name} Key 并解锁`)
      return
    }
    const instruction =
      (typeof overridePrompt === 'string' && overridePrompt.trim())
      || (d.text && d.text.trim())
      || resolvePrompt()
    if (!instruction) {
      setErr('请输入给 Agent 的指令（例如：加一个生图节点，生成一只猫）')
      return
    }
    setLoading(true)
    setErr('')
    const controller = new AbortController()
    agentAbortRef.current = controller
    patch({ status: 'running', agentThink: '', agentText: '', agentTrace: [], result: '' })
    try {
      let think = ''
      let live = ''
      const trace: { tool: string; args: Record<string, unknown>; result: string }[] = []
      await runAgentLoop(
        { apiKey: key, canvas: canvasApi, env: createRendererEnvApi(), signal: controller.signal },
        instruction,
        {
          onThink: (delta) => {
            think += delta
            patch({ agentThink: think })
          },
          onText: (delta) => {
            live += delta
            patch({ agentText: live })
          },
          onTool: (call: AgentToolCall, result) => {
            trace.push({ tool: call.tool, args: call.args, result })
            patch({ agentTrace: [...trace] })
          },
          onFinal: (text) => {
            // 完成：最终结论写入 result，实时区清空（避免与结论重复）
            patch({ status: 'done', result: text, agentText: '' })
          },
          onError: (e) => {
            setErr(e)
            patch({ status: 'failed', result: e })
          },
          onCancel: () => {
            setErr('已取消本次 Agent 执行')
            patch({ status: 'failed', result: '已取消本次 Agent 执行' })
          },
        },
      )
    } finally {
      agentAbortRef.current = null
      setLoading(false)
    }
  }

  const cancelAgent = () => agentAbortRef.current?.abort()

  // S3.6 全景：取上游/素材图或本地导入等距全景图，交给 Three.js 查看器环视
  async function runPanorama() {
    const src = resolveImageSource()
    if (!src) {
      setErr('请上游连接图像节点 / 素材节点，或在下方本地导入等距全景图')
      return
    }
    patch({ panoramaUrl: src, status: 'done' })
  }

  async function runPanoramaAI() {
    const key = getKey('volcano')
    if (!key) {
      setErr('请先在"设置"里填火山 Key 并解锁')
      return
    }
    const prompt = resolvePrompt() || '一张可用于 360 度环视的 2:1 等距全景图，空间结构完整，地平线平直，画面无文字无水印'
    setLoading(true)
    setErr('')
    patch({ status: 'running' })
    try {
      const urls = await seedreamGenerate(key, `生成 2:1 等距全景图：${prompt}`, '2048x1024', 1, resolveModel(), undefined, { resolution: 'high' })
      if (!urls[0]) throw new Error('全景图生成成功但未返回图片')
      patch({ panoramaUrl: urls[0], status: 'done', result: 'AI 全景图生成完成' })
    } catch (e) {
      patch({ status: 'failed', result: (e as Error).message })
      setErr((e as Error).message)
    } finally {
      setLoading(false)
    }
  }
  const onPickPano = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    const r = new FileReader()
    r.onload = () => patch({ panoramaUrl: String(r.result), status: 'done' })
    r.readAsDataURL(f)
  }

  // S3.6 画质增强：上游/素材图 → 火山 AI 高清修复（失败降级本地）
  async function runTopaz() {
    const key = getKey('volcano')
    const src = resolveImageSource()
    if (!src) {
      setErr('请上游连接图像节点 / 素材节点，或本节点先生成图片')
      return
    }
    setLoading(true)
    setErr('')
    patch({ status: 'running', imageUrl: '' })
    try {
      const r = await enhanceImage(key, src)
      patch({ status: 'done', imageUrl: r.url, result: `画质增强完成（${r.note}）` })
    } catch (e) {
      patch({ status: 'failed', result: (e as Error).message })
      setErr((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function blurFaceRegions(src: string, regions: { x: number; y: number; width: number; height: number }[]) {
    return new Promise<string>((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('无法创建模糊画布'))
          return
        }
        ctx.drawImage(img, 0, 0)
        const boxes = regions.length ? regions : [{ x: 0, y: 0, width: 1, height: 1 }]
        boxes.forEach((r) => {
          const x = Math.max(0, Math.floor(r.x * canvas.width))
          const y = Math.max(0, Math.floor(r.y * canvas.height))
          const w = Math.min(canvas.width - x, Math.floor(r.width * canvas.width))
          const h = Math.min(canvas.height - y, Math.floor(r.height * canvas.height))
          if (w <= 0 || h <= 0) return
          ctx.save()
          ctx.beginPath()
          ctx.rect(x, y, w, h)
          ctx.clip()
          ctx.filter = 'blur(18px)'
          ctx.drawImage(img, 0, 0)
          ctx.restore()
        })
        resolve(canvas.toDataURL('image/jpeg', 0.88))
      }
      img.onerror = () => reject(new Error('图片无法在本地处理'))
      img.src = src
    })
  }

  // S3.6 人脸合规：上游/素材图 → 火山视觉理解做平台合规初筛
  async function runFace() {
    const key = getKey('volcano')
    if (!key) {
      setErr('请先在"设置"里填火山 Key 并解锁')
      return
    }
    const src = resolveImageSource()
    if (!src) {
      setErr('请上游连接图像节点 / 素材节点，或本节点先生成图片')
      return
    }
    setLoading(true)
    setErr('')
    patch({ status: 'running', result: '' })
    try {
      const c = await checkFaceCompliance(key, src)
      let blurNote = ''
      if (c.faceCount > 0) {
        try {
          const blurred = await blurFaceRegions(src, c.regions)
          patch({ faceBlurUrl: blurred })
          blurNote = c.regions.length ? '已生成局部人脸模糊图' : '未返回人脸区域，已生成保守全图模糊图'
        } catch {
          blurNote = '检测完成，但当前图片无法在本地生成模糊图（可能是跨域图片）'
        }
      }
      const lines = [
        c.compliant ? '✅ 合规' : '⚠️ 不合规',
        `清晰：${c.clear ? '是' : '否'}`,
        `遮挡：${c.occlusion ? '有' : '无'}`,
        `水印：${c.watermark ? '有' : '无'}`,
        `人脸数：${c.faceCount}`,
        blurNote,
        c.reasons.length ? `注意：${c.reasons.join('；')}` : '',
      ].filter(Boolean)
      patch({ status: 'done', result: lines.join('\n') })
    } catch (e) {
      patch({ status: 'failed', result: (e as Error).message })
      setErr((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  // 小云雀风：NodePromptBar「生成」按钮 → 自定义事件触发本节点对应 run
  useEffect(() => {
    const handler = (e: Event) => {
      const ev = e as CustomEvent<{ id: string; text: string }>
      if (ev.detail.id !== id) return
      // 优先用事件传过来的最新 text（IME 缓冲刚 commit 到本地但 store 可能异步；）
      // detail.text 是 NodePromptBar 的当前真实值，避免 React 闭包读取旧 d.text
      const incomingText = ev.detail.text ?? d.text ?? ''
      const t = d.nodeTypeId
      if (t === 'llm') {
        if (incomingText) patch({ text: incomingText })
        void runLLM(incomingText)
      } else if (t === 'image') {
        if (incomingText) patch({ text: incomingText })
        void runImage(incomingText)
      } else if (t === 'video') {
        if (incomingText) patch({ text: incomingText })
        void runVideo(incomingText)
      } else if (t === 'music') {
        if (incomingText) patch({ text: incomingText })
        void runMusic(incomingText)
      } else if (t === 'agent') {
        void runAgent(incomingText)
      } else if (t === 'panorama') {
        void runPanorama()
      } else if (t === 'topaz') {
        void runTopaz()
      } else if (t === 'face') {
        void runFace()
      } else if (t === 'prompt') {
        // 提示词节点：内容走 DeepSeek V4 Flash（提示词模块 = LLM 调用）
        if (incomingText.trim()) {
          patch({ text: incomingText, model: resolveModel() || 'deepseek-v4-flash' })
          void runLLM(incomingText)
        } else {
          setErr('请先在下方输入框输入提示词')
        }
      } else if (t === 'edit') {
        void runEdit(incomingText)
      }
    }
    document.addEventListener('mc-run-node', handler)
    return () => document.removeEventListener('mc-run-node', handler)
  })

  return (
    <div className={`node-card node-card-${d.nodeTypeId}${isImage ? ' node-card-image' : ''}`}>
      <NodeResizer
        isVisible={Boolean(selected)}
        minWidth={d.nodeTypeId === 'llm' ? 300 : 240}
        maxWidth={d.nodeTypeId === 'llm' ? 620 : 760}
        minHeight={d.nodeTypeId === 'llm' ? 220 : 180}
        maxHeight={d.nodeTypeId === 'llm' ? 620 : 900}
        lineStyle={{ borderColor: '#8b74ff', borderWidth: 1 }}
        handleStyle={{ width: 8, height: 8, borderRadius: 4, background: '#fff', border: '2px solid #7c5cff' }}
      />
      <div className="node-card-head">
        <span className="node-dot" />
        <span className="node-kind">{d.kind}</span>
        <span className="node-status" style={{ color: STATUS_COLOR[status] }}>
          {STATUS_LABEL[status]}
        </span>
        <button className="node-save-asset" type="button" onClick={saveCurrentAsAsset} title={d.nodeTypeId === 'prompt' ? '保存为预设提示词' : '保存为资产'}>
          {assetSaved ? '已保存' : d.nodeTypeId === 'prompt' ? '存预设' : '存资产'}
        </button>
      </div>

      <div className="node-llm">
        <textarea
          className="node-llm-input"
          value={localText}
          placeholder={isAgent ? '给 Agent 的指令，例如：加一个生图节点并生成一只猫' : '输入内容，或连接上游节点…'}
          onChange={(e) => {
            const v = e.target.value
            setLocalText(v)
            // 非 IME composition 期间才实时同步到 store（避免 React Flow 重渲染打断中文拼音上屏）
            if (!(e.nativeEvent as InputEvent).isComposing) commitText(v)
          }}
          onCompositionEnd={(e) => {
            const v = e.currentTarget.value
            setLocalText(v)
            commitText(v)
          }}
          onBlur={(e) => commitText(e.currentTarget.value)}
        />
        {(isImage || isVideo) && (
          <div className="node-param-grid">
            <label>
              分辨率
              <select value={d.resolution ?? 'standard'} onChange={(e) => patch({ resolution: e.target.value as 'standard' | 'high' })}>
                <option value="standard">标准</option>
                <option value="high">高清</option>
              </select>
            </label>
            {isVideo && (
              <label>
                时长
                <select value={d.duration ?? 5} onChange={(e) => patch({ duration: Number(e.target.value) })}>
                  <option value={5}>5 秒</option>
                  <option value={10}>10 秒</option>
                </select>
              </label>
            )}
            <label>
              Seed
              <input
                type="number"
                placeholder="随机"
                value={d.seed ?? ''}
                onChange={(e) => patch({ seed: e.target.value === '' ? undefined : Number(e.target.value) })}
              />
            </label>
          </div>
        )}
        {isLLM && (
          <>
            <button className="node-llm-run" onClick={runLLM} disabled={loading}>
              {loading ? '生成中…' : '运行'}
            </button>
            {d.result && <div className="node-llm-result">{d.result}</div>}
          </>
        )}
        {(isImage || isEdit) && (
          <>
            {isImage && (
              <button className="node-llm-run" onClick={runImage} disabled={loading}>
                {loading ? '生图中…' : '生图'}
              </button>
            )}
            {isEdit && (
              <>
                <select
                  className="node-edit-mode"
                  value={d.editMode ?? 'inpaint'}
                  onChange={(e) => patch({ editMode: e.target.value })}
                >
                  {EDIT_MODES.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <button className="node-llm-run" onClick={runEdit} disabled={loading}>
                  {loading ? '编辑中…' : '编辑'}
                </button>
              </>
            )}
            {d.refImageUrl && (
              <div className="node-ref-img">
                <div className="node-ref-label">参考图</div>
                <img
                  className="node-ref-thumb"
                  src={d.refImageUrl}
                  alt="参考图"
                  onClick={() => setPreviewUrl(d.refImageUrl!)}
                />
              </div>
            )}
            {d.results && d.results.length > 1 && (
              <div className="node-result-switch">
                <button className="node-result-arrow" onClick={() => switchResult(-1)} disabled={loading} aria-label="上一张">‹</button>
                <span className="node-result-count">结果 {(d.resultIndex ?? 0) + 1}/{d.results.length}</span>
                <button className="node-result-arrow" onClick={() => switchResult(1)} disabled={loading} aria-label="下一张">›</button>
              </div>
            )}
            {d.imageUrl && (
              <div className="node-img">
                <img
                  className="node-img-el"
                  src={d.imageUrl}
                  alt="生成结果"
                  onClick={() => setPreviewUrl(d.imageUrl!)}
                />
                <div className="node-img-actions">
                  <button onClick={() => setPreviewUrl(d.imageUrl!)}>预览</button>
                  <button onClick={() => downloadImage(d.imageUrl!, `seedream-${Date.now()}.png`)}>
                    下载
                  </button>
                </div>
              </div>
            )}
          </>
        )}
        {isVideo && (
          <>
            <button className="node-llm-run" onClick={runVideo} disabled={loading}>
              {loading ? '生成中…' : '生成视频'}
            </button>
            {d.refImageUrl && (
              <div className="node-ref-img">
                <div className="node-ref-label">参考首帧</div>
                <img
                  className="node-ref-thumb"
                  src={d.refImageUrl}
                  alt="参考首帧"
                  onClick={() => setPreviewUrl(d.refImageUrl!)}
                />
              </div>
            )}
            {d.videoUrl && (
              <video className="node-video-el" src={d.videoUrl} controls />
            )}
          </>
        )}
        {isMusic && (
          <>
            <button className="node-llm-run" onClick={runMusic} disabled={loading}>
              {loading ? '生成中…' : '生成音乐'}
            </button>
            {d.audioUrl && (
              <audio className="node-audio-el" src={d.audioUrl} controls />
            )}
          </>
        )}
        {isAgent && (
          <>
            {loading ? (
              <button className="node-llm-run node-agent-cancel" onClick={cancelAgent}>取消 Agent</button>
            ) : (
              <button className="node-llm-run" onClick={runAgent}>
                {status === 'failed' ? '重试 Agent' : '运行 Agent'}
              </button>
            )}
            {d.agentThink && (
              <div className="agent-think">
                <div className="agent-sub">思维链</div>
                <pre className="agent-think-text">{d.agentThink}</pre>
              </div>
            )}
            {d.agentText && (
              <div className="agent-live">
                <div className="agent-sub">实时输出</div>
                <pre className="agent-think-text">{d.agentText}</pre>
              </div>
            )}
            {d.agentTrace && d.agentTrace.length > 0 && (
              <div className="agent-trace">
                <div className="agent-sub">工具调用</div>
                {d.agentTrace.map((t, i) => (
                  <div key={i} className="agent-trace-item">
                    <div className="agent-trace-tool">
                      {t.tool}({JSON.stringify(t.args)})
                    </div>
                    <div className="agent-trace-result">{t.result}</div>
                  </div>
                ))}
              </div>
            )}
            {d.result && !loading && <div className="node-llm-result">{d.result}</div>}
          </>
        )}
        {isMaterial && (
          <>
            <label className="node-file-btn">
              导入素材（可多选）
              <input type="file" multiple hidden onChange={onPickFiles} />
            </label>
            {matFiles.length > 0 && (
              <div className="mat-list">
                {matFiles.map((f, i) => (
                  <div key={i} className="mat-item">
                    {f.dataUrl ? (
                      <img className="mat-thumb" src={f.dataUrl} alt={f.name} />
                    ) : (
                      <span className="mat-ic">📄</span>
                    )}
                    <span className="mat-name">{f.name}</span>
                    <span className="mat-size">{(f.size / 1024).toFixed(0)}KB</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        {isStoryboard && (
          <>
            <canvas
              ref={sbRef}
              className="sb-canvas"
              width={240}
              height={130}
              onMouseDown={sbDown}
              onMouseMove={sbMove}
              onMouseUp={sbUp}
              onMouseLeave={sbUp}
            />
            <button className="node-llm-run" onClick={sbClear}>清空画板</button>
          </>
        )}
        {isRegion && (
          <>
            <input
              className="node-llm-input"
              value={d.regionName ?? ''}
              placeholder="区域名，如：A 区 / 角色组"
              onChange={(e) => patch({ regionName: e.target.value })}
            />
            <div className="region-info">本区域成员：{regionMembers()} 个节点</div>
            <div className="region-tip">用底部工具栏「框选分组」框选节点即可归入本区域</div>
          </>
        )}
        {isPanorama && (
          <>
            <button className="node-llm-run" onClick={runPanoramaAI} disabled={loading}>
              {loading ? '生成中…' : 'AI 生成全景图'}
            </button>
            <button className="node-llm-run" onClick={runPanorama} disabled={loading}>
              {loading ? '载入中…' : '载入全景'}
            </button>
            <label className="node-file-btn">
              本地导入等距全景图
              <input type="file" accept="image/*" hidden onChange={onPickPano} />
            </label>
            {d.panoramaUrl && <PanoramaView url={String(d.panoramaUrl)} />}
            <div className="region-tip">拖拽旋转环视，滚轮缩放（理想输入为 2:1 等距全景图）</div>
          </>
        )}
        {isTopaz && (
          <>
            <button className="node-llm-run" onClick={runTopaz} disabled={loading}>
              {loading ? '增强中…' : '画质增强'}
            </button>
            {d.imageUrl && <img className="node-img-el" src={d.imageUrl} alt="增强结果" />}
          </>
        )}
        {isFace && (
          <>
            <button className="node-llm-run" onClick={runFace} disabled={loading}>
              {loading ? '检测中…' : '人脸合规检测'}
            </button>
            {d.result && <div className="node-llm-result">{d.result}</div>}
            {d.faceBlurUrl && (
              <>
                <div className="region-tip">已生成隐私模糊结果</div>
                <img className="node-img-el" src={d.faceBlurUrl} alt="人脸模糊结果" />
                <button className="node-llm-run" onClick={() => downloadImage(d.faceBlurUrl!, `face-blur-${Date.now()}.jpg`)}>
                  下载模糊图
                </button>
              </>
            )}
          </>
        )}
        {err && <div className="node-error">{err}</div>}
      </div>

      {/* S3.8 图片预览浮层：点击节点内图片/参考首帧后放大查看 */}
      {previewUrl && (
        <div className="node-preview-overlay" onClick={() => setPreviewUrl(null)}>
          <img className="node-preview-img" src={previewUrl} alt="大图预览" />
          <div className="node-preview-hint">点击任意处关闭</div>
        </div>
      )}

      <Handle type="target" position={Position.Left} className="node-handle" />
      <Handle type="source" position={Position.Right} className="node-handle" />
    </div>
  )
}
