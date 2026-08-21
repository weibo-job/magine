import { useEffect, useMemo, useRef, useState } from 'react'
import { deepseekChat, deepseekChatStream } from '../gateway/deepseek'
import { analyzeReferenceImage } from '../gateway/vision'
import { getKey } from '../settings/vaultStore'
import { buildRoundtablePrompt, classifyDeliverable, extractDisputeSignal, ROUNDTABLE_MODES, ROUNDTABLE_ROLES, type DisputeSignal, type RoundtableArtifact, type RoundtableMode, type RoundtableTurn } from '../roundtable/domain'
import { deleteRoundtableArtifact, loadRoundtableArtifacts, saveRoundtableArtifact } from '../roundtable/store'

interface Props { onSendToCanvas: (artifact: RoundtableArtifact) => void; onOpenSolution: (artifact: RoundtableArtifact) => void; initialArtifact?: RoundtableArtifact | null }
interface ReferenceAsset { id: string; name: string; type: string; dataUrl: string }
const DRAFT_KEY = 'magine.roundtable.draft'
interface RoundtableDraft { mode: RoundtableMode; question: string; roles: string[]; turns: RoundtableTurn[]; demoHtml: string; demoFeedback: string; referenceNote: string; referenceAnalysis: string; sessionStarted: boolean; settled: boolean }

function loadDraft(): RoundtableDraft | null {
  try {
    const raw = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null')
    return raw && typeof raw.question === 'string' && Array.isArray(raw.turns) ? raw as RoundtableDraft : null
  } catch { return null }
}

