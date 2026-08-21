// S2.9 MiniMax 网关封装（音乐生成 + 语音合成）
// 依据 D4（火山+MiniMax 双底座）：MiniMax 是音乐/语音底座。
// 鉴权：Header `Authorization: Bearer <API_KEY>` + 可选 `GroupId`（MiniMax 多数接口需 GroupId）。
// 注：endpoint / 字段以 MiniMax 官方文档为准；沙箱无 Key 无法实跑，真机需本机填 Key(+GroupId)。
const MINIMAX_BASE = 'https://api.minimax.io/v1'

// 音乐生成模型与语音模型可按控制台实际值覆盖。
export const MINIMAX_MUSIC_MODEL = 'music-01'
export const MINIMAX_TTS_MODEL = 'speech-02-hd'

const POLL_INTERVAL = 3000
const MAX_POLL = 40

interface MiniMaxResp {
  task_id?: string
  base_resp?: { status_code?: number; status_msg?: string }
  // 查询音乐任务
  status?: string
  music_url?: string
  // 语音合成（T2A v2）
  data?: { audio?: string; voice_url?: string; status?: number }
  // 兼容多种返回结构
  audio?: string
  voice_url?: string
}

function headers(apiKey: string, groupId?: string): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  }
  if (groupId) h['GroupId'] = groupId
  return h
}

function fail(r: MiniMaxResp, where: string): never {
  const msg = r.base_resp?.status_msg ?? '未知错误'
  throw new Error(`MiniMax ${where} 失败：${msg}`)
}

export async function minimaxMusic(
  apiKey: string,
  groupId: string,
  prompt: string,
  model: string = MINIMAX_MUSIC_MODEL,
): Promise<string> {
  if (!apiKey) throw new Error('未提供 MiniMax API Key')
  if (!prompt.trim()) throw new Error('prompt 不能为空')

  // 1) 提交音乐生成任务
  const submit = await fetch(`${MINIMAX_BASE}/music_generation`, {
    method: 'POST',
    headers: headers(apiKey, groupId),
    body: JSON.stringify({
      model,
      prompt,
      duration: 60,
    }),
  })
  const sj: MiniMaxResp = await submit.json()
  if (sj.base_resp?.status_code && sj.base_resp.status_code !== 0) fail(sj, '提交')
  const taskId = sj.task_id
  if (!taskId) throw new Error('MiniMax 未返回任务 id')

  // 2) 轮询任务结果（音乐为异步任务）
  for (let i = 0; i < MAX_POLL; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL))
    const q = await fetch(
      `${MINIMAX_BASE}/query/music_generation?task_id=${taskId}`,
      { headers: headers(apiKey, groupId) },
    )
    const qj: MiniMaxResp = await q.json()
    if (qj.base_resp?.status_code && qj.base_resp.status_code !== 0) fail(qj, '查询')
    if (qj.status === 'SUCCESS' || qj.status === 'success') {
      const url = qj.music_url
      if (!url) throw new Error('MiniMax 音乐任务成功但未返回音频地址')
      return url
    }
    if (qj.status === 'FAIL' || qj.status === 'fail') fail(qj, '任务')
  }
  throw new Error('MiniMax 音乐生成超时（已达最大轮询次数）')
}

export async function minimaxTts(
  apiKey: string,
  groupId: string,
  text: string,
  voiceId = 'male-qn-qingse',
): Promise<string> {
  if (!apiKey) throw new Error('未提供 MiniMax API Key')
  if (!text.trim()) throw new Error('text 不能为空')

  const r = await fetch(`${MINIMAX_BASE}/t2a_v2`, {
    method: 'POST',
    headers: headers(apiKey, groupId),
    body: JSON.stringify({
      model: MINIMAX_TTS_MODEL,
      text,
      voice_setting: { voice_id: voiceId, speed: 1, vol: 1, pitch: 0 },
      audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3' },
    }),
  })
  const j: MiniMaxResp = await r.json()
  if (j.base_resp?.status_code && j.base_resp.status_code !== 0) fail(j, '语音合成')
  const audio = j.data?.audio ?? j.audio
  if (audio) return `data:audio/mp3;base64,${audio}`
  if (j.data?.voice_url ?? j.voice_url) return j.data?.voice_url ?? j.voice_url!
  throw new Error('MiniMax 语音合成未返回音频')
}
