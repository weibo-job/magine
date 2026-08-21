// S1.8 三注册表 — 类型定义（依据 HANDOFF §5 + 三注册表条目清单）
export type Phase = 'P0' | 'P1' | 'P2'
export type NodeStatus = 'active' | 'stub'
export type Impl = 'real' | 'stub'

/** 节点类型表条目（12 项） */
export interface NodeType {
  id: string
  name: string
  group: '核心' | '基础' | '扩展'
  phase: Phase
  status: NodeStatus
  desc: string
}

/** 工具表条目（57 项） */
export interface Tool {
  id: string
  name: string
  group: 'canvas' | 'fs' | 'net' | 'terminal' | 'api' | 'music' | 'project' | 'misc' | 'dreamina'
  phase: Phase
  impl: Impl
  step: string
  desc: string
}

/** 服务商路由表条目 */
export interface Provider {
  id: string
  name: string
  capabilities: string[]
  phase: Phase
  impl: Impl
  note?: string
}
