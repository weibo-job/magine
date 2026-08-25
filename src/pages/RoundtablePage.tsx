import { useEffect, useMemo, useRef, useState } from 'react'
import { deepseekChat, deepseekChatStream } from '../gateway/deepseek'
import { analyzeReferenceImage } from '../gateway/vision'
import { getKey } from '../settings/vaultStore'
import { buildRoundtablePrompt, classifyDeliverable, extractDisputeSignal, ROUNDTABLE_MODES, ROUNDTABLE_ROLES, type DisputeSignal, type RoundtableArtifact, type RoundtableMode, type RoundtableTurn } from '../roundtable/domain'
import { deleteRoundtableArtifact, loadRoundtableArtifacts, saveRoundtableArtifact } from '../roundtable/store'

interface Props { onSendToCanvas: (artifact: RoundtableArtifact) => void; onOpenSolution: (artifact: RoundtableArtifact) => void; onOpenSettings: () => void; initialArtifact?: RoundtableArtifact | null; initialQuestion?: { id: number; prompt: string } | null }
interface ReferenceAsset { id: string; name: string; type: string; dataUrl: string }
const DRAFT_KEY = 'magine.roundtable.draft'
interface RoundtableDraft { mode: RoundtableMode; question: string; roles: string[]; turns: RoundtableTurn[]; demoHtml: string; demoFeedback: string; conclusion: string; motionHtml: string; referenceNote: string; referenceAnalysis: string; sessionStarted: boolean; settled: boolean }

function loadDraft(): RoundtableDraft | null {
  try {
    const raw = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null')
    return raw && typeof raw.question === 'string' && Array.isArray(raw.turns) ? raw as RoundtableDraft : null
  } catch { return null }
}

function extractMotionHtml(text: string): string {
  const match = text.match(/【动效原型】\s*```(?:html)?\s*([\s\S]*?)```/i)
  return match?.[1]?.trim() || ''
}

const QUICK_TOPICS = [
  '生成一个网站方案：先明确目标用户，再拆页面结构和最小 Demo。',
  '我有一个产品想法，请帮我判断价值、风险和第一版功能。',
  '分析一个参考页面，讨论如何复刻它的视觉和交互。',
]