export default function RoundtablePage({ onSendToCanvas, onOpenSolution, initialArtifact }: Props) {
  const draft = loadDraft()
  const [mode, setMode] = useState<RoundtableMode>(draft?.mode ?? 'qa')
  const [question, setQuestion] = useState(draft?.question ?? '')
  const [roles, setRoles] = useState<string[]>(draft?.roles ?? ['主持人', '产品经理', '反方审查员'])
  const [customRoles, setCustomRoles] = useState<string[]>(() => { try { const v = JSON.parse(localStorage.getItem('magine.roundtable.custom-roles') || '[]'); return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [] } catch { return [] } })
  const [roleInput, setRoleInput] = useState('')
  const [turns, setTurns] = useState<RoundtableTurn[]>(draft?.turns ?? [])
  const [streamText, setStreamText] = useState('')
  const [disputeSignal, setDisputeSignal] = useState<DisputeSignal>(() => extractDisputeSignal(''))
  const [myThought, setMyThought] = useState('')
  const [referenceNote, setReferenceNote] = useState(draft?.referenceNote ?? '')
  const [referenceAnalysis, setReferenceAnalysis] = useState(draft?.referenceAnalysis ?? '')
  const [analyzingReferences, setAnalyzingReferences] = useState(false)
  const [showEvidence, setShowEvidence] = useState(false)
  const [evidenceSource, setEvidenceSource] = useState('')
  const [evidenceResult, setEvidenceResult] = useState('')
  const [evidenceBusy, setEvidenceBusy] = useState(false)
  const [references, setReferences] = useState<ReferenceAsset[]>([])
  const [showIntervene, setShowIntervene] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [sessionStarted, setSessionStarted] = useState(draft?.sessionStarted ?? false)
  const [settled, setSettled] = useState(draft?.settled ?? false)
  const [demoHtml, setDemoHtml] = useState(initialArtifact?.demoHtml || draft?.demoHtml || '')
  const [demoFeedback, setDemoFeedback] = useState(initialArtifact?.demoFeedback || draft?.demoFeedback || '')
  const [error, setError] = useState('')
  const [history, setHistory] = useState(loadRoundtableArtifacts)
  const controllerRef = useRef<AbortController | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!initialArtifact) return
    setQuestion(initialArtifact.question)
    setMode(initialArtifact.mode)
    setRoles(initialArtifact.roles)
    setTurns(initialArtifact.turns ?? [{ id: `legacy-${initialArtifact.id}`, round: 1, speaker: '历史圆桌', role: 'roundtable', content: initialArtifact.answer }])
    setDemoHtml(initialArtifact.demoHtml || '')
    setDemoFeedback(initialArtifact.demoFeedback || '')
    setMyThought(initialArtifact.demoFeedback ? `基于当前页面 Demo 继续讨论：\n${initialArtifact.demoFeedback}` : '')
    setSessionStarted(true)
    setSettled(false)
    setError('')
  }, [initialArtifact?.id])

  useEffect(() => {
    if (!question.trim() && !turns.length) {
      localStorage.removeItem(DRAFT_KEY)
      return
    }
    const draft: RoundtableDraft = { mode, question, roles, turns, demoHtml, demoFeedback, referenceNote, referenceAnalysis, sessionStarted, settled }
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  }, [mode, question, roles, turns, demoHtml, demoFeedback, referenceNote, referenceAnalysis, sessionStarted, settled])

  const selectedMode = useMemo(() => ROUNDTABLE_MODES.find((item) => item.id === mode)!, [mode])
  const allRoles = [...ROUNDTABLE_ROLES, ...customRoles]

  function toggleRole(role: string) { setRoles((current) => current.includes(role) ? current.filter((item) => item !== role) : [...current, role]) }
  function addCustomRole() {
    const role = roleInput.trim()
    if (!role || customRoles.includes(role) || ROUNDTABLE_ROLES.includes(role)) return
    const next = [...customRoles, role].slice(-12); setCustomRoles(next); setRoles((current) => [...current, role]); setRoleInput(''); localStorage.setItem('magine.roundtable.custom-roles', JSON.stringify(next))
  }
  function chooseMode(next: RoundtableMode) {
    const item = ROUNDTABLE_MODES.find((candidate) => candidate.id === next)
    if (!item || next === mode) return
    if (sessionStarted && !window.confirm('切换模式会结束当前圆桌讨论，是否继续？')) return
    stopRound()
    setSessionStarted(false); setSettled(false); setTurns([]); setStreamText(''); setDisputeSignal(extractDisputeSignal('')); setMyThought(''); setError('')
    setMode(next); setQuestion(item.example)
  }
  function stopRound() { controllerRef.current?.abort(); controllerRef.current = null }

  function addReference(file: File) {
    if (!file.type.startsWith('image/') || file.size > 8 * 1024 * 1024) { setError('参考素材目前只支持 8MB 以内的图片'); return }
    const reader = new FileReader()
    reader.onload = () => setReferences((current) => [...current, { id: `${Date.now()}-${file.name}`, name: file.name, type: file.type, dataUrl: String(reader.result) }])
    reader.readAsDataURL(file)
  }

  async function analyzeReferences(): Promise<string> {
    if (!references.length) return ''
    const key = getKey('deepseek')
    if (!key) throw new Error('请先在“设置”中配置 DeepSeek API Key')
    setAnalyzingReferences(true)
    try {
      const reports: string[] = []
      for (const reference of references) reports.push(`【${reference.name}】\n${await analyzeReferenceImage(key, reference.dataUrl, referenceNote)}`)
      const report = reports.join('\n\n')
      setReferenceAnalysis(report)
      return report
    } finally { setAnalyzingReferences(false) }
  }

  async function runRound(userThought = '') {
    const prompt = question.trim(); if (!prompt || thinking) return
    const key = getKey('deepseek'); if (!key) { setError('请先在“设置”中配置 DeepSeek API Key'); return }
    const userTurn = userThought.trim() ? { id: `user-${Date.now()}`, round: turns.length + 1, speaker: '你', role: 'user' as const, content: userThought.trim() } : null
    const context = userTurn ? [...turns, userTurn] : turns
    let visualContext = referenceAnalysis
    if (references.length && !visualContext) visualContext = await analyzeReferences()
    const materialContext = references.length ? `\n\n参考素材：${references.map((item) => item.name).join('、')}\n用户对素材的说明：${referenceNote || '请参考图片的布局、风格和交互。'}\n视觉分析：${visualContext}` : ''
    const demoContext = demoHtml ? `\n\n当前页面 Demo 已生成，请把它作为本轮讨论对象。\n用户对 Demo 的反馈：${demoFeedback || '请检查 Demo 是否符合方案。'}\nDemo HTML（截取前 12000 字，仅用于理解当前实现）：\n${demoHtml.slice(0, 12000)}` : ''
    const controller = new AbortController(); controllerRef.current = controller; setThinking(true); setSessionStarted(true); setSettled(false); setError(''); setStreamText('')
    if (userTurn) { setTurns(context); setMyThought('') }
    try {
      const result = await deepseekChatStream(key, [{ role: 'user', content: buildRoundtablePrompt(mode, roles, `${prompt}${materialContext}${demoContext}`, context) }], { onText: (delta) => setStreamText((current) => current + delta) }, getKey('deepseek_model') || undefined, controller.signal)
      if (result.text.trim()) {
        setDisputeSignal(extractDisputeSignal(result.text))
        setTurns((current) => [...current, { id: `round-${Date.now()}`, round: current.length + 1, speaker: `圆桌 · 第 ${current.length + 1} 轮`, role: 'roundtable', content: result.text.trim() }])
      }
      setStreamText('')
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError((err as Error).message || '本轮讨论失败')
      setStreamText('')
    } finally { controllerRef.current = null; setThinking(false) }
  }

  async function verifyEvidence() {
    if (!evidenceSource.trim() || evidenceBusy) return
    const key = getKey('deepseek')
    if (!key) { setError('请先在“设置”中配置 DeepSeek API Key'); return }
    setEvidenceBusy(true); setError(''); setEvidenceResult('')
    const transcript = turns.map((turn) => `【${turn.speaker}】\n${turn.content}`).join('\n\n')
    try {
      const result = await deepseekChat(key, [{ role: 'user', content: `你是事实核验助手。只根据用户提供的来源材料核验圆桌中的争议，不要假装访问了链接，也不要补造来源。\n\n原始主题：${question}\n\n圆桌讨论：\n${transcript}\n\n用户提供的来源链接、文档摘录或官方说明：\n${evidenceSource}\n\n请按以下结构输出：\n1. 待核验主张\n2. 证据对应关系\n3. 可信度：高 / 中 / 低，并说明原因\n4. 仍未确认的信息\n5. 对圆桌下一步的建议\n如果材料不足，明确写“证据不足”，不要猜测。` }], getKey('deepseek_model') || undefined)
      setEvidenceResult(result)
    } catch (err) { setError((err as Error).message || '事实核验失败') } finally { setEvidenceBusy(false) }
  }

  function settleSession() {
    if (!question.trim() || !turns.length || thinking) return
    const answer = turns.map((turn) => `【${turn.speaker}】\n${turn.content}`).join('\n\n')
    const artifact: RoundtableArtifact = { id: `${Date.now()}`, title: question.trim().slice(0, 24), question: question.trim(), mode, roles, answer, turns, demoHtml, demoFeedback, demoIteration: initialArtifact?.demoIteration, deliverableType: classifyDeliverable(question, mode), createdAt: new Date().toISOString() }
    saveRoundtableArtifact(artifact); setHistory(loadRoundtableArtifacts()); setSettled(true)
  }
  function sendCurrentToCanvas() {
    if (!question.trim() || !turns.length) return
    const answer = turns.map((turn) => `【${turn.speaker}】\n${turn.content}`).join('\n\n')
    const artifact: RoundtableArtifact = { id: `${Date.now()}`, title: question.trim().slice(0, 24), question: question.trim(), mode, roles, answer, turns, demoHtml, demoFeedback, demoIteration: initialArtifact?.demoIteration, deliverableType: classifyDeliverable(question, mode), createdAt: new Date().toISOString() }
    if (artifact.deliverableType === 'page') onOpenSolution(artifact)
    else onSendToCanvas(artifact)
  }
  function restore(item: RoundtableArtifact) { setQuestion(item.question); setMode(item.mode); setRoles(item.roles); setTurns(item.turns ?? [{ id: `legacy-${item.id}`, round: 1, speaker: '历史圆桌', role: 'roundtable', content: item.answer }]); setDemoHtml(item.demoHtml || ''); setDemoFeedback(item.demoFeedback || ''); setSessionStarted(true); setSettled(true); setError('') }
  function reset() { stopRound(); setSessionStarted(false); setSettled(false); setTurns([]); setStreamText(''); setQuestion(''); setReferences([]); setReferenceNote(''); setReferenceAnalysis(''); setMyThought(''); setDemoHtml(''); setDemoFeedback(''); setDisputeSignal(extractDisputeSignal('')); setError(''); localStorage.removeItem(DRAFT_KEY) }
  function applyDisputeAction(action: string) { setMyThought(action); setShowIntervene(true) }

  return <main className="roundtable-page">
    <section className="roundtable-hero"><div><span className="eyebrow">MAGINE THINKING WORKSPACE</span><h1>圆桌思辨</h1><p>一轮一轮地讨论，你可以随时暂停、补充观点，直到自己确认方案可以落地。</p></div><div className="roundtable-status">DeepSeek · Vision + 可控多轮</div></section>
    <section className="roundtable-grid">
      <div className="roundtable-composer">
        <div className="section-heading"><div><span className="eyebrow">01 / START</span><h2>你想讨论什么？</h2></div><span className="roundtable-mode-label">{selectedMode.label}</span></div>
        <textarea value={question} onChange={(e) => setQuestion(e.target.value)} disabled={sessionStarted} placeholder="输入一个问题、想法、主题，或者描述你想落地的产品……" />
        <div className="mode-list">{ROUNDTABLE_MODES.map((item) => <button key={item.id} className={item.id === mode ? 'selected' : ''} onClick={() => chooseMode(item.id)}><b>{item.label}</b><small>{item.hint}</small><em>{item.id === mode ? '当前模式' : '切换并填入主题'}</em></button>)}</div>
        <div className="roundtable-policy"><span className="policy-dot" />主持人会先处理分歧，只有高风险事项才请求你确认</div>
        <div className="section-heading compact"><div><span className="eyebrow">02 / SEATS</span><h2>选择席位</h2></div><span className="muted">{roles.length} 位角色</span></div>
        <div className="role-list">{allRoles.map((role) => <button key={role} className={roles.includes(role) ? 'selected' : ''} onClick={() => toggleRole(role)} disabled={sessionStarted}>{role}{customRoles.includes(role) && <small>自定义</small>}</button>)}</div>
        <div className="custom-role-form"><input value={roleInput} onChange={(e) => setRoleInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addCustomRole() }} disabled={sessionStarted} placeholder="添加一个席位，例如：品牌顾问" /><button onClick={addCustomRole} disabled={sessionStarted || !roleInput.trim()}>添加席位</button></div>
        {references.length > 0 && <div className="reference-box"><div className="reference-strip">{references.map((item) => <div key={item.id} className="reference-chip"><img src={item.dataUrl} alt="" /><span>{item.name}</span><button onClick={() => { setReferences((current) => current.filter((ref) => ref.id !== item.id)); setReferenceAnalysis('') }}>×</button></div>)}</div><textarea className="reference-note" value={referenceNote} onChange={(e) => setReferenceNote(e.target.value)} placeholder="告诉视觉分析器你特别关注什么，例如：参考这个网站的布局和动效" /><div className="reference-actions"><button className="reference-analyze" onClick={() => { void analyzeReferences() }} disabled={analyzingReferences}>{analyzingReferences ? '正在分析参考图…' : referenceAnalysis ? '重新分析参考图' : '分析参考图'}</button>{referenceAnalysis && <span className="reference-ready">视觉分析已加入圆桌</span>}</div>{referenceAnalysis && <div className="reference-analysis">{referenceAnalysis}</div>}</div>}
        {error && <div className="roundtable-error">{error}</div>}
        {!sessionStarted ? <button className="primary roundtable-start" disabled={!question.trim()} onClick={() => void runRound()}>开始第一轮</button> : <button className="primary roundtable-start" disabled={thinking || !myThought.trim()} onClick={() => void runRound(myThought)}>加入观点并继续一轮</button>}
        {sessionStarted && <button className="roundtable-reset" onClick={reset}>结束本次讨论，重新开始</button>}
      </div>
      <div className="roundtable-result">
        <div className="section-heading"><div><span className="eyebrow">03 / LIVE TABLE</span><h2>实时讨论</h2></div><span className="roundtable-round-label">{turns.length ? `${turns.length} 个发言` : '等待开始'}</span></div>
        <div className="roundtable-transcript" aria-live="polite">
          {!turns.length && !thinking && <div className="roundtable-empty"><span>◌</span><b>圆桌会在这里一轮轮展开</b><p>你可以随时暂停并加入新的想法。</p></div>}
          {turns.map((turn) => <article key={turn.id} className={`roundtable-turn ${turn.role === 'user' ? 'user-turn' : ''}`}><div className="turn-meta"><b>{turn.speaker}</b><span>第 {turn.round} 轮</span></div><div className="turn-content">{turn.content}</div></article>)}
          {thinking && <article className="roundtable-turn live-turn"><div className="turn-meta"><b>圆桌正在发言</b><span className="thinking-dots"><i /> <i /> <i /></span></div><div className="turn-content">{streamText || '正在组织不同席位的观点…'}</div></article>}
        </div>
        {demoHtml && <div className="roundtable-demo-context"><div className="demo-context-head"><div><span className="eyebrow">CURRENT DEMO</span><b>当前页面 Demo</b></div><span>第 {initialArtifact?.demoIteration || 1} 版</span></div><iframe title="当前页面 Demo" sandbox="" srcDoc={demoHtml} /></div>}
        {turns.length > 0 && !thinking && <div className="dispute-panel"><div className="dispute-head"><span className="eyebrow">DISPUTE HANDLER</span><b>{disputeSignal.label}</b></div><p><strong>主持人建议：</strong>{disputeSignal.action}</p><p><strong>暂定推进：</strong>{disputeSignal.assumption}</p><p><strong>确认门槛：</strong>{disputeSignal.confirmation}</p><div className="dispute-actions"><button onClick={() => setShowEvidence(true)}>核验事实</button><button onClick={() => applyDisputeAction('请设计一个最小可行验证：说明验证目标、步骤、输入、成功标准和失败后的回退方案。')}>做最小验证</button><button onClick={() => applyDisputeAction('请生成两个可比较的方案，分别说明适用场景、优缺点和推荐条件。')}>生成双方案</button><button onClick={() => applyDisputeAction('请只提出一个最关键的目标优先级问题，并说明不同答案会如何改变方案。')}>澄清目标</button><button className="dispute-advance" onClick={() => applyDisputeAction('当前先采用一个可逆的暂定方案继续推进，请明确假设、验证方式和回退方式。')}>暂定推进</button></div><div className="dispute-final-actions"><button className="confirm-solution" onClick={settleSession} disabled={settled}>✓ {settled ? '方案已确认' : '确认方案，可以落地'}</button>{settled && <button className="send-canvas" onClick={sendCurrentToCanvas}>{classifyDeliverable(question, mode) === 'page' ? (demoHtml ? '返回 Demo 继续迭代 →' : '生成页面 Demo →') : '发送最终方案到无限画布 →'}</button>}</div></div>}
        {showEvidence && <div className="evidence-panel"><div className="evidence-head"><div><span className="eyebrow">EVIDENCE CHECK</span><b>事实核验</b></div><button onClick={() => setShowEvidence(false)}>×</button></div><p>粘贴官方文档、来源链接和关键摘录。系统只基于你提供的材料判断，不会伪造查证结果。</p><textarea value={evidenceSource} onChange={(e) => setEvidenceSource(e.target.value)} placeholder="例如：官方文档链接 + 相关段落摘录……" /><div className="evidence-actions"><button onClick={() => setShowEvidence(false)}>稍后处理</button><button className="evidence-run" onClick={() => { void verifyEvidence() }} disabled={!evidenceSource.trim() || evidenceBusy}>{evidenceBusy ? '核验中…' : '开始核验'}</button></div>{evidenceResult && <div className="evidence-result">{evidenceResult}<button onClick={() => { setMyThought(`根据事实核验结果继续讨论：\n${evidenceResult}`); setShowEvidence(false); setShowIntervene(true) }}>带回圆桌继续 →</button></div>}</div>}
        {sessionStarted && <><button className={`roundtable-intervene-dot${showIntervene ? ' active' : ''}`} onClick={() => setShowIntervene((v) => !v)} aria-label="加入我的想法">＋</button>{showIntervene && <div className="roundtable-intervene"><div className="intervene-title">加入我的想法</div><textarea value={myThought} onChange={(e) => setMyThought(e.target.value)} placeholder="看到这里有新的观点？输入后发送，下一轮会带上它……" /><div className="intervene-actions"><label className="intervene-upload">添加参考图<input ref={fileRef} type="file" accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; if (file) addReference(file); e.currentTarget.value = '' }} /></label><button className="roundtable-pause" onClick={stopRound} disabled={!thinking}>暂停本轮</button><button className="text-button" onClick={() => { void runRound(myThought); setShowIntervene(false) }} disabled={thinking || !myThought.trim()}>发送并继续 →</button></div></div>}</>}
      </div>
    </section>
    <section className="roundtable-history"><div className="section-heading"><div><span className="eyebrow">04 / HISTORY</span><h2>最近讨论</h2></div>{settled && <button className="text-button" onClick={sendCurrentToCanvas}>发送最终方案到无限画布 →</button>}</div>{history.length ? <div className="history-list">{history.map((item) => <div key={item.id} className="history-card"><button className="history-open" onClick={() => restore(item)}><b>{item.title}</b><small>{ROUNDTABLE_MODES.find((modeItem) => modeItem.id === item.mode)?.label} · {item.turns?.length ?? 1} 轮 · {new Date(item.createdAt).toLocaleString()}</small></button><button className="history-delete" aria-label={`删除历史：${item.title}`} title="删除这条历史" onClick={() => { if (window.confirm('删除这条圆桌历史？')) setHistory(deleteRoundtableArtifact(item.id)) }}>×</button></div>)}</div> : <p className="muted">确认方案后，这里会保留本地讨论历史。</p>}</section>
  </main>
}
