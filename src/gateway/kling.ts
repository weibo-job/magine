const KLING_BASE = 'https://api.klingai.com/v1'

function base64Url(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function makeToken(accessKey: string, secretKey: string): Promise<string> {
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const now = Math.floor(Date.now() / 1000)
  const payload = base64Url(JSON.stringify({ iss: accessKey, exp: now + 1800, nbf: now - 5 }))
  const input = `${header}.${payload}`
  const cryptoKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(secretKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(input))
  const bytes = new Uint8Array(signature)
  let binary = ''
  bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  return `${input}.${btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`
}

export async function klingTextToVideo(
  accessKey: string,
  secretKey: string,
  prompt: string,
  ratio = '9:16',
  signal?: AbortSignal,
): Promise<string> {
  if (!accessKey || !secretKey) throw new Error('Kling 需要同时配置 Access Key 和 Secret Key')
  const token = await makeToken(accessKey, secretKey)
  const created = await fetch(`${KLING_BASE}/videos/text2video`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ model_name: 'kling-v1', prompt, duration: '5', aspect_ratio: ratio, mode: 'std' }),
    signal,
  })
  const createdJson = await created.json().catch(() => ({})) as { code?: number; message?: string; data?: { task_id?: string } }
  if (!created.ok || !createdJson.data?.task_id) throw new Error(`Kling 创建任务失败：${createdJson.message || created.status}`)
  const taskId = createdJson.data.task_id
  for (let i = 0; i < 45; i += 1) {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(resolve, 4000)
      signal?.addEventListener('abort', () => { window.clearTimeout(timer); reject(new DOMException('Kling 任务已取消', 'AbortError')) }, { once: true })
    })
    const result = await fetch(`${KLING_BASE}/videos/text2video/${taskId}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    })
    const json = await result.json().catch(() => ({})) as { code?: number; message?: string; data?: { task_status?: string; task_status_msg?: string; task_result?: { videos?: { url?: string }[] } } }
    const data = json.data
    if (data?.task_status === 'succeed' && data.task_result?.videos?.[0]?.url) return data.task_result.videos[0].url
    if (data?.task_status === 'failed') throw new Error(`Kling 生成失败：${data.task_status_msg || json.message || '任务失败'}`)
  }
  throw new Error('Kling 任务超时，请稍后在 Kling 控制台查看任务状态')
}
