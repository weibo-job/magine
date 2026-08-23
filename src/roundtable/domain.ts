export type RoundtableMode = 'qa' | 'brainstorm' | 'build' | 'verify'
export type DeliverableType = 'page' | 'media' | 'drama' | 'marketing' | 'general'

export interface RoundtableArtifact {
  id: string
  title: string
  question: string
  mode: RoundtableMode
  roles: string[]
  answer: string
  conclusion?: string
  motionHtml?: string
  createdAt: string
  turns?: RoundtableTurn[]
  deliverableType?: DeliverableType
  demoHtml?: string
  demoFeedback?: string
  demoIteration?: number
}

export function classifyDeliverable(question: string, mode: RoundtableMode): DeliverableType {
  const text = question.toLowerCase()
  if (/(网站|网页|页面|小程序|前端|react|组件|ui|交互|动效)/i.test(text)) return 'page'
  if (/(短剧|剧情|分镜|角色对白)/.test(text)) return 'drama'
  if (/(营销|商品|转化|投放|广告)/.test(text)) return 'marketing'
  if (mode === 'build' && /(图|视频|音频|素材|生成)/.test(text)) return 'media'
  return mode === 'build' ? 'general' : 'general'
}

export interface RoundtableTurn {
  id: string
  round: number
  speaker: string
  role: 'user' | 'roundtable'
  content: string
}

export type DisputeType = 'fact' | 'technical' | 'preference' | 'goal' | 'none'
export interface DisputeSignal {
  type: DisputeType
  label: string
  action: string
  assumption: string
  confirmation: string
}

export function extractDisputeSignal(text: string): DisputeSignal {
  const typeMatch = text.match(/【分歧类型】\s*([^\n]+)/)
  const actionMatch = text.match(/【处理动作】\s*([^\n]+)/)
  const assumptionMatch = text.match(/【暂定方案】\s*([\s\S]*?)(?=\n【|$)/)
  const confirmationMatch = text.match(/【需要确认】\s*([\s\S]*?)(?=\n【|$)/)
  const raw = typeMatch?.[1] || ''
  const type: DisputeType = raw.includes('事实') ? 'fact' : raw.includes('技术') ? 'technical' : raw.includes('偏好') ? 'preference' : raw.includes('目标') ? 'goal' : 'none'
  const labels: Record<DisputeType, string> = { fact: '事实分歧', technical: '技术可行性', preference: '用户偏好', goal: '目标优先级', none: '暂未识别分歧' }
  return { type, label: labels[type], action: actionMatch?.[1]?.trim() || '继续澄清并观察是否需要验证', assumption: assumptionMatch?.[1]?.trim() || '暂未形成明确暂定方案', confirmation: confirmationMatch?.[1]?.trim() || '暂不需要用户确认' }
}

export const ROUNDTABLE_MODES: { id: RoundtableMode; label: string; hint: string; example: string }[] = [
  { id: 'qa', label: '答疑', hint: '把疑问讲清楚，补上盲区和注意事项', example: '我想做一个 AI 图片生成工具，为什么需要无限画布？它和普通聊天式 AI 产品的核心区别是什么？' },
  { id: 'brainstorm', label: '头脑风暴', hint: '发散方向，再收敛成值得尝试的方案', example: '围绕“帮助普通人快速制作抖音图文视频”这个主题，头脑风暴 10 个有差异化的产品功能或内容玩法，并筛选出最值得先做的 3 个。' },
  { id: 'build', label: '方案落地', hint: '把主题拆成结构、组件、流程和执行动作', example: '设计一个 AI 短视频创作小程序，从用户输入主题开始，到生成脚本、图片、视频和发布素材，规划页面结构、核心组件、交互流程和关键动效。' },
  { id: 'verify', label: '证据与验证', hint: '遇到分歧时查证、做实验，再继续推进', example: '我们准备做一个 AI 创作工作台，但团队对“先做无限画布还是先做模板工作流”有分歧，请分析分歧类型，设计验证方法，并给出一个可逆的暂定方案。' },
]

export const ROUNDTABLE_ROLES = [
  '主持人',
  '产品经理',
  '用户代表',
  '设计师',
  '交互设计师',
  '前端工程师',
  '反方审查员',
  '动画导演',
]

