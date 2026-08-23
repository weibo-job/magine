// S1.5 React Flow 浅色画布空壳（点阵网格 + 平移/缩放 + 网格显隐）
// S1.6 接入自定义节点卡片 NodeCard（示例节点验证渲染与锚点）
// S1.7 底部悬浮工具栏 + 缩放条（作为 ReactFlow 子组件以访问 context）
// S1.8 三注册表（节点/工具/服务商）数据来源
// S1.9 节点库面板 + 节点放置
// S1.10 工程文件存读（保存 / 打开 / 新建 / 清空 + toast 反馈）
// S2.13 重构：改为非受控（defaultNodes/Edges）+ ReactFlowProvider，使 Canvas 与 NodeCard(Agent)
//        共用同一个 React Flow store —— Agent 程序化增删/连线/撤销才能与手动拖拽一致、不丢节点。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, ChangeEvent } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  addEdge,
  useReactFlow,
  useNodes,
  useEdges,
  type Node,
  type Edge,
  type Connection,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import NodeCard from './NodeCard'
import FloatingToolbar from './FloatingToolbar'
import { getSuggestedNodePosition } from './nodeLayout'
import Dock from './Dock'
import NodePromptBar from './NodePromptBar'
import { getNodeType } from '../registry'
import {
  serializeProject,
  saveProjectFile,
  openProjectFile,
  loadRecent,
  loadLocalVersions,
  saveLocal,
  loadLocal,
} from '../store/project'
import { getKey } from '../settings/vaultStore'
import { runAgentLoop, createRendererEnvApi, selectProvider } from '../gateway'
import { buildCanvasApi } from './canvasApi'
import {
  RATIO_SIZE,
  DEFAULT_RATIO,
  getDefaultRatio,
  getModelOptions,
  getDefaultModel,
  getModelLabel,
  getDefaultNodeSize,
} from './modelOptions'
import type { AgentToolCall } from '../gateway'
import type { NodeCardData } from './types'
import { InteractionTracker } from '../interaction/tracker'
import { ProactiveEngine, SCENES } from '../interaction/proactive'
import type { AppSignals, MagicItem } from '../interaction/proactive'
import MagicBar from '../interaction/MagicBar'
import { loadAssets, saveAssetIfNew, type SavedAsset, type AssetKind } from '../store/assets'
import { ASSISTANT_ACTIONS, WORKFLOW_PRESETS, createPromptNodeData, planWorkflow, type ToolbarPanelItem } from './toolbarPanels'

// 自定义节点类型注册（组件外定义，避免 React Flow 重渲染警告）
const nodeTypes = { card: NodeCard }

// 模型/比例配置已拆至 modelOptions.ts（供 Canvas + NodeCard 共用）

let idSeq = 1

