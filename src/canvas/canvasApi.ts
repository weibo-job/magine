// S2.13 / S2.15 画布操作工厂：把 Agent 的"画布手"与全局"一句话搭工作流"入口共用同一实现，
// 避免 NodeCard 与 Canvas 各写一套导致的双源不一致。注入 React Flow store（来自 useReactFlow）。
// S2.15 增强：runNode 继承上游连线文本（让 Agent 跑 image/video 能拿上游 prompt）；
//            runAll 按 edges 拓扑排序，保证 提示词→生图→生视频 链路按依赖顺序运行。
import type { Node, Edge } from '@xyflow/react'
import { getKey } from '../settings/vaultStore'
import { getNodeType } from '../registry'
import { volcanoChat } from '../gateway/volcano'
import { seedreamGenerate } from '../gateway/seedream'
import { seedanceGenerate } from '../gateway/seedance'
import { minimaxMusic } from '../gateway/minimax'
import { serializeProject, saveLocal, loadLocal } from '../store/project'
import type { CanvasApi } from '../gateway/agent'
import type { NodeCardData, RfStore } from './types'
import { getSuggestedNodePosition } from './nodeLayout'
import { getDefaultNodeSize } from './modelOptions'
import { getDefaultModel, getDefaultRatio, ratioToSeedreamSize } from './modelOptions'

// 撤销/重做栈（模块级，整个画布共享一份）
let _undoStack: { nodes: unknown[]; edges: unknown[] }[] = []
let _redoStack: { nodes: unknown[]; edges: unknown[] }[] = []
function _cloneState<T>(x: T): T {
  return JSON.parse(JSON.stringify(x))
}

export interface BuildCanvasApiDeps extends RfStore {}

