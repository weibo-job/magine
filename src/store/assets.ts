export type AssetKind = 'prompt' | 'text' | 'image' | 'video' | 'audio' | 'node'

export interface SavedAsset {
  id: string
  name: string
  kind: AssetKind
  content: string
  tags?: string[]
  sourceNodeId?: string
  sourceNodeType?: string
  model?: string
  ratio?: string
  prompt?: string
  createdAt: string
}

const ASSET_KEY = 'magine.assets.v1'

export function loadAssets(): SavedAsset[] {
  try {
    const raw = localStorage.getItem(ASSET_KEY)
    const value = raw ? JSON.parse(raw) : []
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

export function saveAsset(asset: Omit<SavedAsset, 'id' | 'createdAt'>): SavedAsset {
  const next: SavedAsset = { ...asset, id: `asset-${Date.now()}`, createdAt: new Date().toISOString() }
  localStorage.setItem(ASSET_KEY, JSON.stringify([next, ...loadAssets()].slice(0, 100)))
  return next
}

export function saveAssetIfNew(asset: Omit<SavedAsset, 'id' | 'createdAt'>): SavedAsset {
  const existing = loadAssets().find((item) => item.kind === asset.kind && item.content === asset.content)
  return existing ?? saveAsset(asset)
}

export function savePromptPreset(name: string, content: string, sourceNodeId?: string): SavedAsset {
  return saveAsset({ name, kind: 'prompt', content, sourceNodeId })
}

export function removeAsset(id: string): void {
  localStorage.setItem(ASSET_KEY, JSON.stringify(loadAssets().filter((a) => a.id !== id)))
}

export function updateAsset(id: string, patch: Partial<Pick<SavedAsset, 'name' | 'tags'>>): void {
  localStorage.setItem(ASSET_KEY, JSON.stringify(loadAssets().map((asset) => asset.id === id ? { ...asset, ...patch } : asset)))
}
