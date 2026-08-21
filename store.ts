import type { RoundtableArtifact } from './domain'

const KEY = 'magine.roundtable.artifacts'

export function loadRoundtableArtifacts(): RoundtableArtifact[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

export function saveRoundtableArtifact(artifact: RoundtableArtifact): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([artifact, ...loadRoundtableArtifacts()].slice(0, 30)))
  } catch {
    // 圆桌历史保存失败不应阻断当前讨论。
  }
}

export function deleteRoundtableArtifact(id: string): RoundtableArtifact[] {
  const next = loadRoundtableArtifacts().filter((item) => item.id !== id)
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* 删除失败不阻断当前页面 */ }
  return next
}
