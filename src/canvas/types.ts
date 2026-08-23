// S2.15 节点卡片数据类型外置：供 NodeCard 与 canvasApi 共享，解开循环依赖。
import type { Node, Edge } from '@xyflow/react'

export type NodeStatus = 'idle' | 'running' | 'done' | 'failed'

export interface NodeCardData {
  label: string
  kind: string
  nodeTypeId?: string
  status?: NodeStatus
  text?: string
  result?: string
  imageUrl?: string
  /** S4.2 多图结果切换：一次生成的多张结果（复刻小云雀"结果 N 可切前一张"） */
  results?: string[]
  /** S4.2 当前展示的结果下标 */
  resultIndex?: number
  panoramaUrl?: string
  videoUrl?: string
  /** 视频节点：上游图像节点自动喂入的首帧参考图（图生视频） */
  refImageUrl?: string
  audioUrl?: string
  faceBlurUrl?: string
  files?: { name: string; size: number; dataUrl?: string }[]
  region?: string
  regionName?: string
  storyboard?: string
  ratio?: string
  /** 用户在提示词框「模型」按钮里选择的模型 ID；不同节点类型对应不同网关/模型 */
  model?: string
  duration?: number
  seed?: number
  resolution?: 'standard' | 'high' | '4k'
  /** 图像编辑节点（edit）的编辑模式：inpaint/outpaint/style/lighting/lens/portrait/makeup */
  editMode?: string
  agentThink?: string
  agentText?: string
  agentTrace?: { tool: string; args: Record<string, unknown>; result: string }[]
  [key: string]: unknown
}

export const STATUS_LABEL: Record<NodeStatus, string> = {
  idle: '待命',
  running: '运行中',
  done: '完成',
  failed: '失败',
}

export const STATUS_COLOR: Record<NodeStatus, string> = {
  idle: '#999999',
  running: '#3b82f6',
  done: '#22c55e',
  failed: '#ef4444',
}

// React Flow store 的最小操作集合（由 useReactFlow 提供），供 buildCanvasApi 注入，
// 使 NodeCard 与 Canvas 全局入口共用同一套画布操作实现。setter 类型与 React Flow 一致
// （数组或更新函数皆可），既支持 (nds)=>[...] 也能直接 setNodes(arr)。
export interface RfStore {
  setNodes: (nodes: Node[] | ((nds: Node[]) => Node[])) => void
  getNodes: () => Node[]
  getEdges: () => Edge[]
  setEdges: (edges: Edge[] | ((eds: Edge[]) => Edge[])) => void
}
