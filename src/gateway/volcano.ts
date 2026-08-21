// S2.3 火山引擎（字节方舟 Ark）文本/对话封装
// Endpoint: https://ark.cn-beijing.volces.com/api/v3/chat/completions
// 凭证：ARK_API_KEY（鸿哥已在 ~/.workbuddy/mcp.json 配置火山方舟 Key，D4）
const ARK_ENDPOINT = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions'

// 默认对话模型：Doubao 系列。模型 ID 以火山方舟控制台为准，可在此覆盖或后续接配置。
export const DOUBAO_CHAT_MODEL = 'doubao-seed-1-6-250615'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

// 调用火山方舟 chat/completions。渲染进程 fetch 直连（Ark 支持 CORS）；
// 若后续受限，改走 Electron 主进程 ipc（S2 网关收口时统一）。
export async function volcanoChat(
  apiKey: string,
  messages: ChatMessage[],
  model: string = DOUBAO_CHAT_MODEL,
): Promise<string> {
  if (!apiKey) throw new Error('未提供火山 API Key')
  const res = await fetch(ARK_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages }),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`火山调用失败 ${res.status}: ${t.slice(0, 240)}`)
  }
  const json: { choices?: { message?: { content?: string } }[] } = await res.json()
  return json?.choices?.[0]?.message?.content ?? ''
}

// S2.11 / S2.12：火山豆包流式对话，支持 <think> 思维链（reasoning_content 增量）+ 文本增量。
// 前端可借此实现"边想边显"的流式体验（真机需本机 Key + 网络，沙箱仅编译验证）。
export interface StreamHandlers {
  onThink?: (delta: string) => void
  onText?: (delta: string) => void
  onDone?: (full: { think: string; text: string }) => void
}

export async function volcanoChatStream(
  apiKey: string,
  messages: ChatMessage[],
  handlers: StreamHandlers,
  model: string = DOUBAO_CHAT_MODEL,
  signal?: AbortSignal,
): Promise<{ think: string; text: string }> {
  if (!apiKey) throw new Error('未提供火山 API Key')
  const res = await fetch(ARK_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    signal,
    body: JSON.stringify({ model, messages, stream: true }),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`火山流式调用失败 ${res.status}: ${t.slice(0, 240)}`)
  }
  if (!res.body) throw new Error('火山流式响应缺少 body')
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let think = ''
  let text = ''
  const handleLine = (line: string) => {
    const s = line.trim()
    if (!s.startsWith('data:')) return
    const payload = s.slice(5).trim()
    if (payload === '[DONE]') return
    try {
      const json = JSON.parse(payload)
      const delta = json?.choices?.[0]?.delta ?? {}
      if (delta.reasoning_content) {
        think += delta.reasoning_content
        handlers.onThink?.(delta.reasoning_content)
      }
      if (delta.content) {
        text += delta.content
        handlers.onText?.(delta.content)
      }
    } catch {
      /* 忽略非 JSON 心跳 / 注释行 */
    }
  }
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const ln of lines) handleLine(ln)
  }
  // 兜底：若模型未走 reasoning_content，尝试从文本里解析 <think> 标签
  const tag = text.match(/<think>([\s\S]*?)<\/think>/)
  if (tag && !think) {
    think = tag[1].trim()
    text = text.replace(/<think>[\s\S]*?<\/think>/, '').trim()
  }
  handlers.onDone?.({ think, text })
  return { think, text }
}