function CanvasInner({
  initialProject,
  workflowPrompt,
  assetToInsert,
}: {
  initialProject?: { nodes: Node[]; edges: Edge[] }
  workflowPrompt?: string
  assetToInsert?: SavedAsset
}) {
  const initialNodes: Node[] = initialProject?.nodes ?? [
    {
      id: 'demo-1',
      type: 'card',
      position: { x: 320, y: 160 },
      data: { kind: 'Prompt', label: '输入创作灵感…', status: 'idle' },
    },
  ]
  const initialEdges: Edge[] = initialProject?.edges ?? []
  const [showGrid, setShowGrid] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const [wfInput, setWfInput] = useState('')
  const [wfLoading, setWfLoading] = useState(false)
  const [wfError, setWfError] = useState('')
  const [wfStage, setWfStage] = useState<'idle' | 'planning' | 'running' | 'done' | 'failed' | 'cancelled'>('idle')
  const [wfPreview, setWfPreview] = useState<{ prompt: string; nodes: string[]; outputs: string[] } | null>(null)
  const workflowRunRef = useRef<{ id: string; controller: AbortController } | null>(null)
  // S2.16/S2.17 主动交互：Magic 助手浮层 + 埋点引擎
  const [magicItems, setMagicItems] = useState<MagicItem[]>([])
  const trackerRef = useRef<InteractionTracker | null>(null)
  const engineRef = useRef<ProactiveEngine | null>(null)
  const disabledCats = useRef<Set<string>>(new Set())
  // S3.3 Region 框选分组：画布拖拽框选，对框内节点打 region 标签
  const [selectMode, setSelectMode] = useState(false)
  const [selRect, setSelRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const dragStart = useRef<{ x: number; y: number } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const workflowStartedRef = useRef<string | null>(null)
  // S2.13：直接操作 React Flow store（与 NodeCard / Agent 同源），避免受控 state 与 store 双源不一致。
  const { setNodes, setEdges, getNodes, getEdges, screenToFlowPosition, flowToScreenPosition, fitView } = useReactFlow()
  const nodes = useNodes()
  const edges = useEdges()
  // 小云雀风：选中节点 → 下方浮现提示词框
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  // 小云雀风：「向该节点生成」菜单（拖线到空白松手弹出）
  const [genMenu, setGenMenu] = useState<{ x: number; y: number; fromId: string } | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [activeToolbarPanel, setActiveToolbarPanel] = useState<'assistant' | 'preset' | null>(null)
  const [promptPresets, setPromptPresets] = useState<SavedAsset[]>([])
  const [historyPaths, setHistoryPaths] = useState<string[]>([])
  const [localVersions, setLocalVersions] = useState<ReturnType<typeof loadLocalVersions>>([])
  const assetInsertedRef = useRef<string | null>(null)
  const historyPastRef = useRef<{ nodes: Node[]; edges: Edge[] }[]>([])
  const historyFutureRef = useRef<{ nodes: Node[]; edges: Edge[] }[]>([])
  const lastSnapshotRef = useRef<{ nodes: Node[]; edges: Edge[] } | null>(null)
  const skipHistoryUntilRef = useRef(0)

  // 选中节点的 data（每次 render 直接读 store，保证 setNodes 更新后 NodePromptBar 立即刷新）
  const selectedData = selectedNodeId
    ? ((getNodes().find((x) => x.id === selectedNodeId)?.data as NodeCardData | undefined) ?? null)
    : null
  const outputNodes = nodes.filter((node) => {
    const data = node.data as NodeCardData
    return Boolean(data.imageUrl || data.videoUrl || data.audioUrl || data.result)
  })

  const outputInfo = (node: Node) => {
    const data = node.data as NodeCardData
    if (data.imageUrl) return { kind: 'image' as AssetKind, label: '图片', content: data.imageUrl, preview: data.imageUrl }
    if (data.videoUrl) return { kind: 'video' as AssetKind, label: '视频', content: data.videoUrl }
    if (data.audioUrl) return { kind: 'audio' as AssetKind, label: '音频', content: data.audioUrl }
    return { kind: 'text' as AssetKind, label: '文本', content: data.result ?? '' }
  }

  const saveOutput = (node: Node) => {
    const data = node.data as NodeCardData
    const info = outputInfo(node)
    saveAssetIfNew({ name: `${data.label || data.kind} 输出`, kind: info.kind, content: info.content, sourceNodeId: node.id, sourceNodeType: data.nodeTypeId, model: data.model, ratio: data.ratio, prompt: data.text, tags: ['本次输出'] })
    showToast('已保存到资产库')
  }

  const downloadOutput = (content: string, name: string) => {
    if (content.startsWith('data:')) {
      const a = document.createElement('a')
      a.href = content
      a.download = name
      a.click()
    } else {
      window.open(content, '_blank', 'noopener,noreferrer')
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      saveLocal(serializeProject(nodes, edges))
    }, 700)
    return () => window.clearTimeout(timer)
  }, [nodes, edges])

  useEffect(() => {
    const current = { nodes, edges }
    const previous = lastSnapshotRef.current
    if (!previous) {
      lastSnapshotRef.current = current
      return
    }
    if (Date.now() < skipHistoryUntilRef.current) {
      lastSnapshotRef.current = current
      return
    }
    if (JSON.stringify(previous) !== JSON.stringify(current)) {
      historyPastRef.current = [...historyPastRef.current, previous].slice(-50)
      historyFutureRef.current = []
      lastSnapshotRef.current = current
    }
  }, [nodes, edges])

  const restoreSnapshot = (snapshot: { nodes: Node[]; edges: Edge[] }) => {
    skipHistoryUntilRef.current = Date.now() + 150
    lastSnapshotRef.current = snapshot
    setNodes(snapshot.nodes)
    setEdges(snapshot.edges)
  }

  const undo = () => {
    const target = historyPastRef.current.pop()
    if (!target) {
      showToast('没有可撤销的操作')
      return
    }
    historyFutureRef.current.push({ nodes, edges })
    restoreSnapshot(target)
    showToast('已撤销')
  }

  const redo = () => {
    const target = historyFutureRef.current.pop()
    if (!target) {
      showToast('没有可恢复的操作')
      return
    }
    historyPastRef.current.push({ nodes, edges })
    restoreSnapshot(target)
    showToast('已恢复')
  }

  const selectedNodes = () => getNodes().filter((node) => node.selected)

  const copySelected = () => {
    const selected = selectedNodes()
    if (!selected.length) {
      showToast('请先选中要复制的节点')
      return
    }
    const idMap = new Map(selected.map((node) => [node.id, `copy-${idSeq++}`]))
    const copies = selected.map((node) => ({
      ...node,
      id: idMap.get(node.id)!,
      position: { x: node.position.x + 40, y: node.position.y + 40 },
      selected: true,
      data: { ...node.data },
    }))
    const internalEdges = getEdges()
      .filter((edge) => idMap.has(edge.source) && idMap.has(edge.target))
      .map((edge) => ({ ...edge, id: `copy-edge-${idSeq++}`, source: idMap.get(edge.source)!, target: idMap.get(edge.target)! }))
    setNodes((nds) => [...nds.map((node) => ({ ...node, selected: false })), ...copies])
    setEdges((eds) => [...eds, ...internalEdges])
    showToast(`已复制 ${selected.length} 个节点`)
  }

  const deleteSelected = () => {
    const ids = new Set(selectedNodes().map((node) => node.id))
    if (!ids.size) {
      showToast('请先选中要删除的节点')
      return
    }
    setNodes((nds) => nds.filter((node) => !ids.has(node.id)))
    setEdges((eds) => eds.filter((edge) => !ids.has(edge.source) && !ids.has(edge.target)))
    setSelectedNodeId(null)
    showToast(`已删除 ${ids.size} 个节点`)
  }

  const exportSelected = () => {
    const selected = selectedNodes()
    if (!selected.length) {
      showToast('请先选中要导出的节点')
      return
    }
    const ids = new Set(selected.map((node) => node.id))
    const payload = serializeProject(selected, getEdges().filter((edge) => ids.has(edge.source) && ids.has(edge.target)))
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `magine-selected-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
    showToast(`已导出 ${selected.length} 个节点`)
  }

  // S1.9 点击节点库 → 在画布放置一个卡片（来自注册表节点类型）
  const addNodeByType = useCallback(
    (typeId: string) => {
      const nt = getNodeType(typeId)
      if (!nt) return
      const id = `n-${idSeq++}`
      const ratio = getDefaultRatio(typeId)
      const sz = getDefaultNodeSize(typeId, ratio)
      const newNode: Node = {
        id,
        type: 'card',
        position: getSuggestedNodePosition(getNodes(), nt.id),
        data: { kind: nt.name, nodeTypeId: nt.id, label: `${nt.name} 节点`, status: 'idle', ratio, model: getDefaultModel(typeId) },
        style: { width: sz.w, height: sz.h },
      }
      setNodes((nds) => [...nds, newNode])
    },
    [setNodes],
  )

  const onConnect = useCallback(
    (conn: Connection) => setEdges((eds) => addEdge(conn, eds)),
    [setEdges],
  )

  // 小云雀风「向该节点生成」：拖线到空白松手（onConnectEnd）→ 弹菜单 → 选中自动建节点+连线
  const GEN_ITEMS: { type: string; icon: string; cls: string; label: string; desc: string }[] = [
    { type: 'image', icon: '🖼', cls: 'gi-orange', label: '图片', desc: '文生图 / 图生图' },
    { type: 'edit', icon: '🎨', cls: 'gi-orange', label: '编辑', desc: '局部重绘/扩图/换风格/打光/镜头/人像/妆容' },
    { type: 'video', icon: '🎬', cls: 'gi-purple', label: '视频', desc: '图生视频 / 文生视频' },
    { type: 'music', icon: '🎵', cls: 'gi-cyan', label: '音频', desc: '配乐 / 配音' },
    { type: 'llm', icon: '👤', cls: 'gi-pink', label: '角色', desc: '角色 / 设定文本' },
    { type: 'prompt', icon: '🏞', cls: 'gi-blue', label: '场景', desc: '场景 / 环境设定' },
  ]
  const onConnectEnd = useCallback(
    (e: MouseEvent | TouchEvent, connState: { fromNode?: Node | null; toNode?: Node | null }) => {
      const from = connState.fromNode
      // 成功磁吸连接（toNode 存在）→ 不弹菜单
      if (!from || connState.toNode) return
      const pt = e instanceof MouseEvent ? { x: e.clientX, y: e.clientY } : { x: e.touches[0].clientX, y: e.touches[0].clientY }
      const fp = screenToFlowPosition(pt)
      setGenMenu({ x: fp.x, y: fp.y, fromId: from.id })
    },
    [screenToFlowPosition],
  )
  const genToNode = (type: string) => {
    if (!genMenu) return
    const nt = getNodeType(type)
    const id = `n-${idSeq++}`
    const ratio = getDefaultRatio(type)
    const sz = getDefaultNodeSize(type, ratio)
    const x = genMenu.x - sz.w / 2
    const y = genMenu.y - 40
    const newNode: Node = {
      id,
      type: 'card',
      position: { x, y },
      data: {
        kind: nt?.name ?? type,
        nodeTypeId: type,
        label: `${nt?.name ?? type} 节点`,
        status: 'idle',
        text: '', // 新节点输入 = 上游输出（运行时自动继承）
        ratio,
        model: getDefaultModel(type),
      },
      style: { width: sz.w, height: sz.h },
    }
    setNodes((nds) => [...nds, newNode])
    setEdges((eds) => [...eds, { id: `e-${Date.now()}`, source: genMenu.fromId, target: id }])
    setGenMenu(null)
    showToast(`已创建「${nt?.name ?? type}」节点，输入 = 上游输出`)
  }

  // S1.10 工具栏动作（保存 / 打开 / 新建 / 清空）；闭包捕获最新 nodes/edges
  const showToast = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 1500)
  }

  const onToolbar = async (action: string) => {
    if (action === 'undo') {
      undo()
    } else if (action === 'redo') {
      redo()
    } else if (action === 'copy-selected') {
      copySelected()
    } else if (action === 'delete-selected') {
      deleteSelected()
    } else if (action === 'export-selected') {
      exportSelected()
    } else if (action === 'save') {
      const r = await saveProjectFile(serializeProject(getNodes(), getEdges()))
      if (r.ok) { void loadRecent().then(setHistoryPaths); setLocalVersions(loadLocalVersions()) }
      showToast(r.ok ? `已保存：${r.path || ''}` : r.error)
    } else if (action === 'open') {
      const r = await openProjectFile()
      if (r.ok && r.project) {
        setNodes(r.project.nodes)
        setEdges(r.project.edges)
        showToast(`已打开：${r.path || ''}`)
      } else {
        showToast(r.error || '打开失败')
      }
    } else if (action === 'new' || action === 'clear') {
      setNodes([])
      setEdges([])
      showToast(action === 'new' ? '已新建空白画布' : '已清空画布')
    } else if (action === 'region') {
      const next = !selectMode
      setSelectMode(next)
      showToast(next ? '框选模式：在画布拖拽框选要分组的节点' : '已退出框选模式')
    } else if (action === 'import') {
      importInputRef.current?.click()
    } else if (action === 'history') {
      setActiveToolbarPanel(null)
      setShowHistory((value) => !value)
      void loadRecent().then(setHistoryPaths)
      setLocalVersions(loadLocalVersions())
    } else if (action === 'assistant' || action === 'preset') {
      setShowHistory(false)
      setActiveToolbarPanel((value) => value === action ? null : action)
      if (action === 'preset') setPromptPresets(loadAssets().filter((asset) => asset.kind === 'prompt'))
    } else {
      console.log('[toolbar]', action)
    }
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveToolbarPanel(null)
        setShowHistory(false)
        return
      }
      const target = event.target as HTMLElement | null
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) return
      const key = event.key.toLowerCase()
      const hasMod = event.metaKey || event.ctrlKey
      if (hasMod && key === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      } else if (hasMod && key === 'd') {
        event.preventDefault()
        copySelected()
      } else if (hasMod && key === 's') {
        event.preventDefault()
        void onToolbar('save')
      } else if (key === 'delete' || key === 'backspace') {
        event.preventDefault()
        deleteSelected()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  useEffect(() => {
    if (!assetToInsert || assetInsertedRef.current === assetToInsert.id) return
    assetInsertedRef.current = assetToInsert.id
    const nodeTypeId = assetToInsert.kind === 'prompt' ? 'prompt' : assetToInsert.kind === 'text' ? 'llm' : assetToInsert.kind
    const data: Record<string, unknown> = {
      kind: assetToInsert.kind === 'prompt' ? '提示词' : assetToInsert.kind === 'text' ? '大语言模型' : assetToInsert.kind,
      nodeTypeId,
      label: assetToInsert.name,
      status: 'done',
      text: assetToInsert.kind === 'prompt' || assetToInsert.kind === 'text' || assetToInsert.kind === 'node' ? assetToInsert.content : '',
    }
    if (assetToInsert.kind === 'image') data.imageUrl = assetToInsert.content
    if (assetToInsert.kind === 'video') data.videoUrl = assetToInsert.content
    if (assetToInsert.kind === 'audio') data.audioUrl = assetToInsert.content
    setNodes((nds) => [...nds, { id: `asset-${Date.now()}`, type: 'card', position: { x: 320, y: 180 }, data }])
    showToast(`已将「${assetToInsert.name}」放入画布`)
  }, [assetToInsert, setNodes])

  const openHistory = async (path: string) => {
    const r = await openProjectFile(path)
    if (r.ok && r.project) {
      setNodes(r.project.nodes)
      setEdges(r.project.edges)
      setShowHistory(false)
      showToast(`已打开：${r.path || path}`)
    } else showToast(r.error || '打开历史工程失败')
  }

  // S3.3 Region 框选：在画布 pane 上按下记录起点（客户端坐标）；点节点不触发
  const onPaneMouseDown = (e: ReactMouseEvent) => {
    if (!selectMode) return
    const target = e.target as HTMLElement
    if (!target.classList.contains('react-flow__pane')) return
    dragStart.current = { x: e.clientX, y: e.clientY }
    const root = rootRef.current
    if (root) {
      const r = root.getBoundingClientRect()
      setSelRect({ x: e.clientX - r.left, y: e.clientY - r.top, w: 0, h: 0 })
    }
  }

  // S3.3 Region 框选：selectMode 时挂 window 监听，松开后把框内节点打 region 标签
  useEffect(() => {
    if (!selectMode) return
    const root = rootRef.current
    if (!root) return
    const onMove = (e: globalThis.MouseEvent) => {
      if (!dragStart.current) return
      const r = root.getBoundingClientRect()
      const x = Math.min(dragStart.current.x, e.clientX) - r.left
      const y = Math.min(dragStart.current.y, e.clientY) - r.top
      const w = Math.abs(e.clientX - dragStart.current.x)
      const h = Math.abs(e.clientY - dragStart.current.y)
      setSelRect({ x, y, w, h })
    }
    const onUp = (e: globalThis.MouseEvent) => {
      const start = dragStart.current
      if (!start) return
      dragStart.current = null
      const left = Math.min(start.x, e.clientX)
      const right = Math.max(start.x, e.clientX)
      const top = Math.min(start.y, e.clientY)
      const bottom = Math.max(start.y, e.clientY)
      const nodes = getNodes()
      const inRect = nodes.filter((n) => {
        const el = document.querySelector(`.react-flow__node[data-id="${n.id}"]`)
        if (!el) return false
        const b = el.getBoundingClientRect()
        return !(b.right < left || b.left > right || b.bottom < top || b.top > bottom)
      })
      const reg = nodes.find((n) => (n.data as NodeCardData)?.nodeTypeId === 'region')
      const name = reg ? ((reg.data as NodeCardData)?.regionName ?? '区域').trim() || '区域' : '区域'
      if (inRect.length > 0) {
        setNodes((nds) =>
          nds.map((n) => (inRect.some((m) => m.id === n.id) ? { ...n, data: { ...n.data, region: name } } : n)),
        )
      }
      setSelRect(null)
      setSelectMode(false)
      showToast(inRect.length > 0 ? `已将 ${inRect.length} 个节点归入「${name}」` : '框选为空，未分组')
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [selectMode, getNodes, setNodes, showToast])

  // S2.15 全局"一句话搭工作流"入口：复用 buildCanvasApi（与 NodeCard/Agent 同源 store），
  // 新建一个 agent 节点承载自然语言指令，交给 Agent 自动规划并搭出节点+连线。
  const executeWorkflow = async (override?: string) => {
    if (workflowRunRef.current) return
    const provider = selectProvider('text')
    const key = provider ? getKey(provider.id) : ''
    if (!key) {
      showToast('请先在"设置"里填 DeepSeek Key 并解锁')
      return
    }
    const instr = (override ?? wfInput).trim()
    if (!instr) {
      showToast('请输入要搭建的工作流描述')
      return
    }
    setWfLoading(true)
    setWfError('')
    setWfStage('planning')
    const id = `wf-${Date.now()}`
    const controller = new AbortController()
    workflowRunRef.current = { id, controller }
    // 一句话搭工作流会自己生成带主题的提示词节点，先移除画布自带的空 Prompt 占位，避免重复。
    const defaultPromptIds = new Set(
      getNodes()
        .filter((node) => {
          const data = node.data as Partial<NodeCardData>
          const isPrompt = data.nodeTypeId === 'prompt' || data.kind === 'Prompt' || data.kind === '提示词'
          return node.id === 'demo-1' || (isPrompt && !String(data.text ?? '').trim())
        })
        .map((node) => node.id),
    )
    if (defaultPromptIds.size) {
      setNodes((nds) => nds.filter((node) => !defaultPromptIds.has(node.id)))
      setEdges((eds) => eds.filter((edge) => !defaultPromptIds.has(edge.source) && !defaultPromptIds.has(edge.target)))
    }
    setNodes((nds) => [
      ...nds,
      {
        id,
        type: 'card',
        position: { x: 80, y: 60 },
        data: {
          kind: '智能体',
          nodeTypeId: 'agent',
          label: '智能体 节点',
          status: 'running',
          text: instr,
          agentThink: '',
          agentText: '',
          agentTrace: [],
          result: '',
        },
      },
    ])
    setWfStage('running')
    const api = buildCanvasApi({ setNodes, getNodes, getEdges, setEdges })
    const patchAgent = (p: Partial<NodeCardData>) =>
      setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...p } } : n)))
    try {
      let think = ''
      let live = ''
      let workflowFailed = false
      const trace: { tool: string; args: Record<string, unknown>; result: string }[] = []
      await runAgentLoop(
        { apiKey: key, canvas: api, env: createRendererEnvApi(), maxSteps: 14, signal: controller.signal },
        instr,
        {
          onThink: (d) => {
            think += d
            patchAgent({ agentThink: think })
          },
          onText: (d) => {
            live += d
            patchAgent({ agentText: live })
          },
          onTool: (call: AgentToolCall, result) => {
            trace.push({ tool: call.tool, args: call.args, result })
            patchAgent({ agentTrace: [...trace] })
          },
          onFinal: (text) => {
            patchAgent({ status: 'done', result: text, agentText: '' })
          },
          onError: (e) => {
            workflowFailed = true
            setWfError(e)
            setWfStage('failed')
            showToast('Agent 出错：' + e)
            patchAgent({ status: 'failed', result: e })
          },
          onCancel: () => {
            workflowFailed = true
            setWfStage('cancelled')
            patchAgent({ status: 'failed', result: '已取消本次搭建' })
            showToast('已取消 Agent 搭建')
          },
        },
      )
      if (!controller.signal.aborted && !workflowFailed) {
        api.autoLayout()
        setWfStage('done')
        window.setTimeout(() => fitView({ padding: 0.2, duration: 350 }), 60)
      }
    } finally {
      if (workflowRunRef.current?.id === id) workflowRunRef.current = null
      setWfLoading(false)
    }
  }

  const runWorkflow = (override?: string) => {
    if (workflowRunRef.current || wfPreview) return
    const instr = (override ?? wfInput).trim()
    if (!instr) {
      showToast('请输入要搭建的工作流描述')
      return
    }
    const { nodes, outputs } = planWorkflow(instr)
    setWfPreview({ prompt: instr, nodes, outputs })
  }

  const runAssistantAction = (item: ToolbarPanelItem) => {
    if (item.id === 'organize') {
      buildCanvasApi({ setNodes, getNodes, getEdges, setEdges }).autoLayout()
      window.setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 60)
      setActiveToolbarPanel(null)
      showToast('已整理画布布局')
      return
    }
    const prompt = item.id === 'workflow' && wfInput.trim() ? wfInput.trim() : item.prompt
    setWfInput(prompt)
    setActiveToolbarPanel(null)
    runWorkflow(prompt)
  }

  const openWorkflowPreset = (item: ToolbarPanelItem) => {
    setWfInput(item.prompt)
    setActiveToolbarPanel(null)
    runWorkflow(item.prompt)
  }

  const insertPromptPreset = (asset: SavedAsset) => {
    const ratio = getDefaultRatio('prompt')
    const size = getDefaultNodeSize('prompt', ratio)
    const node: Node = {
      id: `preset-${idSeq++}`,
      type: 'card',
      position: getSuggestedNodePosition(getNodes(), 'prompt'),
      data: { ...createPromptNodeData(asset.name, asset.content), ratio, model: getDefaultModel('prompt') },
      style: { width: size.w, height: size.h },
    }
    setNodes((current) => [...current, node])
    setActiveToolbarPanel(null)
    showToast(`已放入预设「${asset.name}」`)
  }

  const confirmWorkflow = () => {
    if (!wfPreview) return
    const prompt = wfPreview.prompt
    setWfPreview(null)
    void executeWorkflow(prompt)
  }

  const cancelWorkflow = () => workflowRunRef.current?.controller.abort()

  useEffect(() => {
    if (!workflowPrompt || workflowStartedRef.current === workflowPrompt) return
    workflowStartedRef.current = workflowPrompt
    setWfInput(workflowPrompt)
    void runWorkflow(workflowPrompt)
  }, [workflowPrompt])

  // S2.16/S2.17 主动交互引擎：挂载埋点 + 每 4s 评估 15 场景，命中即推 Magic 提醒（可打断/冷却/一键关闭分类）
  useEffect(() => {
    const tracker = new InteractionTracker()
    tracker.attach()
    trackerRef.current = tracker
    const engine = new ProactiveEngine(SCENES)
    engineRef.current = engine
    const buildSignals = (): AppSignals => {
      const nodes = getNodes()
      const st = (n: Node) => (n.data as NodeCardData | undefined)?.status
      return {
        nodeCount: nodes.length,
        failedCount: nodes.filter((n) => st(n) === 'failed').length,
        runningCount: nodes.filter((n) => st(n) === 'running').length,
        hasSaved: getNodes().length > 0,
      }
    }
    const iv = window.setInterval(() => {
      if (!trackerRef.current || !engineRef.current) return
      const t = trackerRef.current.sample()
      const fired = engineRef.current.tick(t, buildSignals(), disabledCats.current)
      if (fired.length) setMagicItems((prev) => [...fired, ...prev].slice(0, 3))
    }, 4000)
    const onBeforeUnload = () => {
      if (engineRef.current) {
        const it = engineRef.current.exitPrompt()
        setMagicItems((prev) => [it, ...prev].slice(0, 3))
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      tracker.detach()
      window.clearInterval(iv)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [getNodes])

  const dismissMagic = (id: string) => setMagicItems((prev) => prev.filter((m) => m.id !== id))
  const disableCat = (cat: string) => {
    disabledCats.current.add(cat)
    setMagicItems((prev) => prev.filter((m) => m.category !== cat))
  }

  return (
    <div className={`canvas-root${selectMode ? ' selecting' : ''}`} ref={rootRef}>
      {/* 顶部中央占位：后续加全局 AI 功能入口（当前放一句话搭工作流） */}
      <div className="wf-bar">
        <input
          className="wf-input"
          placeholder="描述你想要生成的内容，@AI 助手…"
          value={wfInput}
          onChange={(e) => setWfInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !wfLoading) runWorkflow()
          }}
        />
        <button className="wf-run" onClick={() => runWorkflow()} disabled={wfLoading}>
          {wfLoading ? '搭建中…' : wfError ? '重试搭建' : '一句话搭工作流'}
        </button>
        {wfLoading && <button className="wf-cancel" type="button" onClick={cancelWorkflow}>取消</button>}
        {wfStage !== 'idle' && <span className={`wf-stage wf-stage-${wfStage}`}>{
          wfStage === 'planning' ? '规划中' : wfStage === 'running' ? '生成节点中' : wfStage === 'done' ? '待审核' : wfStage === 'failed' ? '失败' : wfStage === 'cancelled' ? '已取消' : ''
        }</span>}
      </div>
      {wfError && <div className="wf-error">上次搭建失败：{wfError}</div>}
      {wfPreview && (
        <div className="wf-preview-backdrop" role="dialog" aria-modal="true" aria-label="工作流方案预览">
          <section className="wf-preview-modal">
            <div className="wf-preview-kicker">Agent 方案预览</div>
            <h2>准备为你搭建这条工作流</h2>
            <p className="wf-preview-prompt">{wfPreview.prompt}</p>
            <div className="wf-preview-section">
              <span>预计节点</span>
              <div className="wf-preview-chips">{wfPreview.nodes.map((node) => <b key={node}>{node}</b>)}</div>
            </div>
            <div className="wf-preview-section">
              <span>预计产出</span>
              <div className="wf-preview-chips">{wfPreview.outputs.map((output) => <b key={output}>{output}</b>)}</div>
            </div>
            <div className="wf-preview-actions">
              <button type="button" onClick={() => setWfPreview(null)}>先不搭建</button>
              <button type="button" className="primary" onClick={confirmWorkflow}>确认并搭建</button>
            </div>
          </section>
        </div>
      )}
      {wfStage === 'done' && outputNodes.length > 0 && (
        <aside className="wf-output-panel">
          <div className="wf-output-head">
            <div>
              <strong>本次输出</strong>
              <span>{outputNodes.length} 个结果 · 待审核</span>
            </div>
            <button type="button" onClick={() => setWfStage('idle')} aria-label="关闭本次输出">×</button>
          </div>
          <div className="wf-output-list">
            {outputNodes.map((node) => {
              const data = node.data as NodeCardData
              const info = outputInfo(node)
              return (
                <article className="wf-output-item" key={node.id}>
                  {info.preview ? <img src={info.preview} alt="生成结果" /> : <div className="wf-output-text">{info.content.slice(0, 120)}</div>}
                  <div className="wf-output-meta">
                    <strong>{data.label || data.kind}</strong>
                    <span>{info.label}{data.model ? ` · ${data.model}` : ''}{data.ratio ? ` · ${data.ratio}` : ''}</span>
                  </div>
                  <div className="wf-output-actions">
                    <button type="button" onClick={() => { setSelectedNodeId(node.id); fitView({ nodes: [node], padding: 0.35, duration: 300 }) }}>查看节点</button>
                    <button type="button" onClick={() => saveOutput(node)}>保存资产</button>
                    <button type="button" onClick={() => downloadOutput(info.content, `${data.label || 'magine-output'}-${Date.now()}`)}>下载</button>
                    <button type="button" onClick={() => document.dispatchEvent(new CustomEvent('mc-run-node', { detail: { id: node.id, text: data.text ?? '' } }))}>重跑</button>
                  </div>
                </article>
              )
            })}
          </div>
        </aside>
      )}
      <ReactFlow
        defaultNodes={initialNodes}
        defaultEdges={initialEdges}
        nodeTypes={nodeTypes}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        onMouseDown={onPaneMouseDown}
        onNodeClick={(_, n) => setSelectedNodeId((prev) => (prev === n.id ? null : n.id))}
        onPaneClick={() => {
          setSelectedNodeId(null)
          setGenMenu(null)
          setActiveToolbarPanel(null)
        }}
        panOnDrag={!selectMode}
        panOnScroll
        zoomOnPinch
        zoomOnScroll={false}
        fitView
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        className="rf-light"
      >
        {showGrid && (
          <Background variant={BackgroundVariant.Dots} gap={20} size={1.4} color="#d5d5d5" />
        )}
        <Controls showInteractive={false} />
        <Dock onAdd={addNodeByType} />
        <FloatingToolbar onAction={onToolbar} />
      </ReactFlow>

      {selectMode && selRect && (
        <div
          className="sel-rect"
          style={{ left: selRect.x, top: selRect.y, width: selRect.w, height: selRect.h }}
        />
      )}

      {showHistory && (
        <aside className="mc-history-panel">
          <div className="mc-history-title">最近工程</div>
          {historyPaths.length === 0 ? <div className="mc-history-empty">暂无已保存工程</div> : historyPaths.map((path) => (
            <button key={path} type="button" className="mc-history-item" onClick={() => void openHistory(path)}>
              <span>📄</span><span>{path.split('/').pop() || path}</span>
            </button>
          ))}
          <div className="mc-history-title mc-history-version-title">本地版本</div>
          {localVersions.length === 0 ? <div className="mc-history-empty">保存工程后会保留版本</div> : localVersions.slice(0, 8).map((version) => (
            <button key={version.id} type="button" className="mc-history-item" onClick={() => { setNodes(version.nodes); setEdges(version.edges); setShowHistory(false); showToast(`已恢复版本：${new Date(version.savedAt).toLocaleString()}`) }}>
              <span>↶</span><span>{new Date(version.savedAt).toLocaleString()}</span>
            </button>
          ))}
        </aside>
      )}

      {activeToolbarPanel && (
        <aside className={`mc-tool-panel mc-tool-panel-${activeToolbarPanel}`} aria-label={activeToolbarPanel === 'assistant' ? '画布助手' : '工作流预设'}>
          <div className="mc-tool-panel-head">
            <div>
              <strong>{activeToolbarPanel === 'assistant' ? '画布助手' : '工作流预设'}</strong>
              <span>{activeToolbarPanel === 'assistant' ? '快速搭建、补全或整理当前画布' : '选择模板，先预览方案再创建节点'}</span>
            </div>
            <button type="button" onClick={() => setActiveToolbarPanel(null)} aria-label="关闭面板">×</button>
          </div>

          {activeToolbarPanel === 'assistant' ? (
            <>
              <div className="mc-assistant-input">
                <input
                  value={wfInput}
                  onChange={(event) => setWfInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      setActiveToolbarPanel(null)
                      runWorkflow()
                    }
                  }}
                  placeholder="告诉助手你想搭建或优化什么…"
                />
                <button type="button" onClick={() => { setActiveToolbarPanel(null); runWorkflow() }}>生成方案</button>
              </div>
              <div className="mc-tool-grid">
                {ASSISTANT_ACTIONS.map((item) => (
                  <button type="button" className="mc-tool-card" key={item.id} onClick={() => runAssistantAction(item)}>
                    <span className="mc-tool-icon">{item.icon}</span>
                    <span><b>{item.title}</b><small>{item.description}</small></span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="mc-tool-section-title">内置工作流</div>
              <div className="mc-tool-grid">
                {WORKFLOW_PRESETS.map((item) => (
                  <button type="button" className="mc-tool-card" key={item.id} onClick={() => openWorkflowPreset(item)}>
                    <span className="mc-tool-icon">{item.icon}</span>
                    <span><b>{item.title}</b><small>{item.description}</small></span>
                  </button>
                ))}
              </div>
              <div className="mc-tool-section-title mc-tool-section-saved">我的提示词预设 <span>{promptPresets.length}</span></div>
              {promptPresets.length === 0 ? (
                <div className="mc-tool-empty">在提示词节点点击“存预设”后，会自动出现在这里。</div>
              ) : (
                <div className="mc-preset-list">
                  {promptPresets.slice(0, 10).map((asset) => (
                    <button type="button" key={asset.id} onClick={() => insertPromptPreset(asset)}>
                      <b>{asset.name}</b><span>{asset.content}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </aside>
      )}

      {/* 小云雀风：「向该节点生成」菜单（拖线到空白松手弹出） */}
      {genMenu && (() => {
        const sp = flowToScreenPosition({ x: genMenu.x, y: genMenu.y })
        return (
          <div
            className="mc-gen-menu"
            style={{ left: sp.x, top: sp.y }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="mc-gen-title">向该节点生成</div>
            {GEN_ITEMS.map((g) => (
              <button
                key={g.type}
                type="button"
                className="mc-gen-item"
                onClick={() => genToNode(g.type)}
              >
                <span className={`mc-add-ic ${g.cls}`}>{g.icon}</span>
                <span className="mc-gen-text">
                  <span className="mc-gen-label">{g.label}</span>
                  <span className="mc-gen-desc">{g.desc}</span>
                </span>
              </button>
            ))}
          </div>
        )
      })()}

      {/* 小云雀风：选中节点 → 下方浮现宽提示词框（锁定跟随） */}
      {selectedNodeId && selectedData && (
        <NodePromptBar
          selectedId={selectedNodeId}
          text={selectedData.text ?? ''}
          kind={selectedData.nodeTypeId ?? ''}
          ratio={(selectedData.ratio as string | undefined) ?? getDefaultRatio(selectedData.nodeTypeId)}
          model={(selectedData.model as string | undefined) ?? getDefaultModel(selectedData.nodeTypeId)}
          modelOptions={getModelOptions(selectedData.nodeTypeId)}
          onPatchText={(t) =>
            setNodes((nds) =>
              nds.map((n) => (n.id === selectedNodeId ? { ...n, data: { ...n.data, text: t } } : n)),
            )
          }
          onChangeRatio={(r) => {
            const sz = RATIO_SIZE[r]
            setNodes((nds) =>
              nds.map((n) =>
                n.id === selectedNodeId
                  ? {
                      ...n,
                      data: { ...n.data, ratio: r },
                      style: { ...n.style, width: sz.w, height: sz.h },
                    }
                  : n,
              ),
            )
          }}
          onChangeModel={(m) =>
            setNodes((nds) =>
              nds.map((n) => (n.id === selectedNodeId ? { ...n, data: { ...n.data, model: m } } : n)),
            )
          }
          onAddFile={(files) => {
            const f = files[0]
            if (!f || !selectedNodeId) return
            if (f.type.startsWith('image/')) {
              const r = new FileReader()
              r.onload = () =>
                setNodes((nds) =>
                  nds.map((n) =>
                    n.id === selectedNodeId
                      ? { ...n, data: { ...n.data, imageUrl: String(r.result), status: 'done' } }
                      : n,
                  ),
                )
              r.readAsDataURL(f)
            } else {
              const base = { name: f.name, size: f.size }
              setNodes((nds) =>
                nds.map((n) =>
                  n.id === selectedNodeId
                    ? {
                        ...n,
                        data: {
                          ...n.data,
                          files: [...(Array.isArray(n.data.files) ? n.data.files : []), base],
                        },
                      }
                    : n,
                ),
              )
            }
          }}
        />
      )}

      {toast && <div className="canvas-toast">{toast}</div>}
      <MagicBar items={magicItems} onDismiss={dismissMagic} onDisableCat={disableCat} />
    </div>
  )
}

export default function Canvas({
  initialProject,
  workflowPrompt,
  assetToInsert,
}: {
  initialProject?: { nodes: Node[]; edges: Edge[] }
  workflowPrompt?: string
  assetToInsert?: SavedAsset
}) {
  return (
    <ReactFlowProvider>
      <CanvasInner initialProject={initialProject} workflowPrompt={workflowPrompt} assetToInsert={assetToInsert} />
    </ReactFlowProvider>
  )
}
