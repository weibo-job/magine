// S2.2 模型聚合网关 · 服务商路由（实装路由逻辑，不真调模型）
// 依据 D4（火山+MiniMax 双底座）与 providers 表（S1.8）：按 capability 选 provider，
// 火山优先、OpenAI 备选、其余 P0 兜底，P2 stub 仅在无 P0 时启用。
import { providers } from '../registry/providers'
import type { Provider } from '../registry/types'

// 路由优先级（越小越优先）。DeepSeek 优先（鸿哥偏好），火山为第一底座，OpenAI 备选，MiniMax 音乐/语音底座。
const PRIORITY: string[] = ['deepseek', 'volcano', 'openai', 'minimax', 'hailuo', 'kling', 'dreamina']

export function listProvidersFor(capability: string): Provider[] {
  return providers.filter((p) => p.capabilities.includes(capability))
}

// 选默认 provider：给定能力 → 优先级最高者（排除列表用于"上一个失败换下一个"）
export function selectProvider(capability: string, exclude: string[] = []): Provider | null {
  const candidates = listProvidersFor(capability).filter((p) => !exclude.includes(p.id))
  if (candidates.length === 0) return null
  candidates.sort((a, b) => {
    const ia = PRIORITY.indexOf(a.id)
    const ib = PRIORITY.indexOf(b.id)
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
  })
  return candidates[0]
}

// 全能力默认路由表（供 UI / 调试预览）
export function defaultRouteTable(): Record<string, string> {
  const caps = new Set<string>()
  providers.forEach((p) => p.capabilities.forEach((c) => caps.add(c)))
  const table: Record<string, string> = {}
  caps.forEach((c) => {
    const p = selectProvider(c)
    table[c] = p ? p.name : '（无可用服务商）'
  })
  return table
}
