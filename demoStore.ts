export interface DemoVersion {
  id: string
  artifactId: string
  title: string
  version: number
  html: string
  feedback: string
  createdAt: string
}

const KEY = 'magine.roundtable.demo-history'

export function loadDemoVersions(artifactId: string): DemoVersion[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(raw) ? raw.filter((item): item is DemoVersion => item?.artifactId === artifactId && typeof item?.html === 'string') : []
  } catch { return [] }
}

export function saveDemoVersion(version: DemoVersion): DemoVersion[] {
  const all = loadAll()
  const next = [version, ...all.filter((item) => item.id !== version.id)].slice(0, 100)
  localStorage.setItem(KEY, JSON.stringify(next))
  return next.filter((item) => item.artifactId === version.artifactId)
}

export function deleteDemoVersion(id: string, artifactId: string): DemoVersion[] {
  const next = loadAll().filter((item) => item.id !== id)
  localStorage.setItem(KEY, JSON.stringify(next))
  return next.filter((item) => item.artifactId === artifactId)
}

function loadAll(): DemoVersion[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(raw) ? raw.filter((item): item is DemoVersion => typeof item?.id === 'string' && typeof item?.artifactId === 'string' && typeof item?.html === 'string') : []
  } catch { return [] }
}
