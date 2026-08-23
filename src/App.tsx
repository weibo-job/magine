// S1.4 应用外壳：侧栏 + 顶栏 + 内容区（欢迎页 / 画布页 / 设置页切换）
import { useEffect, useState, type ReactNode } from 'react'
import type { Node, Edge } from '@xyflow/react'
import Sidebar from './layout/Sidebar'
import TopBar from './layout/TopBar'
import Welcome from './pages/Welcome'
import CanvasPage from './pages/CanvasPage'
import AgentWorkbenchPage from './pages/AgentWorkbenchPage'
import AssetPage from './pages/AssetPage'
import LearnPage from './pages/LearnPage'
import RoundtablePage from './pages/RoundtablePage'
import SolutionWorkbenchPage from './pages/SolutionWorkbenchPage'
import type { SavedAsset } from './store/assets'
import ConfigCenter from './settings/ConfigCenter'
import { openProjectFile, loadRecent, loadLocal, clearLocal } from './store/project'
import { loadVaultStatic } from './settings/keyVault'
import { setVault } from './settings/vaultStore'
import { artifactToCanvasNodes, type RoundtableArtifact } from './roundtable/domain'
import { saveRoundtableArtifact } from './roundtable/store'

const TITLES: Record<string, string> = {
  create: '创作',
  drama: '短剧 Agent',
  market: '营销 Agent',
  free: '自由画布',
  assets: '资产',
  learn: '学习中心',
  roundtable: '圆桌思辨',
  solution: '方案工作台',
  settings: '设置',
}

