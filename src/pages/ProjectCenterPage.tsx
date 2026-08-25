import { useEffect, useState } from 'react'
import { loadRoundtableArtifacts } from '../roundtable/store'
import { loadDemoVersions } from '../roundtable/demoStore'
import { loadLocal, type ProjectFile } from '../store/project'
import { ROUNDTABLE_MODES, type RoundtableArtifact } from '../roundtable/domain'

interface ProjectCard {
  id: string
  title: string
  description: string
  status: string
  statusTone: 'active' | 'ready' | 'canvas'
  meta: string
  phases: { label: string; state: 'done' | 'current' | 'todo' }[]
  checklist: string[]
  artifact?: RoundtableArtifact
  kind: 'roundtable' | 'canvas'
}

interface Props {
  active: boolean
  onResumeArtifact: (artifact: RoundtableArtifact) => void
  onOpenCanvas: () => void
  onNewCanvas: () => void
}

const DRAFT_KEY = 'magine.roundtable.draft'

function loadRoundtableDraft(): RoundtableArtifact | null {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null') as Partial<RoundtableArtifact> | null
    if (!draft?.question || !Array.isArray(draft.turns) || !draft.turns.length) return null
    return {
      id: 'draft',
      title: draft.question.slice(0, 28),
      question: draft.question,
      mode: draft.mode || 'qa',
      roles: draft.roles || ['主持人', '产品经理', '反方审查员'],
      answer: draft.turns.map((turn) => turn.content).join('\n\n'),
      conclusion: draft.conclusion,
      motionHtml: draft.motionHtml,
      demoHtml: draft.demoHtml,
      demoFeedback: draft.demoFeedback,
      createdAt: new Date().toISOString(),
      turns: draft.turns,
    }
  } catch {
    return null
  }
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '最近更新'
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date)
}

function roundtableStatus(artifact: RoundtableArtifact): { label: string; tone: ProjectCard['statusTone'] } {
  if (artifact.demoHtml) return { label: 'Demo 迭代中', tone: 'ready' }
  if (artifact.conclusion) return { label: '方案已确认', tone: 'ready' }
  if (artifact.turns?.length) return { label: '讨论进行中', tone: 'active' }
  return { label: '草稿', tone: 'active' }
}

function projectProgress(artifact: RoundtableArtifact): Pick<ProjectCard, 'phases' | 'checklist'> {
  const hasDiscussion = Boolean(artifact.turns?.length)
  const hasPlan = Boolean(artifact.conclusion)
  const hasDemo = Boolean(artifact.demoHtml)
  const phases = [
    { label: '讨论', done: hasDiscussion },
    { label: '方案', done: hasPlan },
    { label: 'Demo', done: hasDemo },
    { label: '交付', done: false },
  ]
  const firstTodo = phases.findIndex((phase) => !phase.done)
  return {
    phases: phases.map((phase, index) => ({ label: phase.label, state: phase.done ? 'done' : index === firstTodo ? 'current' : 'todo' })),
    checklist: [
      hasDiscussion ? '已保留圆桌讨论记录' : '还没有圆桌讨论记录',
      hasPlan ? '已形成方案结论' : '继续讨论后形成方案结论',
      hasDemo ? `已有 Demo 第 ${artifact.demoIteration || 1} 版` : '尚未生成页面 Demo',
      hasDemo ? '可回圆桌继续复盘或进入交付检查' : '完成 Demo 后再进行交付检查',
    ],
  }
}

