// 节点生成参数配置中心：模型 / 比例 / 尺寸
// 从 Canvas.tsx 拆出，供 NodeCard 做运行时防御性 fallback，避免循环依赖。

export interface ModelOpt { id: string; label: string }

export const MODEL_OPTIONS: Record<string, ModelOpt[]> = {
  // 鸿哥火山控制台只开通了 5.0-pro（非 pro 版 260128 报 ModelNotOpen，已移除），故仅保留 Pro。
  image: [
    { id: 'doubao-seedream-5-0-pro-260628', label: 'Seedream 5.0 Pro' },
  ],
  edit: [
    { id: 'doubao-seedream-5-0-pro-260628', label: 'Seedream 5.0 Pro' },
  ],
  video: [
    { id: 'doubao-seedance-2-0-260128', label: 'Seedance 2.0' },
  ],
  llm: [
    { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
    { id: 'deepseek-reasoner', label: 'DeepSeek R1' },
  ],
  agent: [
    { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
    { id: 'deepseek-reasoner', label: 'DeepSeek R1' },
  ],
  prompt: [
    { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
    { id: 'deepseek-reasoner', label: 'DeepSeek R1' },
  ],
  music: [
    { id: 'music-01', label: 'MiniMax Music' },
    { id: 'speech-02-hd', label: 'MiniMax TTS HD' },
  ],
  topaz: [{ id: 'doubao-seedream-5-0-pro-260628', label: 'Seedream 5.0 Pro 增强' }],
  face: [{ id: 'doubao-vision-pro', label: '豆包 Vision' }],
}

export const getModelOptions = (kind?: string) => MODEL_OPTIONS[kind ?? ''] ?? []
export const getDefaultModel = (kind?: string) => getModelOptions(kind)[0]?.id
export const getModelLabel = (kind?: string, id?: string) => {
  const opts = getModelOptions(kind)
  return opts.find((o) => o.id === id)?.label ?? (id ?? getDefaultModel(kind) ?? '选择模型')
}

// 小云雀风 · 比例 → 节点尺寸（9:16 竖 220×391 / 16:9 横 360×202 / 3:4 竖 240×320 / 4:3 横 300×225）
export const RATIO_SIZE: Record<string, { w: number; h: number }> = {
  '9:16': { w: 220, h: 391 },
  '16:9': { w: 360, h: 202 },
  '3:4': { w: 240, h: 320 },
  '4:3': { w: 300, h: 225 },
}

export const DEFAULT_RATIO: Record<string, string> = {
  image: '9:16',
  video: '9:16',
  llm: '1:1',
  agent: '1:1',
  music: '1:1',
  prompt: '1:1',
  edit: '1:1',
  material: '3:4',
  storyboard: '16:9',
  region: '1:1',
  panorama: '16:9',
  topaz: '1:1',
  face: '1:1',
}

export const getDefaultRatio = (kind?: string) => DEFAULT_RATIO[kind ?? ''] ?? '9:16'

// 节点卡片默认尺寸：文本类按内容工作区统一，媒体类按画面比例保留竖/横构图。
export function getDefaultNodeSize(kind?: string, ratio?: string): { w: number; h: number } {
  if (kind === 'image' || kind === 'edit' || kind === 'video') return RATIO_SIZE[ratio ?? getDefaultRatio(kind)] ?? RATIO_SIZE['9:16']
  if (kind === 'prompt') return { w: 320, h: 220 }
  if (kind === 'llm') return { w: 440, h: 360 }
  if (kind === 'agent') return { w: 460, h: 420 }
  if (kind === 'music') return { w: 360, h: 280 }
  return { w: 340, h: 260 }
}

// 把画面比例转成火山 Seedream 支持的 size 字符串（w×h）。
// 注意：不同模型实际支持尺寸以控制台为准；这里取常用分辨率兜底。
export function ratioToSeedreamSize(ratio?: string): string {
  switch (ratio) {
    case '1:1':
      return '1024x1024'
    case '16:9':
      return '1792x1024'
    case '9:16':
      return '1024x1792'
    case '4:3':
      return '1024x768'
    case '3:4':
      return '768x1024'
    default:
      return '1024x1024'
  }
}
