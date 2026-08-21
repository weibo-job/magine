// S1.8 服务商路由表（依据三注册表条目清单 §三）
import type { Provider } from './types'

export const providers: Provider[] = [
  { id: 'deepseek', name: 'DeepSeek', capabilities: ['text'], phase: 'P0', impl: 'real', note: 'OpenAI 兼容，deepseek-chat / deepseek-reasoner' },
  { id: 'volcano', name: '火山引擎（字节方舟）', capabilities: ['text', 'image', 'video', 'enhance'], phase: 'P0', impl: 'real', note: 'Seedream / Seedance / Doubao / 画质增强 走方舟（D4）' },
  { id: 'minimax', name: 'MiniMax', capabilities: ['text', 'music', 'tts', 'video'], phase: 'P0', impl: 'real', note: '音乐 / 语音 / 视频底座' },
  { id: 'openai', name: 'OpenAI', capabilities: ['text', 'image'], phase: 'P0', impl: 'real', note: '备选模型' },
  { id: 'hailuo', name: '海螺（MiniMax 视频）', capabilities: ['video'], phase: 'P0', impl: 'real', note: '视频备选' },
  { id: 'kling', name: '快手可灵', capabilities: ['video'], phase: 'P2', impl: 'stub', note: '可选升级' },
  { id: 'dreamina', name: '即梦 CLI', capabilities: ['image', 'video'], phase: 'P2', impl: 'real', note: '即梦工具已转正：视频/图/扩图路由火山，独占能力走即梦开放平台端点（需即梦 Key）' },
]