export default function ProjectCenterPage({ active, onResumeArtifact, onOpenCanvas, onNewCanvas }: Props) {
  const [cards, setCards] = useState<ProjectCard[]>([])

  useEffect(() => {
    if (!active) return
    const artifacts = loadRoundtableArtifacts()
    const draft = loadRoundtableDraft()
    const next = (draft ? [draft, ...artifacts.filter((artifact) => artifact.id !== 'draft')] : artifacts).map((artifact): ProjectCard => {
      const status = roundtableStatus(artifact)
      const progress = projectProgress(artifact)
      const demoCount = Math.max(artifact.demoIteration || 0, loadDemoVersions(artifact.id).length)
      const mode = ROUNDTABLE_MODES.find((item) => item.id === artifact.mode)?.label || '圆桌'
      return {
        id: `roundtable-${artifact.id}`,
        title: artifact.title || artifact.question.slice(0, 28) || '未命名项目',
        description: artifact.question,
        status: status.label,
        statusTone: status.tone,
        meta: `${mode} · ${artifact.turns?.length || 0} 条发言 · ${demoCount ? `Demo ${demoCount} 版` : '暂无 Demo'} · ${formatDate(artifact.createdAt)}`,
        ...progress,
        artifact,
        kind: 'roundtable',
      }
    })

    const local = loadLocal() as ProjectFile | null
    if (local?.nodes?.length) {
      next.push({
        id: 'local-canvas',
        title: '自由画布工程',
        description: '最近保存的画布节点和连线，可以继续编辑或从这里回到画布。',
        status: '画布已保存',
        statusTone: 'canvas',
        meta: `${local.nodes.length} 个节点 · ${local.edges.length} 条连线 · ${formatDate(local.savedAt)}`,
        phases: [
          { label: '画布', state: 'done' },
          { label: '生成', state: 'current' },
          { label: '复盘', state: 'todo' },
          { label: '交付', state: 'todo' },
        ],
        checklist: ['已保存本地画布工程', '可以继续编辑节点和连线', '生成结果后可回项目中心复盘', '确认结果后再导出交付'],
        kind: 'canvas',
      })
    }
    setCards(next)
  }, [active])

  return (
    <main className="project-center">
      <section className="project-center-hero">
        <div>
          <div className="eyebrow">MAGINE PROJECTS</div>
          <h1>项目中心</h1>
          <p>把讨论、方案、Demo、画布和素材放在同一个项目里，随时继续。</p>
        </div>
        <div className="project-center-actions">
          <button className="project-ghost-btn" type="button" onClick={onOpenCanvas}>打开最近画布</button>
          <button className="project-primary-btn" type="button" onClick={onNewCanvas}>新建项目 ＋</button>
        </div>
      </section>

      <section className="project-center-section">
        <div className="project-section-head">
          <div>
            <div className="eyebrow">WORKSPACE</div>
            <h2>继续你的工作</h2>
          </div>
          <span>{cards.length} 个本地项目</span>
        </div>

        {cards.length === 0 ? (
          <div className="project-empty">
            <strong>还没有项目记录</strong>
            <p>从圆桌开始讨论，或新建一个画布。完成后的工作会自动出现在这里。</p>
            <button className="project-primary-btn" type="button" onClick={onNewCanvas}>开始第一个项目</button>
          </div>
        ) : (
          <div className="project-grid">
            {cards.map((card) => (
              <article key={card.id} className="project-card">
                <div className="project-card-topline">
                  <span className={`project-status ${card.statusTone}`}>{card.status}</span>
                  <span className="project-card-kind">{card.kind === 'canvas' ? '画布' : '圆桌项目'}</span>
                </div>
                <h3>{card.title}</h3>
                <p>{card.description}</p>
                <div className="project-progress" aria-label="项目阶段">
                  {card.phases.map((phase, index) => <span key={phase.label} className={`project-phase ${phase.state}`}><i />{phase.label}{index < card.phases.length - 1 && <b />}</span>)}
                </div>
                <div className="project-checklist">
                  <span>交付检查</span>
                  <strong>{card.checklist.find((item) => item.includes('继续') || item.includes('尚未') || item.includes('还没有')) || '当前阶段已具备'}</strong>
                </div>
                <small>{card.meta}</small>
                <button
                  className="project-card-continue"
                  type="button"
                  onClick={() => card.kind === 'canvas' ? onOpenCanvas() : onResumeArtifact(card.artifact!)}
                >
                  继续项目 <span>→</span>
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
