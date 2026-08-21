import { useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { animateEntrance } from '../motion/gsapMotion'

type WorkbenchKind = 'drama' | 'market'

interface Props {
  kind: WorkbenchKind
  onBuildWorkflow: (instruction: string) => void
}

const COPY = {
  drama: {
    title: '短剧 Agent',
    desc: '把一个故事想法变成剧本、分镜和可继续生成的画布工作流。',
    deliverables: ['故事梗概与主题', '角色设定与人物关系', '分镜/镜头清单', '首帧图提示词', '视频生成链路'],
    fields: [
      ['主题', '例如：一个外卖员意外拯救了未来城市', 'theme'],
      ['主角与人物', '例如：普通外卖员、冷面女工程师', 'characters'],
      ['风格', '例如：都市悬疑、节奏快、反转结尾', 'style'],
      ['时长', '例如：60 秒，8 个镜头', 'duration'],
    ],
    submit: '生成短剧工作流',
  },
  market: {
    title: '营销 Agent',
    desc: '把商品信息变成卖点、标题、详情文案和可继续生产素材的画布工作流。',
    deliverables: ['商品核心卖点', '平台标题与短文案', '详情页结构', '商品配图提示词', '营销视频脚本'],
    fields: [
      ['商品信息', '例如：便携榨汁杯，450ml，USB-C 充电', 'product'],
      ['目标市场', '例如：马来西亚 Shopee，年轻上班族', 'audience'],
      ['发布平台', '例如：Shopee 商品页 + TikTok 短视频', 'channel'],
      ['语气与卖点', '例如：实用、轻松，突出便携和易清洗', 'tone'],
    ],
    submit: '生成营销工作流',
  },
} as const

const TEMPLATES = {
  drama: [
    { title: '60 秒反转短剧', desc: '主题 → 剧本 → 分镜 → 首帧 → 视频', prompt: '请搭建一个 60 秒反转短剧工作流：先生成故事梗概和角色设定，再生成 8 个镜头的分镜描述，为关键镜头生成首帧图，最后连接视频节点。整体节奏快，结尾有反转。' },
    { title: '情绪独白短剧', desc: '人物独白 → 氛围画面 → 口播视频', prompt: '请搭建一个情绪独白短剧工作流：生成第一人称独白文案、分镜画面描述、适合竖屏的首帧图和视频节点，整体风格克制、电影感、适合 60 秒短视频。' },
  ],
  market: [
    { title: '商品短视频', desc: '卖点 → 脚本 → 商品图 → 视频', prompt: '请搭建一个商品短视频工作流：提炼 3 个核心卖点，生成 30 秒短视频脚本和分镜，为商品生成竖屏展示图，最后连接视频节点，突出使用场景和购买理由。' },
    { title: '商品详情页', desc: '信息 → 标题 → 卖点 → 配图', prompt: '请搭建一个电商商品详情页工作流：生成商品标题、5 条核心卖点、详情页文案和 3 张商品配图提示词，图像风格统一、信息清晰、适合移动端浏览。' },
  ],
} as const

export default function AgentWorkbenchPage({ kind, onBuildWorkflow }: Props) {
  const copy = COPY[kind]
  const [values, setValues] = useState<Record<string, string>>({})
  const pageRef = useRef<HTMLElement>(null)

  useLayoutEffect(() => animateEntrance(pageRef.current, '[data-motion-item]'), [kind])

  function submit(e: FormEvent) {
    e.preventDefault()
    const brief = copy.fields
      .map(([label, , key]) => `${label}：${(values[key] || '').trim() || '未填写'}`)
      .join('\n')
    const deliverables = copy.deliverables.join('、')
    onBuildWorkflow(
      `你正在执行${copy.title}任务。请根据以下需求，在当前画布搭建可执行工作流。最终必须交付：${deliverables}。先创建必要的提示词、${kind === 'drama' ? '大模型、分镜、图像和视频' : '大模型、提示词、图像和视频'}节点，合理连线并自动布局；每个文本节点写入完整内容，并在节点名称或文本开头明确对应交付项。\n${brief}`,
    )
  }

  return (
    <main ref={pageRef} className="agent-workbench">
      <section data-motion-item className="agent-workbench-head">
        <div className={`agent-workbench-icon ${kind}`}>{kind === 'drama' ? '🎬' : '📣'}</div>
        <div>
          <h1>{copy.title}</h1>
          <p>{copy.desc}</p>
        </div>
      </section>
      <form data-motion-item className="agent-brief-card" onSubmit={submit}>
        {copy.fields.map(([label, placeholder, key]) => (
          <label className="agent-field" key={key}>
            <span>{label}</span>
            <textarea
              rows={2}
              placeholder={placeholder}
              value={values[key] || ''}
              onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
            />
          </label>
        ))}
        <div className="agent-workbench-foot">
          <span>提交后会进入自由画布，由 Agent 自动搭建节点和连线。</span>
          <button className="primary-btn" type="submit">{copy.submit} →</button>
        </div>
      </form>
      <section className="agent-deliverables" data-motion-item>
        <span>本工作台将交付</span>
        <div>{copy.deliverables.map((item) => <b key={item}>{item}</b>)}</div>
      </section>
      <section className="agent-template-section" data-motion-item>
        <div className="agent-template-head">
          <div>
            <h2>常用模板</h2>
            <p>直接从成熟工作流开始，再按你的需求修改。</p>
          </div>
        </div>
        <div className="agent-template-grid">
          {TEMPLATES[kind].map((template) => (
            <button
              className="agent-template-card"
              type="button"
              key={template.title}
              onClick={() => onBuildWorkflow(template.prompt)}
            >
              <strong>{template.title}</strong>
              <span>{template.desc}</span>
              <em>立即使用 →</em>
            </button>
          ))}
        </div>
      </section>
    </main>
  )
}
