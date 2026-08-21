// S1.4 应用外壳：侧栏 + 顶栏 + 内容区（欢迎页 / 画布页 / 设置页切换）
import { useEffect, useState } from 'react'
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
    setSolutionArtifact(artifact)
    setActiveKey('solution')
  }

  function handleContinueDiscussion(artifact: RoundtableArtifact) {
    setRoundtableArtifact(artifact)
    setActiveKey('roundtable')
  }

  function handleBackFromSolution(artifact: RoundtableArtifact) {
    setSolutionArtifact(artifact)
    setRoundtableArtifact(artifact)
    setActiveKey('roundtable')
  }

  function renderContent() {
    switch (activeKey) {
      case 'settings':
        return <ConfigCenter />
      case 'free':
        return (
          <CanvasPage
            key={`${projectPath || 'new'}-${pendingWorkflow?.id ?? 'idle'}-${pendingAsset?.id ?? 'none'}`}
            initialProject={initialProject ?? undefined}
            workflowPrompt={pendingWorkflow?.prompt}
            assetToInsert={pendingAsset?.asset}
          />
        )
      case 'create':
        return <Welcome onNew={handleNew} onOpen={handleOpen} recent={recent} />
      case 'drama':
        return <AgentWorkbenchPage kind="drama" onBuildWorkflow={handleBuildWorkflow} />
      case 'market':
        return <AgentWorkbenchPage kind="market" onBuildWorkflow={handleBuildWorkflow} />
      case 'assets':
        return <AssetPage onInsert={handleInsertAsset} />
      case 'learn':
        return <LearnPage />
      case 'roundtable':
        return <RoundtablePage initialArtifact={roundtableArtifact} onSendToCanvas={handleSendRoundtableToCanvas} onOpenSolution={handleOpenSolution} />
      case 'solution':
        return solutionArtifact ? <SolutionWorkbenchPage artifact={solutionArtifact} onBack={handleBackFromSolution} onContinueDiscussion={handleContinueDiscussion} /> : <RoundtablePage initialArtifact={roundtableArtifact} onSendToCanvas={handleSendRoundtableToCanvas} onOpenSolution={handleOpenSolution} />
      default:
        return <Welcome onNew={handleNew} onOpen={handleOpen} recent={recent} />
    }
  }

  return (
    <div className="app-shell">
      <Sidebar active={activeKey} onSelect={setActiveKey} />
      <div className="main-col">
        <TopBar title={TITLES[activeKey] ?? 'Magine'} />
        {renderContent()}
      </div>
    </div>
  )
}
