import type { Node } from '@xyflow/react'

const LAYER_BY_TYPE: Record<string, number> = {
  prompt: 0,
  agent: 0,
  llm: 1,
  image: 2,
  edit: 2,
  material: 2,
  region: 2,
  panorama: 2,
  topaz: 2,
  face: 2,
  music: 2,
  storyboard: 3,
  video: 4,
}

export function getSuggestedNodePosition(nodes: Node[], nodeTypeId: string) {
  const layer = LAYER_BY_TYPE[nodeTypeId] ?? 1
  const sameLayerCount = nodes.filter((node) => {
    const typeId = String((node.data as { nodeTypeId?: string })?.nodeTypeId ?? '')
    return (LAYER_BY_TYPE[typeId] ?? 1) === layer
  }).length

  return {
    x: 100 + layer * 310,
    y: 90 + sameLayerCount * 250,
  }
}
