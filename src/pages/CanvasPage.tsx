// S1.4 画布页（S1.5 接入 React Flow）
import type { Node, Edge } from '@xyflow/react'
import Canvas from '../canvas/Canvas'
import type { SavedAsset } from '../store/assets'

export default function CanvasPage({
  initialProject,
  workflowPrompt,
  assetToInsert,
}: {
  initialProject?: { nodes: Node[]; edges: Edge[] }
  workflowPrompt?: string
  assetToInsert?: SavedAsset
}) {
  return (
    <main className="canvas-page">
    <Canvas initialProject={initialProject} workflowPrompt={workflowPrompt} assetToInsert={assetToInsert} />
    </main>
  )
}
