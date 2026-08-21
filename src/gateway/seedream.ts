// S2.7 火山方舟 Seedream 文生图封装
// Endpoint: https://ark.cn-beijing.volces.com/api/v3/images/generations（OpenAI 兼容图像接口）
// 凭证：ARK_API_KEY（与对话同 Key，D4）。OpenAI GPT-Image-2 为备选（后续接路由）。
const SEEDREAM_ENDPOINT = 'https://ark.cn-beijing.volces.com/api/v3/images/generations'

// Seedream 模型 ID：鸿哥控制台开通的是 5.0-pro（doubao-seedream-5-0-pro-260628）。
// 默认非 pro（260128）会报 ModelNotOpen，故默认走 pro。
export const DOUBAO_SEEDREAM_MODEL = 'doubao-seedream-5-0-pro-260628'

export interface SeedreamOptions {
  seed?: number
  resolution?: 'standard' | 'high'
}

export async function seedreamGenerate(
  apiKey: string,
  prompt: string,
  size = '1024x1024',
  n = 1,
  model: string = DOUBAO_SEEDREAM_MODEL,
  imageUrl?: string,
  options: SeedreamOptions = {},
): Promise<string[]> {
  if (!apiKey) throw new Error('未提供火山 API Key')
  if (!prompt.trim()) throw new Error('prompt 不能为空')

  // S3.10：支持图生图。有参考图时用 OpenAI 兼容 content 数组（image_url + text），
  // 此时不能同时传 prompt 字段；否则走普通文生图。
  const body: Record<string, unknown> = { model, size, n }
  if (options.seed !== undefined) body.seed = options.seed
  if (options.resolution) body.resolution = options.resolution
  if (imageUrl && imageUrl.trim()) {
    body.content = [
      { type: 'image_url', image_url: { url: imageUrl.trim() } },
      { type: 'text', text: prompt.trim() },
    ]
  } else {
    body.prompt = prompt.trim()
  }

  const res = await fetch(SEEDREAM_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Seedream 调用失败 ${res.status}: ${t.slice(0, 240)}`)
  }
  const json: { data?: { url?: string; b64_json?: string }[] } = await res.json()
  const arr = json.data ?? []
  return arr.map((d) => (d.url ? d.url : `data:image/png;base64,${d.b64_json ?? ''}`))
}
