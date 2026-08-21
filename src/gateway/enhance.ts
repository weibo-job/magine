// S3.6 画质增强节点网关：Topaz 风格高清修复
// 策略：有火山 Key 时优先走火山图像编辑（img2img 高清修复，best-effort）；
// 任意失败（无 Key / 调用失败 / 模型不支持）一律回退到「本地 canvas 2x 上采样 + 锐化」，
// 保证节点离线也能产出可见的增强图，绝不空壳。
// 说明：火山图像编辑端点与入参随方舟控制台版本可能变化，AI 路径失败时自动降级，错误会如实回显。
import { DOUBAO_SEEDREAM_MODEL } from './seedream'

const SEEDREAM_ENDPOINT = 'https://ark.cn-beijing.volces.com/api/v3/images/generations'

export interface EnhanceResult {
  url: string
  mode: 'ai' | 'local'
  note: string
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片解码失败'))
    img.src = src
  })
}

// 本地增强：2x 双线性上采样 + 轻度锐化（3x3 非锐化掩膜），完全离线。
export async function enhanceImageLocally(
  imageDataUrl: string,
  scale = 2,
): Promise<string> {
  const img = await loadImage(imageDataUrl)
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建画布上下文')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, w, h)

  // 轻度锐化：把原图与轻微模糊的差加回去（unsharp mask，强度 0.4）
  try {
    const srcData = ctx.getImageData(0, 0, w, h)
    const src = srcData.data
    const blur = ctx.getImageData(0, 0, w, h)
    // 用快速盒式模糊近似（滑窗均值）
    const radius = 1
    const tmp = new Uint8ClampedArray(src.length)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let r = 0
        let g = 0
        let b = 0
        let cnt = 0
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = Math.min(w - 1, Math.max(0, x + dx))
            const ny = Math.min(h - 1, Math.max(0, y + dy))
            const idx = (ny * w + nx) * 4
            r += blur.data[idx]
            g += blur.data[idx + 1]
            b += blur.data[idx + 2]
            cnt++
          }
        }
        const idx = (y * w + x) * 4
        tmp[idx] = r / cnt
        tmp[idx + 1] = g / cnt
        tmp[idx + 2] = b / cnt
        tmp[idx + 3] = 255
      }
    }
    const amount = 0.4
    for (let i = 0; i < src.length; i += 4) {
      src[i] = Math.min(255, Math.max(0, src[i] + amount * (src[i] - tmp[i])))
      src[i + 1] = Math.min(255, Math.max(0, src[i + 1] + amount * (src[i + 1] - tmp[i + 1])))
      src[i + 2] = Math.min(255, Math.max(0, src[i + 2] + amount * (src[i + 2] - tmp[i + 2])))
    }
    ctx.putImageData(srcData, 0, 0)
  } catch {
    // 像素处理失败（如跨域污染）则保留上采样结果，不阻断
  }
  return canvas.toDataURL('image/png')
}

// 火山 AI 高清修复：把图作为 image 入参，prompt 强调超分与细节（端点的具体支持以方舟控制台为准）。
async function enhanceImageAi(
  apiKey: string,
  imageDataUrl: string,
): Promise<string> {
  if (!apiKey) throw new Error('未提供火山 API Key')
  const body: Record<string, unknown> = {
    model: DOUBAO_SEEDREAM_MODEL,
    prompt:
      '高清修复、2倍超分辨率、提升清晰度与细节、去除噪点与压缩伪影、保持色彩自然',
    image: imageDataUrl,
    n: 1,
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
    throw new Error(`火山画质增强失败 ${res.status}: ${t.slice(0, 240)}`)
  }
  const json: { data?: { url?: string; b64_json?: string }[] } = await res.json()
  const first = json.data?.[0]
  if (!first) throw new Error('火山画质增强返回空')
  return first.url ? first.url : `data:image/png;base64,${first.b64_json ?? ''}`
}

// 统一入口：优先 AI，失败降级本地。返回所用模式，便于节点如实标注。
export async function enhanceImage(
  apiKey: string | undefined,
  imageDataUrl: string,
  scale = 2,
): Promise<EnhanceResult> {
  if (apiKey) {
    try {
      const url = await enhanceImageAi(apiKey, imageDataUrl)
      return { url, mode: 'ai', note: '火山 AI 高清修复' }
    } catch (e) {
      const url = await enhanceImageLocally(imageDataUrl, scale)
      return {
        url,
        mode: 'local',
        note: `本地增强（AI 路径失败：${(e as Error).message.slice(0, 80)}）`,
      }
    }
  }
  const url = await enhanceImageLocally(imageDataUrl, scale)
  return { url, mode: 'local', note: '本地增强（未配置火山 Key）' }
}
