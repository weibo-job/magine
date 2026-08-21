// DeepSeek LLM 网关：OpenAI 兼容格式
// Endpoint: https://api.deepseek.com/chat/completions
// 模型：deepseek-v4-flash（鸿哥本机默认，models.json 已配）/ deepseek-reasoner(R1) 等，以 DeepSeek 控制台为准。
import type { ChatMessage, StreamHandlers } from './volcano'

export const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/chat/completions'
export const DEEPSEEK_CHAT_MODEL = 'deepseek-v4-flash'
export const DEEPSEEK_REASONER_MODEL = 'deepseek-reasoner'

export async function deepseekChat(
  apiKey: string,
  messages: ChatMessage[],
  model: string = DEEPSEEK_CHAT_MODEL,
): Promise<string> {
  if (!apiKey) throw new Error('未提供 DeepSeek API Key')
  const res = await fetch(DEEPSEEK_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages }),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`DeepSeek 调用失败 ${res.status}: ${t.slice(0, 240)}`)
  }
  const json: { choices?: { message?: { content?: string } }[] } = await res.json()
  return json?.choices?.[0]?.message?.content ?? ''
}

export async function deepseekChatStream(
  apiKey: string,
  messages: ChatMessage[],
  handlers: StreamHandlers,
  model: string = DEEPSEEK_CHAT_MODEL,
  signal?: AbortSignal,
): Promise<{ think: string; text: string }> {
  if (!apiKey) throw new Error('未提供 DeepSeek API Key')
  const res = await fetch(DEEPSEEK_ENDPOINT, {
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
    throw new Error(`DeepSeek 流式调用失败 ${res.status}: ${t.slice(0, 240)}`)
  }
  if (!res.body) throw new Error('DeepSeek 流式响应缺少 body')
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
      // DeepSeek reasoner 用 reasoning_content 暴露思维链
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
  handlers.onDone?.({ think, text })
  return { think, text }
}
