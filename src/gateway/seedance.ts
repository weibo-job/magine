// S2.8 火山方舟 Seedance 文生视频封装（异步任务：提交 → 轮询 → 取视频地址）
// 与 seedream 同属字节系，共用 ARK_API_KEY（D4 实装，非绕开）。
// 注意：视频生成为异步任务，接口先返回任务 id，再轮询结果；与图像同步返回不同。
const SEEDANCE_SUBMIT = 'https://ark.cn-beijing.volces.com/api/v3/videos/generations'
const SEEDANCE_QUERY = 'https://ark.cn-beijing.volces.com/api/v3/videos'

// 模型 ID：Seedance 2.0（doubao-seedance-2-0-260128），版本更新以控制台为准可覆盖。
export const DOUBAO_SEEDANCE_MODEL = 'doubao-seedance-2-0-260128'

export interface SeedanceOptions {
  duration?: number
  seed?: number
  resolution?: 'standard' | 'high'
}

const POLL_INTERVAL = 3000 // 每 3 秒查一次
const MAX_POLL = 40 // 最多轮询 40 次（约 2 分钟，超时交给本机调试）

interface SeedanceSubmitResp {
  id?: string
}

interface SeedanceQueryResp {
  status?: string
  data?: { url?: string }[]
  video_url?: string
  url?: string
  result?: { url?: string }
  error?: { message?: string }
}

function headers(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  }
}

function extractVideoUrl(qj: SeedanceQueryResp): string | null {
  if (qj.data && qj.data[0] && qj.data[0].url) return qj.data[0].url
  if (qj.video_url) return qj.video_url
  if (qj.result && qj.result.url) return qj.result.url
  if (typeof qj.url === 'string') return qj.url
  return null
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function seedanceGenerate(
  apiKey: string,
  prompt: string,
  model: string = DOUBAO_SEEDANCE_MODEL,
  imageUrl?: string,
  options: SeedanceOptions = {},
): Promise<string> {
  if (!apiKey) throw new Error('未提供火山 API Key')
  if (!prompt.trim()) throw new Error('prompt 不能为空')

  // 图生视频：content 里先放 image_url，再放文本指令
  const content: { type: string; text?: string; image_url?: { url: string } }[] = []
  if (imageUrl) {
    content.push({ type: 'image_url', image_url: { url: imageUrl } })
  }
  content.push({ type: 'text', text: prompt })

  // 1) 提交视频生成任务
  const submit = await fetch(SEEDANCE_SUBMIT, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({
      model,
      content,
      ...(options.duration ? { duration: options.duration } : {}),
      ...(options.seed !== undefined ? { seed: options.seed } : {}),
      ...(options.resolution ? { resolution: options.resolution } : {}),
    }),
  })
  if (!submit.ok) {
    const t = await submit.text()
    throw new Error(`Seedance 提交失败 ${submit.status}: ${t.slice(0, 240)}`)
  }
  const sj: SeedanceSubmitResp = await submit.json()
  const taskId = sj.id
  if (!taskId) throw new Error('Seedance 未返回任务 id')

  // 2) 轮询任务结果（火山视频为异步任务）
  for (let i = 0; i < MAX_POLL; i++) {
    await sleep(POLL_INTERVAL)
    const q = await fetch(`${SEEDANCE_QUERY}/${taskId}`, { headers: headers(apiKey) })
    if (!q.ok) {
      const t = await q.text()
      throw new Error(`Seedance 查询失败 ${q.status}: ${t.slice(0, 240)}`)
    }
    const qj: SeedanceQueryResp = await q.json()
    if (qj.status === 'succeeded') {
      const url = extractVideoUrl(qj)
      if (!url) throw new Error('Seedance 任务成功但未返回视频地址')
      return url
    }
    if (qj.status === 'failed') {
      throw new Error(`Seedance 任务失败：${qj.error?.message ?? '未知错误'}`)
    }
    // 其余状态（running / submitted / queued）继续轮询
  }
  throw new Error('Seedance 生成超时（已达最大轮询次数），可稍后在火山控制台查看任务')
}