export function buildCanvasApi(store: BuildCanvasApiDeps): CanvasApi {
  const { setNodes, getNodes, getEdges, setEdges } = store

  // 收集直接上游节点（连到本节点 target 的边对应的 source 节点 data）
  const upstreamNodes = (id: string): NodeCardData[] => {
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

  // 上游文本（用于"Prompt 喂下游"）：把上游节点的 text 拼起来作为本节点 prompt
  const upstreamText = (id: string): string =>
    upstreamNodes(id)
      .map((n) => (n.text && n.text.trim() ? String(n.text) : ''))
      .filter(Boolean)
      .join('\n')

  // 精准的"无 prompt"错误提示：区分"上游未生成"与"完全没内容"
  const emptyPromptErr = (id: string): string => {
    if (upstreamNodes(id).length > 0 && !upstreamText(id).trim()) {
      return '上游节点还没生成内容，请先运行上游节点，或将内容直接输入本节点'
    }
    return '请先输入内容，或上游连接一个已生成的文本节点'
  }

  const api: CanvasApi = {
    addNode: (typeId, text) => {
      const nt = getNodeType(typeId)
      if (!nt) return { ok: false, error: `未知节点类型：${typeId}` }
      const id = `agent-${Date.now()}-${Math.floor(Math.random() * 9999)}`
      const ratio = getDefaultRatio(nt.id)
      const size = getDefaultNodeSize(nt.id, ratio)
      setNodes((nds) => [
        ...nds,
        {
          id,
          type: 'card',
          position: getSuggestedNodePosition(nds, nt.id),
          data: {
            kind: nt.name,
            nodeTypeId: nt.id,
            label: `${nt.name} 节点`,
            status: 'idle',
            text: text ?? '',
            ratio,
            model: getDefaultModel(nt.id),
          },
          style: { width: size.w, height: size.h },
        },
      ])
      return { ok: true, nodeId: id }
    },
    runNode: async (id) => {
      const n = getNodes().find((x) => x.id === id)
      if (!n) return { ok: false, error: `找不到节点 ${id}` }
      const dd = n.data as NodeCardData
      // S2.15：prompt 优先用本节点文本，否则继承上游连线文本（让 Agent 跑的链路正确流动）
      const prompt = (dd.text && dd.text.trim()) || upstreamText(id)
      try {
        if (dd.nodeTypeId === 'prompt') {
          // 提示词节点只是文本输入，不调用模型；文本即产出，标记完成
          setNodes((nds) =>
            nds.map((x) => (x.id === id ? { ...x, data: { ...x.data, status: 'done' } } : x)),
          )
          return { ok: true, result: `prompt 节点文本已就绪（${prompt.length} 字）` }
        }
        if (dd.nodeTypeId === 'llm') {
          const key = getKey('volcano')
          if (!key) return { ok: false, error: '缺火山 Key' }
          if (!prompt) return { ok: false, error: emptyPromptErr(id) }
          const r = await volcanoChat(key, [{ role: 'user', content: prompt }])
          setNodes((nds) =>
            nds.map((x) => (x.id === id ? { ...x, data: { ...x.data, result: r, status: 'done' } } : x)),
          )
          return { ok: true, result: `llm 节点产出（前120字）：${r.slice(0, 120)}` }
        }
        if (dd.nodeTypeId === 'image') {
          const key = getKey('volcano')
          if (!key) return { ok: false, error: '缺火山 Key' }
          if (!prompt) return { ok: false, error: emptyPromptErr(id) }
          const urls = await seedreamGenerate(key, prompt, ratioToSeedreamSize(dd.ratio), 1, dd.model || getDefaultModel('image'), undefined, {
            seed: dd.seed,
            resolution: dd.resolution ?? 'standard',
          })
          const url = urls[0] ?? ''
          setNodes((nds) =>
            nds.map((x) => (x.id === id ? { ...x, data: { ...x.data, imageUrl: url, status: 'done' } } : x)),
          )
          return { ok: true, result: `image 节点图片地址：${url}` }
        }
        if (dd.nodeTypeId === 'video') {
          const key = getKey('volcano')
          if (!key) return { ok: false, error: '缺火山 Key' }
          // S2.10/2.15：图生视频依赖上游图片节点已生成首帧图
          const imgUp = upstreamNodes(id).find((n) => n.nodeTypeId === 'image')
          if (imgUp && !imgUp.imageUrl) {
            return { ok: false, error: '上游图片节点还没生成图片（图生视频需首帧图），请先运行该图片节点' }
          }
          if (!prompt) return { ok: false, error: emptyPromptErr(id) }
          const url = await seedanceGenerate(key, prompt, dd.model || getDefaultModel('video'), undefined, {
            duration: dd.duration ?? 5,
            seed: dd.seed,
            resolution: dd.resolution ?? 'standard',
          })
          setNodes((nds) =>
            nds.map((x) => (x.id === id ? { ...x, data: { ...x.data, videoUrl: url, status: 'done' } } : x)),
          )
          return { ok: true, result: `video 节点视频地址：${url}` }
        }
        if (dd.nodeTypeId === 'music') {
          const key = getKey('minimax')
          const group = getKey('minimax_group') ?? ''
          if (!key) return { ok: false, error: '缺 MiniMax Key' }
          if (!prompt) return { ok: false, error: emptyPromptErr(id) }
          const url = await minimaxMusic(key, group, prompt)
          setNodes((nds) =>
            nds.map((x) => (x.id === id ? { ...x, data: { ...x.data, audioUrl: url, status: 'done' } } : x)),
          )
          return { ok: true, result: `music 节点音频地址：${url}` }
        }
        return { ok: false, error: `节点类型 ${dd.nodeTypeId} 暂不支持 Agent 运行` }
      } catch (e) {
        setNodes((nds) =>
          nds.map((x) => (x.id === id ? { ...x, data: { ...x.data, status: 'failed', result: (e as Error).message } } : x)),
        )
        return { ok: false, error: (e as Error).message }
      }
    },
    listNodes: () =>
      getNodes().map((n) => {
        const dd = n.data as NodeCardData
        return {
          id: n.id,
          type: dd.nodeTypeId ?? '',
          label: dd.kind ?? '',
          hasOutput: !!(
            dd.result ||
            dd.imageUrl ||
            dd.videoUrl ||
            dd.audioUrl ||
            (dd.text && dd.text.trim())
          ),
        }
      }),
    getNodeText: (id) => {
      const n = getNodes().find((x) => x.id === id)
      const dd = n?.data as NodeCardData | undefined
      return dd?.text ?? ''
    },
    deleteNode: (id) => {
      const nodes = getNodes()
      const edges = getEdges()
      if (!nodes.find((n) => n.id === id)) return { ok: false, error: `找不到节点 ${id}` }
      _undoStack.push({ nodes: _cloneState(nodes), edges: _cloneState(edges) })
      _redoStack = []
      setNodes((nds) => nds.filter((n) => n.id !== id))
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id))
      return { ok: true }
    },
    connect: (source, target) => {
      if (source === target) return { ok: false, error: '不能连接到自身' }
      const nodes = getNodes()
      const edges = getEdges()
      if (!nodes.find((n) => n.id === source) || !nodes.find((n) => n.id === target))
        return { ok: false, error: '源或目标节点不存在' }
      if (edges.find((e) => e.source === source && e.target === target))
        return { ok: false, error: '该连线已存在' }
      _undoStack.push({ nodes: _cloneState(nodes), edges: _cloneState(edges) })
      _redoStack = []
      setEdges((eds) => [...eds, { id: `e-${source}-${target}-${Date.now()}`, source, target }])
      return { ok: true }
    },
    disconnect: (source, target) => {
      const nodes = getNodes()
      const edges = getEdges()
      _undoStack.push({ nodes: _cloneState(nodes), edges: _cloneState(edges) })
      _redoStack = []
      setEdges((eds) => eds.filter((e) => !(e.source === source && e.target === target)))
      return { ok: true }
    },
    runAll: async () => {
      const nodes = getNodes()
      const edges = getEdges()
      const runnable = nodes.filter((n) => (n.data as NodeCardData).nodeTypeId !== 'agent')
      // S2.15：基于 edges 做 Kahn 拓扑排序，保证上游先于下游运行
      const indeg = new Map<string, number>()
      const adj = new Map<string, string[]>()
      runnable.forEach((n) => {
        indeg.set(n.id, 0)
        adj.set(n.id, [])
      })
      edges.forEach((e) => {
        if (indeg.has(e.source) && indeg.has(e.target)) {
          indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1)
          adj.get(e.source)!.push(e.target)
        }
      })
      const queue = runnable.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id)
      const order: string[] = []
      while (queue.length) {
        const cur = queue.shift()!
        order.push(cur)
        for (const nxt of adj.get(cur) ?? []) {
          indeg.set(nxt, (indeg.get(nxt) ?? 1) - 1)
          if ((indeg.get(nxt) ?? 0) === 0) queue.push(nxt)
        }
      }
      // 兜底：若有环或遗漏，补进队列末尾（仍会按数组序尽力运行）
      runnable.forEach((n) => {
        if (!order.includes(n.id)) order.push(n.id)
      })
      let done = 0
      for (const nid of order) {
        const r = await api.runNode(nid)
        if (r.ok) done++
      }
      return { ok: true, result: `已按依赖顺序运行 ${done}/${runnable.length} 个节点` }
    },
    undo: () => {
      if (_undoStack.length === 0) return { ok: false, error: '没有可撤销的操作' }
      const prev = _undoStack.pop() as { nodes: unknown[]; edges: unknown[] }
      _redoStack.push({ nodes: _cloneState(getNodes()), edges: _cloneState(getEdges()) })
      setNodes(prev.nodes as Node[])
      setEdges(prev.edges as Edge[])
      return { ok: true }
    },
    redo: () => {
      if (_redoStack.length === 0) return { ok: false, error: '没有可重做的操作' }
      const next = _redoStack.pop() as { nodes: unknown[]; edges: unknown[] }
      _undoStack.push({ nodes: _cloneState(getNodes()), edges: _cloneState(getEdges()) })
      setNodes(next.nodes as Node[])
      setEdges(next.edges as Edge[])
      return { ok: true }
    },
    saveTemplate: (name) => {
      try {
        localStorage.setItem(`mc-template-${name}`, JSON.stringify({ nodes: getNodes(), edges: getEdges() }))
        return { ok: true }
      } catch (e) {
        return { ok: false, error: (e as Error).message }
      }
    },
    applyTemplate: (name) => {
      const raw = localStorage.getItem(`mc-template-${name}`)
      if (!raw) return { ok: false, error: `找不到模板：${name}` }
      try {
        const p = JSON.parse(raw) as { nodes: Node[]; edges: Edge[] }
        _undoStack.push({ nodes: _cloneState(getNodes()), edges: _cloneState(getEdges()) })
        _redoStack = []
        setNodes(p.nodes)
        setEdges(p.edges)
        return { ok: true, result: '已套用模板' }
      } catch (e) {
        return { ok: false, error: (e as Error).message }
      }
    },
    copyNode: (id) => {
      const nodes = getNodes()
      const edges = getEdges()
      const src = nodes.find((n) => n.id === id)
      if (!src) return { ok: false, error: `找不到节点 ${id}` }
      const newId = `${id}-copy-${Date.now()}`
      _undoStack.push({ nodes: _cloneState(nodes), edges: _cloneState(edges) })
      _redoStack = []
      setNodes((nds) => [
        ...nds,
        {
          ...src,
          id: newId,
          position: { x: (src.position?.x ?? 0) + 48, y: (src.position?.y ?? 0) + 48 },
          data: {
            ...src.data,
            label: `${(src.data as NodeCardData).label ?? ''} 副本`,
            status: 'idle',
            result: undefined,
            imageUrl: undefined,
            videoUrl: undefined,
            audioUrl: undefined,
          },
          selected: false,
        } as Node,
      ])
      return { ok: true, nodeId: newId }
    },
    autoLayout: () => {
      const nodes = getNodes()
      const edges = getEdges()
      _undoStack.push({ nodes: _cloneState(nodes), edges: _cloneState(edges) })
      _redoStack = []
      const placed: Node[] = []
      setNodes((nds) => nds.map((n) => {
        const next = { ...n, position: getSuggestedNodePosition(placed, String((n.data as NodeCardData).nodeTypeId ?? '')) }
        placed.push(next)
        return next
      }))
      return { ok: true, result: `已自动布局 ${nodes.length} 个节点` }
    },
    // S3.2 项目管理 3（P1）：复用 store/project 的本地存读，让 Agent 也能存/取/新建工程
    newProject: () => {
      _undoStack.push({ nodes: _cloneState(getNodes()), edges: _cloneState(getEdges()) })
      _redoStack = []
      setNodes([])
      setEdges([])
      return { ok: true, result: '已新建空白工程' }
    },
    openProject: () => {
      const p = loadLocal()
      if (!p) return { ok: false, error: '暂无已保存工程' }
      _undoStack.push({ nodes: _cloneState(getNodes()), edges: _cloneState(getEdges()) })
      _redoStack = []
      setNodes(p.nodes)
      setEdges(p.edges)
      return { ok: true, result: '已打开工程' }
    },
    saveProject: () => {
      saveLocal(serializeProject(getNodes(), getEdges()))
      return { ok: true, result: '已保存工程' }
    },
  }

  return api
}
