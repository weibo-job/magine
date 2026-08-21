// 参考图视觉分析：只负责把图片转成设计观察，圆桌文字讨论仍由 DeepSeek 完成。
// 该实验模型需账号已开通；若未开通，接口会返回明确的模型权限错误。
const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/chat/completions'
export const ROUND_TABLE_VISION_MODEL = 'deepseek-v4-flash-vision-exp'

export async function analyzeReferenceImage(apiKey: string, imageDataUrl: string, userNote = ''): Promise<string> {
  if (!apiKey) throw new Error('未提供 DeepSeek API Key')
  const prompt = `你是产品视觉分析师。请分析这张参考图，用于帮助一个圆桌团队落地类似的网站或小程序页面。请具体描述：\n1. 页面整体结构与信息层级\n2. 主要组件和布局关系\n3. 颜色、字体、圆角、边框、阴影、留白\n4. 可能的交互状态与动效线索\n5. 可复用的设计规范\n6. 如果要用 React 实现，建议拆成哪些组件\n不要臆测图片中看不清的内容；看不清就明确标注。用户补充说明：${userNote || '请重点关注页面设计、组件和交互。'}`
  const res = await fetch(DEEPSEEK_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: ROUND_TABLE_VISION_MODEL,
      messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: imageDataUrl } }, { type: 'text', text: prompt }] }],
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`DeepSeek 视觉分析失败 ${res.status}: ${text.slice(0, 240)}`)
  }
  const json: { choices?: { message?: { content?: string } }[] } = await res.json()
  return json.choices?.[0]?.message?.content?.trim() || '视觉模型没有返回分析内容'
}
