// S2.3 对话测试面板：支持火山 / DeepSeek 切换测试
import { useState } from 'react'
import { volcanoChat } from './volcano'
import { deepseekChat, DEEPSEEK_CHAT_MODEL } from './deepseek'

interface Props {
  volcanoKey: string
  deepseekKey: string
  deepseekModel?: string
}

export default function ChatTest({ volcanoKey, deepseekKey, deepseekModel }: Props) {
  const [provider, setProvider] = useState<'volcano' | 'deepseek'>('deepseek')
  const [input, setInput] = useState('')
  const [reply, setReply] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  async function send() {
    if (!input.trim()) return
    const key = provider === 'deepseek' ? deepseekKey : volcanoKey
    if (!key) {
      setErr(`请先在上方填好 ${provider === 'deepseek' ? 'DeepSeek' : '火山'} 的 API Key 并点"保存全部"`)
      return
    }
    setLoading(true)
    setErr('')
    setReply('')
    try {
      const r =
        provider === 'deepseek'
          ? await deepseekChat(key, [{ role: 'user', content: input }], deepseekModel || DEEPSEEK_CHAT_MODEL)
          : await volcanoChat(key, [{ role: 'user', content: input }])
      setReply(r)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="cc-chat">
      <div className="cc-chat-title">
        对话测试
        <select
          className="cc-chat-select"
          value={provider}
          onChange={(e) => setProvider(e.target.value as 'volcano' | 'deepseek')}
        >
          <option value="deepseek">DeepSeek</option>
          <option value="volcano">火山 Doubao</option>
        </select>
      </div>
      <textarea
        className="cc-input cc-chat-input"
        value={input}
        placeholder={`输入一句话，测试 ${provider === 'deepseek' ? 'DeepSeek' : '火山 Doubao'} 对话…`}
        onChange={(e) => setInput(e.target.value)}
      />
      <button className="primary-btn" onClick={send} disabled={loading}>
        {loading ? '调用中…' : '发送测试'}
      </button>
      {err && <div className="cc-error">{err}</div>}
      {reply && <div className="cc-chat-reply">{reply}</div>}
    </div>
  )
}