export function buildRoundtablePrompt(mode: RoundtableMode, roles: string[], question: string, turns: RoundtableTurn[] = []): string {
  const modeLabel = ROUNDTABLE_MODES.find((item) => item.id === mode)?.label ?? '主题梳理'
  const transcript = turns.length ? turns.map((turn) => `[第 ${turn.round} 轮·${turn.speaker}]\n${turn.content}`).join('\n\n') : '（第一轮讨论）'
  const pageOutput = classifyDeliverable(question, mode) === 'page' ? '\n如果这是页面 / 网站 / 小程序方案，最后再补充：\n【页面结构】页面层级和区域\n【组件清单】组件及其作用\n【交互流程】用户操作和状态变化\n【动效方案】进入、加载、成功、失败等动效\n【实现建议】React 组件拆分和技术注意事项' : ''
  const motionOutput = roles.includes('动画导演') ? '\n\n动画导演席位还必须输出一个可运行的简易动效原型。原型只使用自包含 HTML、SVG、CSS 和原生 JavaScript，不引用外部网络资源；它用于让其他专家观看镜头、节奏和主要动作，不是最终视频。请将完整 HTML 放在以下代码围栏中：\n【动效原型】\n```html\n<!-- 完整可运行的 HTML -->\n```\n【动效说明】触发方式、镜头移动、主要动作、时长和可落地为 GSAP 的实现建议' : ''
  return `你是 Magine 的圆桌主持人。用户希望进行「${modeLabel}」。\n\n参与角色：${roles.join('、')}。\n\n用户主题：\n${question}\n\n历史讨论：\n${transcript}\n\n这是企业开会式的协商圆桌，不是每个专家各说一句后由主持人拼接答案。每轮只推进一轮：每位专家必须先阅读并回应上一轮其他专家的意见，明确哪些观点同意、哪些观点保留，并提出具体优化建议。专家不能只重复自己的立场；如果上一轮已经形成方案，要继续检查它的漏洞、成本、用户价值和实现风险。主持人要把争议集中到少数可解决的问题上，并推动专家逐项收敛。\n\n当出现分歧时，先判断类型：事实、技术可行性、用户偏好或目标优先级。分别选择查证证据、设计最小验证、生成两个方案对比，或只追问一个关键目标问题。低风险分歧请基于证据和可逆性给出暂定推进方案。未达到全体同意前，不要假装已经达成共识，也不要直接整理最终方案。\n\n最后必须额外输出以下字段，字段名不要改：\n【专家回应】逐一说明每位专家对上一轮观点的同意、保留和优化建议\n【共识状态】已达成 / 未达成，并说明判断依据\n【仍有保留】列出尚未同意的专家和具体问题；如果没有，写无\n【下一轮优化】如果未达成共识，明确下一轮只解决什么；如果已达成，写可以进入最终确认\n【分歧类型】事实分歧 / 技术可行性 / 用户偏好 / 目标优先级 / 无\n【处理动作】本轮应该采取的核验、实验、对比或澄清动作\n【暂定方案】在没有最终确认前可以先推进的方案、假设和回退方式\n【需要确认】只有不可逆、高成本或高风险事项才写需要用户确认；否则写暂不需要用户确认${pageOutput}${motionOutput}\n\n只有当【共识状态】为“已达成”且用户明确说“确认方案 / 可以落地”时，才整理最终方案。`;
}

export function artifactToCanvasNodes(artifact: RoundtableArtifact) {
  const base = `roundtable-${artifact.id}`
  return {
    nodes: [
      {
        id: `${base}-topic`,
        type: 'card',
        position: { x: 180, y: 180 },
        data: { kind: 'Prompt', label: '圆桌主题', status: 'done', text: artifact.question, result: artifact.question, nodeTypeId: 'prompt' },
      },
      {
        id: `${base}-answer`,
        type: 'card',
        position: { x: 560, y: 180 },
        data: { kind: 'LLM', label: `圆桌结论 · ${artifact.title}`, status: 'done', text: artifact.question, result: artifact.conclusion || artifact.answer, nodeTypeId: 'llm', model: 'deepseek-v4-flash' },
      },
    ],
    edges: [{ id: `${base}-edge`, source: `${base}-topic`, target: `${base}-answer`, type: 'default' }],
  }
}
