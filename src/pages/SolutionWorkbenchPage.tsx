import { useState } from 'react'
import { deepseekChat } from '../gateway/deepseek'
import { getKey } from '../settings/vaultStore'
import type { RoundtableArtifact } from '../roundtable/domain'
import { deleteDemoVersion, loadDemoVersions, saveDemoVersion, type DemoVersion } from '../roundtable/demoStore'

interface Props { artifact: RoundtableArtifact; onBack: (artifact: RoundtableArtifact) => void; onContinueDiscussion: (artifact: RoundtableArtifact) => void }
function section(text: string, label: string): string {
  const match = text.match(new RegExp(`【${label}】([\\s\\S]*?)(?=\\n【|$)`))
  return match?.[1]?.trim() || '圆桌尚未产出该部分，可返回继续讨论。'
}

export default function SolutionWorkbenchPage({ artifact, onBack, onContinueDiscussion }: Props) {
  const page = artifact.deliverableType === 'page'
  const [code, setCode] = useState('')
  const [previewHtml, setPreviewHtml] = useState(artifact.demoHtml || '')
  const [previewVersions, setPreviewVersions] = useState<DemoVersion[]>(() => {
    const saved = loadDemoVersions(artifact.id)
    return saved.length ? saved : artifact.demoHtml ? [{ id: `${artifact.id}-legacy`, artifactId: artifact.id, title: artifact.title, version: artifact.demoIteration || 1, html: artifact.demoHtml, feedback: artifact.demoFeedback || '', createdAt: new Date().toISOString() }] : []
  })
  const [activeVersion, setActiveVersion] = useState(artifact.demoIteration || 1)
  const [iterationNote, setIterationNote] = useState(artifact.demoFeedback || '')
  const [generating, setGenerating] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [delivered, setDelivered] = useState(false)
  const [error, setError] = useState('')

  async function generateCode() {
    const key = getKey('deepseek')
    if (!key) { setError('请先在“设置”中配置 DeepSeek API Key'); return }
    setGenerating(true); setError('')
    try {
      const prompt = `你是资深 React 前端工程师。请根据下面的页面方案生成一个可直接复制的单文件 React 组件。要求：使用 React + TypeScript + CSS，组件结构清晰，包含页面布局、主要状态、交互反馈和克制的 CSS 动效；不要调用外部图片或接口，用渐变和占位块替代；只输出代码，不要 markdown 解释。\n\n页面方案：\n${artifact.answer}`
      const result = await deepseekChat(key, [{ role: 'user', content: prompt }], getKey('deepseek_model') || undefined)
      setCode(result.replace(/^```(?:tsx|typescript|jsx|react)?\s*/i, '').replace(/\s*```$/i, '').trim())
    } catch (err) { setError((err as Error).message || '页面代码生成失败') } finally { setGenerating(false) }
  }

  async function copyCode() { if (code) await navigator.clipboard?.writeText(code) }

  async function generatePreview() {
    const key = getKey('deepseek')
    if (!key) { setError('请先在“设置”中配置 DeepSeek API Key'); return }
    setPreviewing(true); setError(''); setDelivered(false)
    try {
      const prompt = `你是资深网页设计师。根据下面的页面方案生成一个可直接放进 iframe srcDoc 的完整 HTML 页面。要求：只输出完整 HTML，不要 markdown 代码围栏；所有 CSS 写在 style 标签内；不要外部图片、脚本、字体或网络资源；用渐变、色块和占位结构表达视觉层级；实现页面主要交互的静态状态和克制的 hover / loading 动效；如果有 loading 开场，必须在 1.5-2.5 秒内自动进入主界面，不能永久停留；页面要有真实产品感，不要只生成线框。\n\n页面方案：\n${artifact.answer}\n\n当前迭代要求：\n${iterationNote || '这是第一次生成，请按方案完成一版可看的页面 Demo。'}`
      const result = await deepseekChat(key, [{ role: 'user', content: prompt }], getKey('deepseek_model') || undefined)
      const html = result.replace(/^```html?\s*/i, '').replace(/\s*```$/i, '').trim()
      const nextVersion = Math.max(0, ...previewVersions.map((item) => item.version)) + 1
      const saved = saveDemoVersion({ id: `${artifact.id}-v${nextVersion}-${Date.now()}`, artifactId: artifact.id, title: artifact.title, version: nextVersion, html, feedback: iterationNote.trim(), createdAt: new Date().toISOString() })
      setPreviewHtml(html); setPreviewVersions(saved); setActiveVersion(nextVersion)
    } catch (err) { setError((err as Error).message || '页面预览生成失败') } finally { setPreviewing(false) }
  }

  function continueDiscussion() {
    if (!previewHtml) return
    onContinueDiscussion(currentArtifact())
  }

  function currentArtifact(): RoundtableArtifact {
    return { ...artifact, demoHtml: previewHtml || artifact.demoHtml, demoFeedback: iterationNote.trim(), demoIteration: Math.max(artifact.demoIteration || 0, activeVersion) }
  }

  function openFullscreen() {
    const frame = document.querySelector<HTMLIFrameElement>('.live-page-preview')
    if (frame?.requestFullscreen) void frame.requestFullscreen()
  }

  function openInBrowser() {
    if (!previewHtml) return
    const blobUrl = URL.createObjectURL(new Blob([previewHtml], { type: 'text/html' }))
    window.open(blobUrl, '_blank', 'noopener,noreferrer')
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
  }

  function markDelivered() {
    if (!previewHtml) return
    setDelivered(true)
    setError('Demo 已确认。现在可以导出 React 代码作为最终交付物。')
  }

  function removeVersion(version: DemoVersion) {
    if (!window.confirm(`删除 Demo 第 ${version.version} 版？`)) return
    const next = deleteDemoVersion(version.id, artifact.id)
    setPreviewVersions(next)
    if (version.version === activeVersion) {
      const fallback = next[next.length - 1]
      setActiveVersion(fallback?.version || 1)
      setPreviewHtml(fallback?.html || '')
      setDelivered(false)
    }
  }

  return <main className="solution-workbench">
    <div className="solution-head"><div><span className="eyebrow">DELIVERABLE WORKSPACE</span><h1>{page ? '页面方案工作台' : '方案工作台'}</h1><p>{artifact.title} · {page ? '先生成 Demo，再持续迭代' : '结构化方案资产'}</p></div><button className="text-button" onClick={() => onBack(currentArtifact())}>← 返回圆桌</button></div>
    <div className="solution-layout">
      <section className="solution-spec"><div className="solution-section"><span className="eyebrow">BRIEF</span><h2>目标与讨论结论</h2><pre>{artifact.conclusion ? `${artifact.conclusion}\n\n${artifact.answer}` : artifact.answer}</pre></div>{page && <><div className="solution-section"><span className="eyebrow">STRUCTURE</span><h2>页面结构</h2><pre>{section(artifact.answer, '页面结构')}</pre></div><div className="solution-section"><span className="eyebrow">COMPONENTS</span><h2>组件清单</h2><pre>{section(artifact.answer, '组件清单')}</pre></div><div className="solution-section"><span className="eyebrow">INTERACTION</span><h2>交互与动效</h2><pre>{section(artifact.answer, '交互流程')}\n\n{section(artifact.answer, '动效方案')}</pre></div></>}</section>
      <section className="solution-preview"><div className="section-heading"><div><span className="eyebrow">PREVIEW</span><h2>{previewHtml ? '实时页面 Demo' : '页面 Demo'}</h2></div><span className="roundtable-status">{delivered ? '已确认交付' : previewHtml ? '可继续迭代' : '等待生成'}</span></div>
        {previewHtml ? <><iframe className="live-page-preview" title={`生成的页面预览第 ${activeVersion} 版`} sandbox="allow-scripts" srcDoc={previewHtml} /><div className="preview-tools"><button onClick={openFullscreen}>全屏预览</button><button onClick={openInBrowser}>在浏览器打开</button></div><div className="preview-versions"><span>历史版本</span>{previewVersions.map((item) => <span className="preview-version-item" key={item.id}><button className={item.version === activeVersion ? 'active' : ''} onClick={() => { setActiveVersion(item.version); setPreviewHtml(item.html); setDelivered(false) }}>V{item.version}</button><button className="preview-version-delete" title={`删除第 ${item.version} 版`} aria-label={`删除 Demo 第 ${item.version} 版`} onClick={() => removeVersion(item)}>×</button></span>)}</div></> : page ? <div className="wireframe-preview"><div className="wireframe-nav"><span /> <span /> <i /></div><div className="wireframe-hero"><b>{artifact.title}</b><span>页面主视觉区域</span><button>主要操作</button></div><div className="wireframe-cards"><div /><div /><div /></div><div className="wireframe-note">点击下方“生成页面 Demo”，先看页面效果，再继续提出修改。</div></div> : <div className="solution-empty">此方案暂不对应页面预览，可发送到对应执行器。</div>}
        {previewHtml && <div className="iteration-box"><textarea value={iterationNote} onChange={(e) => setIterationNote(e.target.value)} placeholder="告诉我哪里需要改，例如：顶部更简洁、按钮更突出、增加生成中的动效……" /><button onClick={() => { void generatePreview() }} disabled={!iterationNote.trim() || previewing}>{previewing ? '迭代中…' : '继续迭代 Demo →'}</button></div>}
        {error && <div className={`solution-error${delivered ? ' solution-delivered' : ''}`}>{error}</div>}
        <div className="solution-actions"><button className="solution-secondary" onClick={() => onBack(currentArtifact())}>返回圆桌</button>{page && <><>{previewHtml && <button className="solution-secondary" onClick={continueDiscussion} disabled={previewing}>带 Demo 回圆桌讨论</button>}</><button className="solution-primary solution-preview-button" onClick={() => { void generatePreview() }} disabled={previewing}>{previewing ? '正在生成页面…' : previewHtml ? '重新生成页面 Demo' : '生成页面 Demo'}</button>{previewHtml && <button className="solution-secondary" onClick={markDelivered}>✓ {delivered ? '已确认交付' : '确认 Demo，准备交付'}</button>}{previewHtml && delivered && <button className="solution-secondary" onClick={() => { void generateCode() }} disabled={generating}>{generating ? '正在整理代码…' : code ? '重新导出 React 代码' : '导出 React 代码'}</button>}</>}</div>
        {code && <div className="code-output"><div className="code-head"><b>React 页面代码（最终交付）</b><button onClick={() => { void copyCode() }}>复制代码</button></div><pre>{code}</pre></div>}
      </section>
    </div>
  </main>
}
