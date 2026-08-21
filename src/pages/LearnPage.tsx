import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { animateEntrance, bindCardLift } from '../motion/gsapMotion'

type Lesson = {
  id: string
  category: string
  title: string
  desc: string
  steps: string[]
}

const LESSONS: Lesson[] = [
  { id: 'start', category: '入门', title: '5 分钟开始创作', desc: '从一句灵感开始，认识画布、节点和结果资产。', steps: ['进入自由画布并添加提示词节点', '连接 LLM、图片或视频节点', '运行节点并在资产页查看结果'] },
  { id: 'canvas', category: '画布', title: '自由画布基础操作', desc: '掌握连线、框选、复制、删除、撤销和保存工程。', steps: ['拖动节点建立输入与输出关系', '用框选分组整理复杂工作流', '使用 ⌘/Ctrl+S 保存 .magine 工程'] },
  { id: 'agent', category: 'Agent', title: '用 DeepSeek 搭建工作流', desc: '用自然语言描述目标，让 Agent 自动规划节点和连线。', steps: ['在设置中配置 DeepSeek Key', '输入“生成一个……”的工作流描述', '运行、取消或重试 Agent 任务'] },
  { id: 'asset', category: '资产', title: '管理提示词与生成结果', desc: '把常用提示词、文本和媒体集中管理，随时放回画布。', steps: ['在节点右上角保存资产', '提示词会自动进入预设提示词', '在资产页搜索、打标签、导出或放回画布'] },
  { id: 'shortcut', category: '效率', title: '常用快捷键', desc: '用键盘快速整理画布，减少反复点击。', steps: ['⌘/Ctrl+Z：撤销', '⌘/Ctrl+Shift+Z：恢复', '⌘/Ctrl+D：复制选中；Delete：删除选中'] },
]

const CATEGORIES = ['全部', ...new Set(LESSONS.map((lesson) => lesson.category))]

export default function LearnPage() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('全部')
  const [selected, setSelected] = useState<Lesson | null>(null)
  const pageRef = useRef<HTMLElement>(null)
  const [completed, setCompleted] = useState<string[]>([])
  useEffect(() => {
    try {
      const value = JSON.parse(localStorage.getItem('magine.learn.completed.v1') || '[]')
      if (Array.isArray(value)) setCompleted(value.filter((id): id is string => typeof id === 'string'))
    } catch { /* ignore malformed local progress */ }
  }, [])
  const markComplete = (id: string) => {
    setCompleted((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
      localStorage.setItem('magine.learn.completed.v1', JSON.stringify(next))
      return next
    })
  }
  const visible = useMemo(() => LESSONS.filter((lesson) => {
    const text = `${lesson.title} ${lesson.desc} ${lesson.category}`.toLowerCase()
    return (category === '全部' || lesson.category === category) && (!query.trim() || text.includes(query.trim().toLowerCase()))
  }), [category, query])

  useLayoutEffect(() => {
    const stopEntrance = animateEntrance(pageRef.current, '[data-motion-card]')
    const stopLift = bindCardLift(pageRef.current)
    return () => { stopEntrance(); stopLift() }
  }, [category, query])

  return (
    <main ref={pageRef} className="learn-page">
      <section className="learn-hero">
        <div>
          <span className="learn-eyebrow">MAGINE CANVAS GUIDE</span>
          <h1>学习中心</h1>
          <p>从灵感到成片，快速掌握 Magine Canvas 的创作方法。</p>
          <span className="learn-progress">已完成 {completed.length} / {LESSONS.length} 个教程</span>
        </div>
        <label className="learn-search">
          <span>搜索教程</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索 / 命令…" />
        </label>
      </section>
      <div className="learn-categories">
        {CATEGORIES.map((item) => <button key={item} type="button" className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>{item}</button>)}
      </div>
      <section className="learn-grid">
        {visible.map((lesson) => (
          <button key={lesson.id} type="button" data-motion-card className={`learn-card${completed.includes(lesson.id) ? ' complete' : ''}`} onClick={() => setSelected(lesson)}>
            <span className="learn-card-category">{lesson.category}{completed.includes(lesson.id) && ' · 已完成'}</span>
            <h2>{lesson.title}</h2>
            <p>{lesson.desc}</p>
            <span className="learn-card-link">查看教程 →</span>
          </button>
        ))}
        {visible.length === 0 && <div className="learn-empty">没有找到匹配的教程</div>}
      </section>
      {selected && (
        <div className="learn-modal" role="dialog" aria-modal="true" onClick={() => setSelected(null)}>
          <article className="learn-modal-card" onClick={(e) => e.stopPropagation()}>
            <span className="learn-card-category">{selected.category}</span>
            <h2>{selected.title}</h2>
            <p>{selected.desc}</p>
            <ol>{selected.steps.map((step) => <li key={step}>{step}</li>)}</ol>
            <div className="learn-modal-actions">
              <button type="button" className="ghost-btn" onClick={() => markComplete(selected.id)}>
                {completed.includes(selected.id) ? '取消完成' : '标记完成'}
              </button>
              <button type="button" className="primary-btn" onClick={() => setSelected(null)}>知道了</button>
            </div>
          </article>
        </div>
      )}
    </main>
  )
}