export default function RoundtablePage({ onSendToCanvas, onOpenSolution, onOpenSettings, initialArtifact, initialQuestion }: Props) {
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
  const [discussionClosed, setDiscussionClosed] = useState(false)
  const [composerCollapsed, setComposerCollapsed] = useState(draft?.sessionStarted ?? false)
  const [sessionStarted, setSessionStarted] = useState(draft?.sessionStarted ?? false)
  const [settled, setSettled] = useState(Boolean(draft?.settled && draft?.conclusion))
  const [demoHtml, setDemoHtml] = useState(initialArtifact?.demoHtml || draft?.demoHtml || '')
  const [demoFeedback, setDemoFeedback] = useState(initialArtifact?.demoFeedback || draft?.demoFeedback || '')
  const [conclusion, setConclusion] = useState(initialArtifact?.conclusion || draft?.conclusion || '')
  const [motionHtml, setMotionHtml] = useState(initialArtifact?.motionHtml || draft?.motionHtml || '')
  const [motionPreviewKey, setMotionPreviewKey] = useState(0)
  const [conclusionBusy, setConclusionBusy] = useState(false)
  const [demoVisualAnalysis, setDemoVisualAnalysis] = useState('')
  const [demoContextCollapsed, setDemoContextCollapsed] = useState(false)
  const [error, setError] = useState('')
  const [history, setHistory] = useState(loadRoundtableArtifacts)
  const controllerRef = useRef<AbortController | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const demoFrameRef = useRef<HTMLIFrameElement>(null)
  const transcriptRef = useRef<HTMLDivElement>(null)
  const sessionIdRef = useRef(initialArtifact?.id || `draft-${Date.now()}`)

  useEffect(() => {
    if (!initialArtifact) return
    setQuestion(initialArtifact.question)
    setMode(initialArtifact.mode)
    setRoles(initialArtifact.roles)
    setTurns(initialArtifact.turns ?? [{ id: `legacy-${initialArtifact.id}`, round: 1, speaker: '历史圆桌', role: 'roundtable', content: initialArtifact.answer }])
    setDemoHtml(initialArtifact.demoHtml || '')
    setDemoFeedback(initialArtifact.demoFeedback || '')
    setConclusion(initialArtifact.conclusion || '')
    setMotionHtml(initialArtifact.motionHtml || '')
    setMyThought(initialArtifact.demoFeedback ? `基于当前页面 Demo 继续讨论：\n${initialArtifact.demoFeedback}` : '')
    setSessionStarted(true)
    setDiscussionClosed(false)
    setSettled(Boolean(initialArtifact.conclusion))
    setError('')
  }, [initialArtifact?.id])

  useEffect(() => {
    if (!initialQuestion) return
    stopRound()
    setQuestion(initialQuestion.prompt)
    setMode('qa')
    setTurns([])
    setConclusion('')
    setMotionHtml('')
    setDemoHtml('')
    setDemoFeedback('')
    setSessionStarted(false)
    setDiscussionClosed(false)
    setSettled(false)
    setComposerCollapsed(false)
    setError('')
    sessionIdRef.current = `draft-${Date.now()}`
    localStorage.removeItem(DRAFT_KEY)
  }, [initialQuestion?.id])

  useEffect(() => {
    if (!question.trim() && !turns.length) {
      localStorage.removeItem(DRAFT_KEY)
      return
    }
    const draft: RoundtableDraft = { mode, question, roles, turns, demoHtml, demoFeedback, conclusion, motionHtml, referenceNote, referenceAnalysis, sessionStarted, settled }
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  }, [mode, question, roles, turns, demoHtml, demoFeedback, conclusion, motionHtml, referenceNote, referenceAnalysis, sessionStarted, settled])

  useEffect(() => {
    if (sessionStarted) setComposerCollapsed(true)
  }, [sessionStarted])

  const selectedMode = useMemo(() => ROUNDTABLE_MODES.find((item) => item.id === mode)!, [mode])
  const allRoles = [...ROUNDTABLE_ROLES, ...customRoles]
  const hasDeepSeekKey = Boolean(getKey('deepseek'))

  function toggleRole(role: string) { setRoles((current) => current.includes(role) ? current.filter((item) => item !== role) : [...current, role]) }
  function addCustomRole() {
    const role = roleInput.trim()
    if (!role || customRoles.includes(role) || ROUNDTABLE_ROLES.includes(role)) return
    const next = [...customRoles, role].slice(-12); setCustomRoles(next); setRoles((current) => [...current, role]); setRoleInput(''); localStorage.setItem('magine.roundtable.custom-roles', JSON.stringify(next))
  }
  function removeCustomRole(role: string) {
    const next = customRoles.filter((item) => item !== role)
    setCustomRoles(next)
    setRoles((current) => current.filter((item) => item !== role))
    localStorage.setItem('magine.roundtable.custom-roles', JSON.stringify(next))
  }
  function chooseMode(next: RoundtableMode) {
    const item = ROUNDTABLE_MODES.find((candidate) => candidate.id === next)
    if (!item || next === mode) return
    if (sessionStarted && !window.confirm('切换模式会结束当前圆桌讨论，是否继续？')) return
    stopRound()
    setSessionStarted(false); setSettled(false); setTurns([]); setStreamText(''); setConclusion(''); setDisputeSignal(extractDisputeSignal('')); setMyThought(''); setError('')
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

  async function analyzeCurrentDemo(key: string): Promise<string> {
    const frame = demoFrameRef.current
    const api = (window as unknown as { electronAPI?: { invoke?: (channel: string, payload: unknown) => Promise<unknown> } }).electronAPI
    if (!frame || !api?.invoke) return ''
    const rect = frame.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) return ''
    const screenshot = await api.invoke('demo:capture', { x: rect.left, y: rect.top, width: rect.width, height: rect.height })
    if (typeof screenshot !== 'string' || !screenshot.startsWith('data:image/')) return ''
    return analyzeReferenceImage(key, screenshot, '这是当前版本的页面 Demo 截图。请只分析当前 Demo 的实际视觉呈现、布局层级、可读性、交互线索和明显问题，供圆桌专家继续优化。')
  }

  async function runRound(userThought = '') {
    const prompt = question.trim(); if (!prompt || thinking) return
    const key = getKey('deepseek'); if (!key) { setError('请先在“设置”中配置 DeepSeek API Key'); return }
    const userTurn = userThought.trim() ? { id: `user-${Date.now()}`, round: turns.length + 1, speaker: '你', role: 'user' as const, content: userThought.trim() } : null
    const context = userTurn ? [...turns, userTurn] : turns
    let visualContext = referenceAnalysis
    if (references.length && !visualContext) visualContext = await analyzeReferences()
    let demoVisualContext = demoVisualAnalysis
    if (demoHtml && !demoVisualContext) {
      try {
        demoVisualContext = await analyzeCurrentDemo(key)
        if (demoVisualContext) setDemoVisualAnalysis(demoVisualContext)
      } catch (err) {
        setError(`Demo 视觉分析暂不可用，将继续使用代码分析：${(err as Error).message}`)
      }
    }
    const materialContext = references.length ? `\n\n参考素材：${references.map((item) => item.name).join('、')}\n用户对素材的说明：${referenceNote || '请参考图片的布局、风格和交互。'}\n视觉分析：${visualContext}` : ''
    const demoContext = demoHtml ? `\n\n当前页面 Demo 已回传圆桌，并在右侧预览区渲染。请把它作为本轮讨论对象，不要回复“看不到 Demo”。\n用户对 Demo 的反馈：${demoFeedback || '请检查 Demo 是否符合方案。'}\nDemo 视觉分析：${demoVisualContext || '当前运行环境未提供截图，请基于 Demo HTML/CSS 分析，并明确这是代码推断。'}\nDemo HTML（最多读取前 24000 字；如果内容被截断，基于可见部分继续分析）：\n${demoHtml.slice(0, 24000)}` : ''
    const controller = new AbortController(); controllerRef.current = controller; setThinking(true); setDiscussionClosed(false); setSessionStarted(true); setSettled(false); setConclusion(''); setError(''); setStreamText('')
    if (userTurn) { setTurns(context); setMyThought('') }
    try {
      const result = await deepseekChatStream(key, [{ role: 'user', content: buildRoundtablePrompt(mode, roles, `${prompt}${materialContext}${demoContext}`, context) }], { onText: (delta) => setStreamText((current) => current + delta) }, getKey('deepseek_model') || undefined, controller.signal)
      if (result.text.trim()) {
        const nextMotionHtml = extractMotionHtml(result.text)
        if (nextMotionHtml) { setMotionHtml(nextMotionHtml); setMotionPreviewKey((value) => value + 1) }
        setDisputeSignal(extractDisputeSignal(result.text))
        const nextTurn = { id: `round-${Date.now()}`, round: turns.length + 1, speaker: `圆桌 · 第 ${turns.length + 1} 轮`, role: 'roundtable' as const, content: result.text.trim() }
        const nextTurns = [...context, nextTurn]
        setTurns(nextTurns)
        const progressArtifact: RoundtableArtifact = { id: sessionIdRef.current, title: prompt.slice(0, 24), question: prompt, mode, roles, answer: nextTurns.map((turn) => `【${turn.speaker}】\n${turn.content}`).join('\n\n'), conclusion: '', motionHtml: nextMotionHtml || motionHtml, turns: nextTurns, demoHtml, demoFeedback, demoIteration: initialArtifact?.demoIteration, deliverableType: classifyDeliverable(prompt, mode), createdAt: initialArtifact?.createdAt || new Date().toISOString() }
        saveRoundtableArtifact(progressArtifact)
        setHistory(loadRoundtableArtifacts())
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

  async function settleSession() {
    if (!question.trim() || !turns.length || thinking || conclusionBusy) return
    const key = getKey('deepseek')
    if (!key) { setError('请先在“设置”中配置 DeepSeek API Key'); return }
    const answer = turns.map((turn) => `【${turn.speaker}】\n${turn.content}`).join('\n\n')
    setConclusionBusy(true); setError('')
    try {
      const result = await deepseekChat(key, [{ role: 'user', content: `你是圆桌主持人。用户已经明确确认方案可以落地，请根据下面的主题和完整讨论整理最终结论。不要继续发散，不要提出新的问题。输出结构固定为：\n\n【最终判断】一句话说明最终采用什么。\n【落地方案】列出已经确定的结构、功能或执行步骤。\n【关键取舍】说明放弃了什么，以及为什么。\n【下一步】给出最先执行的 3 个动作。\n\n主题：${question.trim()}\n\n完整讨论：\n${answer}` }], getKey('deepseek_model') || undefined)
      const finalConclusion = result.trim() || '本轮讨论已确认，可以按当前方案进入落地。'
      setConclusion(finalConclusion)
      const artifact: RoundtableArtifact = { id: sessionIdRef.current, title: question.trim().slice(0, 24), question: question.trim(), mode, roles, answer, conclusion: finalConclusion, motionHtml, turns, demoHtml, demoFeedback, demoIteration: initialArtifact?.demoIteration, deliverableType: classifyDeliverable(question, mode), createdAt: initialArtifact?.createdAt || new Date().toISOString() }
      saveRoundtableArtifact(artifact); setHistory(loadRoundtableArtifacts()); setSettled(true)
    } catch (err) { setError((err as Error).message || '整理最终结论失败') }
    finally { setConclusionBusy(false) }
  }
  function sendCurrentToCanvas() {
    if (!question.trim() || !turns.length) return
    const answer = turns.map((turn) => `【${turn.speaker}】\n${turn.content}`).join('\n\n')
    const artifact: RoundtableArtifact = { id: sessionIdRef.current, title: question.trim().slice(0, 24), question: question.trim(), mode, roles, answer, conclusion, motionHtml, turns, demoHtml, demoFeedback, demoIteration: initialArtifact?.demoIteration, deliverableType: classifyDeliverable(question, mode), createdAt: initialArtifact?.createdAt || new Date().toISOString() }
    if (artifact.deliverableType === 'page') onOpenSolution(artifact)
    else onSendToCanvas(artifact)
  }
  function restore(item: RoundtableArtifact) { setQuestion(item.question); setMode(item.mode); setRoles(item.roles); setTurns(item.turns ?? [{ id: `legacy-${item.id}`, round: 1, speaker: '历史圆桌', role: 'roundtable', content: item.answer }]); setDemoHtml(item.demoHtml || ''); setDemoFeedback(item.demoFeedback || ''); setConclusion(item.conclusion || ''); setMotionHtml(item.motionHtml || ''); setMotionPreviewKey((value) => value + 1); setDiscussionClosed(false); setSessionStarted(true); setSettled(Boolean(item.conclusion)); setError('') }
  function closeDiscussion() { stopRound(); setThinking(false); setStreamText(''); setShowIntervene(false); setDiscussionClosed(true); setSessionStarted(false); setComposerCollapsed(false) }
  function reset() { stopRound(); setDiscussionClosed(false); setSessionStarted(false); setComposerCollapsed(false); setSettled(false); setTurns([]); setStreamText(''); setQuestion(''); setReferences([]); setReferenceNote(''); setReferenceAnalysis(''); setMyThought(''); setDemoHtml(''); setDemoFeedback(''); setConclusion(''); setMotionHtml(''); setDisputeSignal(extractDisputeSignal('')); setError(''); sessionIdRef.current = `draft-${Date.now()}`; localStorage.removeItem(DRAFT_KEY) }
  function applyDisputeAction(action: string) { setMyThought(action); setShowIntervene(true) }
  function scrollToLatestDiscussion() { transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: 'smooth' }) }

  return <main className="roundtable-page">
    <section className="roundtable-hero"><div><span className="eyebrow">MAGINE THINKING WORKSPACE</span><h1>圆桌思辨</h1><p>一轮一轮地讨论，你可以随时暂停、补充观点，直到自己确认方案可以落地。</p></div><div className="roundtable-status">DeepSeek · Vision + 可控多轮</div></section>
    {!hasDeepSeekKey && <div className="roundtable-setup-hint"><div><b>开始前先配置模型 Key</b><span>圆桌需要 DeepSeek 才能发言；Key 只保存在你的本机。</span></div><button className="text-button" onClick={onOpenSettings}>去设置 →</button></div>}
    <section className={`roundtable-grid${composerCollapsed ? ' composer-hidden' : ''}`}>
      {composerCollapsed && <button className="roundtable-composer-orb" onClick={() => setComposerCollapsed(false)} aria-label="展开圆桌设置" title="展开圆桌设置"><span aria-hidden="true">＋</span></button>}
      {!composerCollapsed && <div className="roundtable-composer">
        <div className="section-heading"><div><span className="eyebrow">01 / START</span><h2>你想讨论什么？</h2></div><span className="roundtable-mode-label">{selectedMode.label}</span></div>
        <button className="roundtable-composer-collapse" onClick={() => setComposerCollapsed(true)} aria-label="缩小圆桌设置" title="缩小圆桌设置">收起</button>
        <textarea value={question} onChange={(e) => setQuestion(e.target.value)} disabled={sessionStarted} placeholder="输入一个问题、想法、主题，或者描述你想落地的产品……" />
        {!sessionStarted && <div className="quick-topic-list"><span>不知道从哪开始？</span>{QUICK_TOPICS.map((topic) => <button key={topic} type="button" onClick={() => setQuestion(topic)}>{topic}</button>)}</div>}
        <div className="mode-list">{ROUNDTABLE_MODES.map((item) => <button key={item.id} className={item.id === mode ? 'selected' : ''} onClick={() => chooseMode(item.id)}><b>{item.label}</b><small>{item.hint}</small><em>{item.id === mode ? '当前模式' : '切换并填入主题'}</em></button>)}</div>
        <div className="roundtable-policy"><span className="policy-dot" />主持人会先处理分歧，只有高风险事项才请求你确认</div>
        <div className="section-heading compact"><div><span className="eyebrow">02 / SEATS</span><h2>选择席位</h2></div><span className="muted">{roles.length} 位角色</span></div>
        <div className="role-list">{allRoles.map((role) => { const custom = customRoles.includes(role); return <button key={role} title={role === '动画导演' ? '生成可播放的简易动效预览，供圆桌一起评审镜头和节奏' : undefined} className={roles.includes(role) ? 'selected' : ''} onClick={() => toggleRole(role)} disabled={sessionStarted}>{role}{custom && <><small>自定义</small><span className="custom-role-remove" role="button" tabIndex={sessionStarted ? -1 : 0} aria-label={`删除专家${role}`} onClick={(event) => { event.stopPropagation(); if (!sessionStarted) removeCustomRole(role) }} onKeyDown={(event) => { if ((event.key === 'Enter' || event.key === ' ') && !sessionStarted) { event.preventDefault(); event.stopPropagation(); removeCustomRole(role) } }}>×</span></>}</button> })}</div>
        {roles.includes('动画导演') && <div className="role-tip">动画导演会输出可播放的简易动效预览，供专家一起评审镜头、节奏和主要动作。</div>}
        <div className="custom-role-form"><input value={roleInput} onChange={(e) => setRoleInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addCustomRole() }} disabled={sessionStarted} placeholder="添加一个席位，例如：品牌顾问" /><button onClick={addCustomRole} disabled={sessionStarted || !roleInput.trim()}>添加席位</button></div>
        {references.length > 0 && <div className="reference-box"><div className="reference-strip">{references.map((item) => <div key={item.id} className="reference-chip"><img src={item.dataUrl} alt="" /><span>{item.name}</span><button onClick={() => { setReferences((current) => current.filter((ref) => ref.id !== item.id)); setReferenceAnalysis('') }}>×</button></div>)}</div><textarea className="reference-note" value={referenceNote} onChange={(e) => setReferenceNote(e.target.value)} placeholder="告诉视觉分析器你特别关注什么，例如：参考这个网站的布局和动效" /><div className="reference-actions"><button className="reference-analyze" onClick={() => { void analyzeReferences() }} disabled={analyzingReferences}>{analyzingReferences ? '正在分析参考图…' : referenceAnalysis ? '重新分析参考图' : '分析参考图'}</button>{referenceAnalysis && <span className="reference-ready">视觉分析已加入圆桌</span>}</div>{referenceAnalysis && <div className="reference-analysis">{referenceAnalysis}</div>}</div>}
        {error && <div className="roundtable-error">{error}</div>}
        {!sessionStarted ? <button className="primary roundtable-start" disabled={!question.trim()} onClick={() => void runRound()}>{turns.length ? '继续讨论' : '开始第一轮'}</button> : <button className="primary roundtable-start" disabled={thinking || !myThought.trim()} onClick={() => void runRound(myThought)}>加入观点并继续一轮</button>}
        {sessionStarted && <button className="roundtable-reset" onClick={reset}>结束本次讨论，重新开始</button>}
      </div>}
      <div className="roundtable-result">
        <div className="section-heading"><div><span className="eyebrow">03 / LIVE TABLE</span><h2>实时讨论</h2>{demoHtml && <span className="roundtable-focus-label">当前讨论对象：页面 Demo · 第 {initialArtifact?.demoIteration || 1} 版</span>}</div><div className="roundtable-result-actions"><span className="roundtable-round-label">{turns.length ? `${turns.length} 个发言` : '等待开始'}</span>{!discussionClosed && (sessionStarted || thinking || turns.length > 0) && <button className="roundtable-close" onClick={closeDiscussion}>关闭讨论</button>}</div></div>
        <div ref={transcriptRef} className="roundtable-transcript" aria-live="polite">
          {!turns.length && !thinking && <div className="roundtable-empty"><span>◌</span><b>圆桌会在这里一轮轮展开</b><p>你可以随时暂停并加入新的想法。</p></div>}
          {turns.map((turn) => <article key={turn.id} className={`roundtable-turn ${turn.role === 'user' ? 'user-turn' : ''}`}><div className="turn-meta"><b>{turn.speaker}</b><span>第 {turn.round} 轮</span></div><div className="turn-content">{turn.content}</div></article>)}
          {thinking && <article className="roundtable-turn live-turn"><div className="turn-meta"><b>圆桌正在发言</b><span className="thinking-dots"><i /> <i /> <i /></span></div><div className="turn-content">{streamText || '正在组织不同席位的观点…'}</div></article>}
        </div>
        {turns.length > 0 && <button className="roundtable-scroll-latest" onClick={scrollToLatestDiscussion} aria-label="跳到最新讨论" title="跳到最新讨论"><span aria-hidden="true">↓</span> 跳到最新讨论</button>}
        {motionHtml && <div className="roundtable-motion-preview"><div className="motion-preview-head"><div><span className="eyebrow">MOTION PROTOTYPE</span><b>动画导演 · 简易动效预览</b></div><button onClick={() => setMotionPreviewKey((value) => value + 1)}>重新播放</button></div><iframe key={motionPreviewKey} title="动画导演动效预览" sandbox="allow-scripts" srcDoc={motionHtml} /></div>}
        {demoHtml && <div className={`roundtable-demo-context${demoContextCollapsed ? ' is-collapsed' : ''}`}><div className="demo-context-head"><div><span className="eyebrow">CURRENT DEMO</span><b>当前页面 Demo</b></div><div className="demo-context-actions"><span>第 {initialArtifact?.demoIteration || 1} 版</span><button onClick={() => setDemoContextCollapsed((value) => !value)} aria-label={demoContextCollapsed ? '展开 Demo 预览' : '最小化 Demo 预览'} title={demoContextCollapsed ? '展开 Demo 预览' : '最小化 Demo 预览'}>{demoContextCollapsed ? '展开' : '−'}</button></div></div>{!demoContextCollapsed && <iframe ref={demoFrameRef} title="当前页面 Demo" sandbox="allow-scripts" srcDoc={demoHtml} />}</div>}
        {turns.length > 0 && !thinking && <div className="dispute-panel"><div className="dispute-head"><span className="eyebrow">DISPUTE HANDLER</span><b>{disputeSignal.label}</b></div><p><strong>主持人建议：</strong>{disputeSignal.action}</p><p><strong>暂定推进：</strong>{disputeSignal.assumption}</p><p><strong>确认门槛：</strong>{disputeSignal.confirmation}</p><div className="dispute-actions"><button onClick={() => setShowEvidence(true)}>核验事实</button><button onClick={() => applyDisputeAction('请设计一个最小可行验证：说明验证目标、步骤、输入、成功标准和失败后的回退方案。')}>做最小验证</button><button onClick={() => applyDisputeAction('请生成两个可比较的方案，分别说明适用场景、优缺点和推荐条件。')}>生成双方案</button><button onClick={() => applyDisputeAction('请只提出一个最关键的目标优先级问题，并说明不同答案会如何改变方案。')}>澄清目标</button><button className="dispute-advance" onClick={() => applyDisputeAction('当前先采用一个可逆的暂定方案继续推进，请明确假设、验证方式和回退方式。')}>暂定推进</button></div>{settled && conclusion && <div className="roundtable-conclusion"><div className="conclusion-title"><span className="eyebrow">FINAL CONCLUSION</span><b>圆桌结论</b></div><div>{conclusion}</div></div>}<div className="dispute-final-actions"><button className="confirm-solution" onClick={() => { void settleSession() }} disabled={settled || conclusionBusy}>✓ {conclusionBusy ? '正在整理结论…' : settled ? '方案已确认' : '确认方案，可以落地'}</button>{settled && <button className="send-canvas" onClick={sendCurrentToCanvas}>{classifyDeliverable(question, mode) === 'page' ? (demoHtml ? '返回 Demo 继续迭代 →' : '生成页面 Demo →') : '发送最终方案到无限画布 →'}</button>}</div></div>}
        {showEvidence && <div className="evidence-panel"><div className="evidence-head"><div><span className="eyebrow">EVIDENCE CHECK</span><b>事实核验</b></div><button onClick={() => setShowEvidence(false)}>×</button></div><p>粘贴官方文档、来源链接和关键摘录。系统只基于你提供的材料判断，不会伪造查证结果。</p><textarea value={evidenceSource} onChange={(e) => setEvidenceSource(e.target.value)} placeholder="例如：官方文档链接 + 相关段落摘录……" /><div className="evidence-actions"><button onClick={() => setShowEvidence(false)}>稍后处理</button><button className="evidence-run" onClick={() => { void verifyEvidence() }} disabled={!evidenceSource.trim() || evidenceBusy}>{evidenceBusy ? '核验中…' : '开始核验'}</button></div>{evidenceResult && <div className="evidence-result">{evidenceResult}<button onClick={() => { setMyThought(`根据事实核验结果继续讨论：\n${evidenceResult}`); setShowEvidence(false); setShowIntervene(true) }}>带回圆桌继续 →</button></div>}</div>}
        {sessionStarted && <><button className={`roundtable-intervene-dot${showIntervene ? ' active' : ''}`} onClick={() => setShowIntervene((v) => !v)} aria-label="加入我的想法">＋</button>{showIntervene && <div className="roundtable-intervene"><div className="intervene-title">加入我的想法</div><textarea value={myThought} onChange={(e) => setMyThought(e.target.value)} placeholder="看到这里有新的观点？输入后发送，下一轮会带上它……" /><div className="intervene-actions"><label className="intervene-upload">添加参考图<input ref={fileRef} type="file" accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; if (file) addReference(file); e.currentTarget.value = '' }} /></label><button className="roundtable-pause" onClick={stopRound} disabled={!thinking}>暂停本轮</button><button className="text-button" onClick={() => { void runRound(myThought); setShowIntervene(false) }} disabled={thinking || !myThought.trim()}>发送并继续 →</button></div></div>}</>}
      </div>
    </section>
    <section className="roundtable-history"><div className="section-heading"><div><span className="eyebrow">04 / HISTORY</span><h2>最近讨论</h2></div>{settled && <button className="text-button" onClick={sendCurrentToCanvas}>发送最终方案到无限画布 →</button>}</div>{history.length ? <div className="history-list">{history.map((item) => <div key={item.id} className="history-card"><button className="history-open" onClick={() => restore(item)}><b>{item.title}</b><small>{ROUNDTABLE_MODES.find((modeItem) => modeItem.id === item.mode)?.label} · {item.turns?.length ?? 1} 轮 · {new Date(item.createdAt).toLocaleString()}</small></button><button className="history-delete" aria-label={`删除历史：${item.title}`} title="删除这条历史" onClick={() => { if (window.confirm('删除这条圆桌历史？')) setHistory(deleteRoundtableArtifact(item.id)) }}>×</button></div>)}</div> : <p className="muted">确认方案后，这里会保留本地讨论历史。</p>}</section>
  </main>
}
