// S1.8 三注册表 — 聚合入口 + 查询 API + 统一 stub 运行器（命脉验收点）
import { nodes } from './nodes'
import { tools } from './tools'
import { providers } from './providers'
import type { NodeType, Tool, Provider } from './types'

export { nodes, tools, providers }
export type { NodeType, Tool, Provider }

export const NODE_COUNT = nodes.length
export const TOOL_COUNT = tools.length
export const PROVIDER_COUNT = providers.length

export function getNodeType(id: string): NodeType | undefined {
  return nodes.find((n) => n.id === id)
}
export function getTool(id: string): Tool | undefined {
  return tools.find((t) => t.id === id)
}
export function getProvider(id: string): Provider | undefined {
  return providers.find((p) => p.id === id)
}

export function listNodes(): NodeType[] {
  return nodes
}
export function listTools(): Tool[] {
  return tools
}
export function listProviders(): Provider[] {
  return providers
}

/** 统一 stub 运行器：阶段 1 任何工具调用都先返回 stub，不得伪造实现（决策记录 §4） */
export interface StubResult {
  ok: boolean
  stub: true
  toolId?: string
  message: string
}

export function runToolStub(id: string): StubResult {
  const t = getTool(id)
  if (!t) {
    return { ok: false, stub: true, message: `未知工具：${id}` }
  }
  return {
    ok: true,
    stub: true,
    toolId: t.id,
    message: `工具「${t.name}」(${t.impl === 'stub' ? '占位' : '已规划'}) 尚未实装，返回 stub 响应`,
  }
}
