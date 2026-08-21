// S3.6 人脸合规节点网关：把图片交给火山视觉理解模型做平台合规初筛。
// 模型对图片给出结构化判定（清晰 / 遮挡 / 水印 / 人脸数 / 是否合规 + 理由）。
// 说明：视觉模型 ID 以火山方舟控制台为准，下方常量可改；调用需火山 Key。
const ARK_ENDPOINT = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions'

// 火山视觉理解模型（如控制台版本不同请改此常量）
export const DOUBAO_VISION_MODEL = 'doubao-1.5-vision-pro-32k'

export interface FaceCompliance {
  clear: boolean // 人脸是否清晰
  occlusion: boolean // 是否遮挡
  watermark: boolean // 是否有水印/违规贴纸
  faceCount: number // 人脸数量
  compliant: boolean // 综合是否合规
  reasons: string[] // 不合规或需注意的点
  regions: { x: number; y: number; width: number; height: number }[] // 归一化人脸区域
  raw: string // 模型原始结论
}

const COMPLIANCE_PROMPT = `你是内容审核助手。请判断这张图片中的人脸是否满足常见短视频/电商平台的发布合规要求。
请严格只输出一个 JSON（不要解释、不要 markdown 代码块），字段如下：
{
  "clear": boolean,        // 人脸是否清晰可辨
  "occlusion": boolean,    // 是否存在遮挡（口罩/墨镜/手势遮脸等）
  "watermark": boolean,    // 是否带有水印、二维码或违规贴纸
  "faceCount": number,     // 图片中人脸数量
  "compliant": boolean,    // 综合是否合规（清晰、无遮挡、无水印、且人脸数<=4 视为合规）
  "reasons": string[],     // 若不合规或需注意，列出具体原因；合规则可为空数组
  "regions": [{"x":0,"y":0,"width":1,"height":1}] // 人脸区域，坐标归一化到 0-1
}`

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) return fenced[1].trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) return text.slice(start, end + 1)
  return text.trim()
}

export async function checkFaceCompliance(
  apiKey: string,
  imageDataUrl: string,
): Promise<FaceCompliance> {
  if (!apiKey) throw new Error('未提供火山 API Key')
  if (!imageDataUrl) throw new Error('缺少待检测图片')
  const res = await fetch(ARK_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DOUBAO_VISION_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: imageDataUrl } },
            { type: 'text', text: COMPLIANCE_PROMPT },
          ],
        },
      ],
    }),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`火山视觉调用失败 ${res.status}: ${t.slice(0, 240)}`)
  }
  const json: { choices?: { message?: { content?: string } }[] } = await res.json()
  const content = json?.choices?.[0]?.message?.content ?? ''
  try {
    const parsed = JSON.parse(extractJson(content)) as Partial<FaceCompliance>
    return {
      clear: Boolean(parsed.clear),
      occlusion: Boolean(parsed.occlusion),
      watermark: Boolean(parsed.watermark),
      faceCount: Number(parsed.faceCount ?? 0),
      compliant: Boolean(parsed.compliant),
      reasons: Array.isArray(parsed.reasons) ? parsed.reasons : [],
      regions: Array.isArray(parsed.regions)
        ? parsed.regions.filter((r): r is { x: number; y: number; width: number; height: number } => Boolean(r && typeof r.x === 'number' && typeof r.y === 'number' && typeof r.width === 'number' && typeof r.height === 'number'))
        : [],
      raw: content,
    }
  } catch {
    // 模型未严格返回 JSON：保守返回"待人工确认"，并附原始结论
    return {
      clear: false,
      occlusion: false,
      watermark: false,
      faceCount: 0,
      compliant: false,
      reasons: ['模型未返回结构化判定，请人工确认'],
      regions: [],
      raw: content,
    }
  }
}
