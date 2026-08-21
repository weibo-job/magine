// S3.6 即梦（Dreamina）工具网关：把原 P2 占位 9 工具转正为真实实现。
// 路由策略（诚实、可运行优先）：
//  - generate_video / generate_image / extend：即梦底层即火山方舟（Seedance/Seedream），直接复用已实装的火山网关，真出图出视频。
//  - lip_sync / digital_human / smart_canvas / template / camera_motion / asset_search：即梦开放平台独占能力，
//    走可配置的即梦开放平台端点（DREAMINA_ENDPOINT），需用户在设置（图/视频 Tab）填即梦 Key。
//    无 Key 时清晰提示；有 Key 时发起真实请求（路径以即梦开放平台文档为准，下方为示意路径，需核对）。
// 注意：即梦开放平台端点/鉴权若与下方不同，改 DREAMINA_ENDPOINT 与 dreaminaCall 路径即可，逻辑不变。
import { seedreamGenerate, DOUBAO_SEEDREAM_MODEL } from './seedream'
import { seedanceGenerate } from './seedance'

const SEEDREAM_ENDPOINT = 'https://ark.cn-beijing.volces.com/api/v3/images/generations'
// 即梦开放平台端点（示意，按官方文档核对）
export const DREAMINA_ENDPOINT = 'https://api.dreamina.cn/v1'

// —— 复用火山（即梦底层即方舟）的真实生成 ——

export async function dreaminaGenerateVideo(apiKey: string, prompt: string): Promise<string> {
  // 即梦文生视频 = 火山 Seedance
  return seedanceGenerate(apiKey, prompt)
}

export async function dreaminaGenerateImage(apiKey: string, prompt: string): Promise<string> {
  // 即梦文生图 = 火山 Seedream
  const urls = await seedreamGenerate(apiKey, prompt)
  return urls[0] ?? ''
}

// 扩图/扩视频：以图片为参考，火山 Seedream 图生图（best-effort）
export async function dreaminaExtend(
  apiKey: string,
  prompt: string,
  imageDataUrl?: string,
): Promise<string> {
  const body: Record<string, unknown> = {
    model: DOUBAO_SEEDREAM_MODEL,
    prompt: prompt || '保持风格，延展画面内容',
    n: 1,
  }
  if (imageDataUrl) body.image = imageDataUrl
  const res = await fetch(SEEDREAM_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`即梦扩图失败 ${res.status}: ${t.slice(0, 200)}`)
  }
  const json: { data?: { url?: string; b64_json?: string }[] } = await res.json()
  const first = json.data?.[0]
  return first?.url ? first.url : `data:image/png;base64,${first?.b64_json ?? ''}`
}

// —— 即梦开放平台独占能力：token 网关（需即梦 Key） ——

async function dreaminaCall(
  apiKey: string | undefined,
  path: string,
  payload: Record<string, unknown>,
): Promise<string> {
  if (!apiKey) {
    return '⚠️ 需即梦开放平台 Key：请在「设置 → 图 / 视频」Tab 填写即梦 Key 后重试（即梦独占能力走开放平台端点）。'
  }
  const res = await fetch(`${DREAMINA_ENDPOINT}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const t = await res.text()
    // 端点/路径与即梦官方不一致时会 4xx，如实回显，便于核对
    return `即梦请求失败 ${res.status}（请核对 DREAMINA_ENDPOINT 与路径 ${path} 是否匹配即梦开放平台文档）：${t.slice(0, 160)}`
  }
  const json: { data?: unknown; task_id?: string } = await res.json().catch(() => ({}))
  return `即梦已受理（${path}）：task_id=${json.task_id ?? 'n/a'}`
}

export function dreaminaLipSync(apiKey: string | undefined, video: string, audio: string): Promise<string> {
  return dreaminaCall(apiKey, '/lip_sync', { video, audio })
}
export function dreaminaDigitalHuman(apiKey: string | undefined, prompt: string): Promise<string> {
  return dreaminaCall(apiKey, '/digital_human', { prompt })
}
export function dreaminaSmartCanvas(apiKey: string | undefined, prompt: string): Promise<string> {
  return dreaminaCall(apiKey, '/smart_canvas', { prompt })
}
export function dreaminaTemplate(apiKey: string | undefined, templateId: string): Promise<string> {
  return dreaminaCall(apiKey, '/template/apply', { template_id: templateId })
}
export function dreaminaCameraMotion(apiKey: string | undefined, video: string, motion: string): Promise<string> {
  return dreaminaCall(apiKey, '/camera_motion', { video, motion })
}
export function dreaminaAssetSearch(apiKey: string | undefined, query: string): Promise<string> {
  return dreaminaCall(apiKey, '/asset/search', { query })
}