export default function App() {
  const [activeKey, setActiveKey] = useState('create')
  const [initialProject, setInitialProject] = useState<{ nodes: Node[]; edges: Edge[] } | null>(null)
  const [projectPath, setProjectPath] = useState<string>('')
  const [recent, setRecent] = useState<string[]>([])
  const [pendingWorkflow, setPendingWorkflow] = useState<{ id: number; prompt: string } | null>(null)
  const [pendingAsset, setPendingAsset] = useState<{ id: number; asset: SavedAsset } | null>(null)
  const [solutionArtifact, setSolutionArtifact] = useState<import('./roundtable/domain').RoundtableArtifact | null>(null)
  const [roundtableArtifact, setRoundtableArtifact] = useState<RoundtableArtifact | null>(null)
  const [roundtableResumeKey, setRoundtableResumeKey] = useState<'roundtable' | 'solution'>('roundtable')
  const [roundtableSeed, setRoundtableSeed] = useState<{ id: number; prompt: string } | null>(null)

  useEffect(() => {
    loadRecent().then(setRecent)
  }, [])

  useEffect(() => {
    const cached = loadLocal()
    if (cached) setInitialProject({ nodes: cached.nodes, edges: cached.edges })
  }, [])

  // S2.4 修复：App 启动即把本地加密 vault 水合进全局 current，
  // 否则用户保存过 Key 但没先开"设置页"时，画布节点 getKey 读不到（current 为 null）。
  useEffect(() => {
    loadVaultStatic()
      .then((d) => setVault(d ?? { keys: {}, customProviders: [] }))
      .catch(() => setVault({ keys: {}, customProviders: [] }))
  }, [])

  async function handleOpen(path?: string) {
    const r = await openProjectFile(path)
    if (!r.ok || !r.project) {
      window.alert(r.error || '打开工程失败')
      return
    }
    setInitialProject({ nodes: r.project.nodes, edges: r.project.edges })
    setProjectPath(r.path || '')
    setActiveKey('free')
    setRecent(await loadRecent())
  }

  function handleNew() {
    clearLocal()
    setInitialProject({ nodes: [], edges: [] })
    setActiveKey('free')
  }

  function handleBuildWorkflow(prompt: string) {
    clearLocal()
    setInitialProject({ nodes: [], edges: [] })
    setProjectPath('')
    setPendingWorkflow({ id: Date.now(), prompt })
    setActiveKey('free')
  }

  function handleInsertAsset(asset: SavedAsset) {
    clearLocal()
    setInitialProject({ nodes: [], edges: [] })
    setProjectPath('')
    setPendingAsset({ id: Date.now(), asset })
    setActiveKey('free')
  }

  function handleSendRoundtableToCanvas(artifact: RoundtableArtifact) {
    const project = artifactToCanvasNodes(artifact)
    setInitialProject(project)
    setProjectPath('')
    setActiveKey('free')
  }

  function handleOpenSolution(artifact: import('./roundtable/domain').RoundtableArtifact) {
    setRoundtableArtifact(artifact)
    saveRoundtableArtifact(artifact)
    setSolutionArtifact(artifact)
    setRoundtableResumeKey('solution')
    setActiveKey('solution')
  }

  function handleContinueDiscussion(artifact: RoundtableArtifact) {
    saveRoundtableArtifact(artifact)
    setRoundtableArtifact(artifact)
    setRoundtableResumeKey('roundtable')
    setActiveKey('roundtable')
  }

  function handleStartRoundtable(prompt: string) {
    if (activeKey === 'roundtable' && !window.confirm('进入示例会替换当前圆桌草稿，是否继续？')) return
    setRoundtableArtifact(null)
    setRoundtableSeed({ id: Date.now(), prompt })
    setActiveKey('roundtable')
  }

  function handleBackFromSolution(artifact: RoundtableArtifact) {
    saveRoundtableArtifact(artifact)
    setSolutionArtifact(artifact)
    setRoundtableArtifact(artifact)
    setRoundtableResumeKey('roundtable')
    setActiveKey('roundtable')
  }

  function handleNavigate(nextKey: string) {
    if (nextKey === 'roundtable' && roundtableResumeKey === 'solution' && solutionArtifact) {
      setActiveKey('solution')
      return
    }
    if (!['roundtable', 'solution'].includes(nextKey) && ['roundtable', 'solution'].includes(activeKey)) {
      setRoundtableResumeKey(activeKey as 'roundtable' | 'solution')
    }
    setActiveKey(nextKey)
  }

  function renderContent() {
    const layer = (key: string, content: ReactNode) => <div key={key} className={`app-page-layer${activeKey === key ? ' is-active' : ''}`}>{content}</div>
    return <div className="app-page-stack">
      {layer('settings', <ConfigCenter />)}
      {layer('free', <CanvasPage key={`${projectPath || 'new'}-${pendingWorkflow?.id ?? 'idle'}-${pendingAsset?.id ?? 'none'}`} initialProject={initialProject ?? undefined} workflowPrompt={pendingWorkflow?.prompt} assetToInsert={pendingAsset?.asset} />)}
      {layer('create', <Welcome onNew={handleNew} onOpen={handleOpen} recent={recent} />)}
      {layer('drama', <AgentWorkbenchPage kind="drama" onBuildWorkflow={handleBuildWorkflow} />)}
      {layer('market', <AgentWorkbenchPage kind="market" onBuildWorkflow={handleBuildWorkflow} />)}
      {layer('assets', <AssetPage onInsert={handleInsertAsset} />)}
      {layer('learn', <LearnPage onStartRoundtable={handleStartRoundtable} />)}
      {layer('roundtable', <RoundtablePage initialArtifact={roundtableArtifact} initialQuestion={roundtableSeed} onOpenSettings={() => setActiveKey('settings')} onSendToCanvas={handleSendRoundtableToCanvas} onOpenSolution={handleOpenSolution} />)}
      {solutionArtifact && layer('solution', <SolutionWorkbenchPage artifact={solutionArtifact} onBack={handleBackFromSolution} onContinueDiscussion={handleContinueDiscussion} />)}
    </div>
  }

  return (
    <div className="app-shell">
      <Sidebar active={activeKey} onSelect={handleNavigate} />
      <div className="main-col">
        <TopBar title={TITLES[activeKey] ?? 'Magine'} />
        {renderContent()}
      </div>
    </div>
  )
}
