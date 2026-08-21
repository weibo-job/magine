// S1.10 工程文件序列化与本地持久化（纯本地，依据 D3 无云端）
// 桌面端优先走 Electron dialog + fs（通过 preload 暴露的 magineProject）；
// 纯 Web / 沙箱环境降级到 localStorage。
import type { Node, Edge } from '@xyflow/react'

export interface ProjectFile {
  version: number
  nodes: Node[]
  edges: Edge[]
  savedAt: string
}

export interface ProjectOpenResult {
  ok: boolean
  error: string
  project: ProjectFile | null
  path: string
}

export interface ProjectSaveResult {
  ok: boolean
  error: string
  path: string
}

export interface LocalProjectVersion extends ProjectFile {
  id: string
}

export function serializeProject(nodes: Node[], edges: Edge[]): ProjectFile {
  return {
    version: 1,
    nodes,
    edges,
    savedAt: new Date().toISOString(),
  }
}

export function deserializeProject(json: string): { nodes: Node[]; edges: Edge[] } | null {
  try {
    const f = JSON.parse(json) as ProjectFile
    if (!Array.isArray(f.nodes) || !Array.isArray(f.edges)) return null
    return { nodes: f.nodes, edges: f.edges }
  } catch {
    return null
  }
}

const STORAGE_KEY = 'magine.project'
const RECENT_KEY = 'magine.recent'
const VERSIONS_KEY = 'magine.project.versions'

export function loadLocalVersions(): LocalProjectVersion[] {
  try {
    const raw = localStorage.getItem(VERSIONS_KEY)
    const value = raw ? JSON.parse(raw) : []
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

function saveLocalVersion(project: ProjectFile): void {
  try {
    const version: LocalProjectVersion = { ...project, id: `version-${Date.now()}` }
    localStorage.setItem(VERSIONS_KEY, JSON.stringify([version, ...loadLocalVersions()].slice(0, 20)))
  } catch {
    // 版本记录失败不应阻断工程保存。
  }
}

type ProjectApi = {
  open: (path?: string) => Promise<ProjectOpenResult>
  save: (payload: { project: ProjectFile; path?: string }) => Promise<ProjectSaveResult>
  getRecent: () => Promise<string[]>
  addRecent: (path: string) => Promise<void>
}

type ElectronAPI = { invoke: (channel: string, ...args: unknown[]) => Promise<unknown> }

function getApi(): ProjectApi | null {
  const w = window as unknown as { magineProject?: ProjectApi; electronAPI?: ElectronAPI }
  if (w.magineProject) return w.magineProject
  // 兜底：旧 preload 只有 electronAPI 时，用通用 invoke 通道转调 project:*
  if (w.electronAPI?.invoke) {
    return {
      open: (path?: string) => w.electronAPI!.invoke('project:open', { path }) as Promise<ProjectOpenResult>,
      save: (payload: { project: ProjectFile; path?: string }) =>
        w.electronAPI!.invoke('project:save', payload) as Promise<ProjectSaveResult>,
      getRecent: () => w.electronAPI!.invoke('project:get-recent') as Promise<string[]>,
      addRecent: (path: string) => w.electronAPI!.invoke('project:add-recent', path) as Promise<void>,
    }
  }
  return null
}

// ---- 原生文件系统访问 API 兜底（Electron preload 未更新时也能用） ----

function envDiag(): string {
  const w = window as unknown as { magineProject?: unknown; electronAPI?: unknown; showOpenFilePicker?: unknown }
  return `magineProject=${!!w.magineProject}, electronAPI=${!!w.electronAPI}, showOpenFilePicker=${!!w.showOpenFilePicker}`
}

async function openViaFilePicker(): Promise<ProjectOpenResult> {
  const w = window as unknown as { showOpenFilePicker?: (opts: unknown) => Promise<unknown> }
  if (!w.showOpenFilePicker) {
    return { ok: false, error: `浏览器不支持文件选择器（${envDiag()}）`, project: null, path: '' }
  }
  try {
    // 不预过滤扩展名：macOS 对自定义 .magine 扩展名识别不稳定，选完再校验内容。
    const [handle] = (await w.showOpenFilePicker({
      multiple: false,
    })) as [{ getFile: () => Promise<File> }]
    const file = await handle.getFile()
    const lowerName = file.name.toLowerCase()
    if (!lowerName.endsWith('.magine') && !lowerName.endsWith('.json')) {
      return {
        ok: false,
        error: `请选择 .magine 或 .json 工程文件（当前：${file.name}）`,
        project: null,
        path: '',
      }
    }
    const text = await file.text()
    const project = JSON.parse(text)
    if (!Array.isArray(project.nodes) || !Array.isArray(project.edges)) {
      return { ok: false, error: '不是有效的 Magine 工程文件', project: null, path: '' }
    }
    return { ok: true, error: '', project, path: file.name }
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      return { ok: false, error: '未选择文件', project: null, path: '' }
    }
    return { ok: false, error: `打开失败：${(err as Error).message}`, project: null, path: '' }
  }
}

async function saveViaFilePicker(project: ProjectFile): Promise<ProjectSaveResult> {
  const w = window as unknown as { showSaveFilePicker?: (opts: unknown) => Promise<unknown> }
  if (!w.showSaveFilePicker) {
    return { ok: false, error: `浏览器不支持文件保存器（${envDiag()}）`, path: '' }
  }
  try {
    // 不预过滤扩展名，避免 macOS 对 .magine 识别问题；用户可手动输入任意文件名。
    const handle = (await w.showSaveFilePicker({
      suggestedName: '未命名.magine',
    })) as { createWritable: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }> }
    const writable = await handle.createWritable()
    await writable.write(JSON.stringify(project, null, 2))
    await writable.close()
    return { ok: true, error: '', path: '(file-picker)' }
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      return { ok: false, error: '未选择保存位置', path: '' }
    }
    return { ok: false, error: `保存失败：${(err as Error).message}`, path: '' }
  }
}

// ---- 真实文件接口 ----

export async function openProjectFile(path?: string): Promise<ProjectOpenResult> {
  const api = getApi()
  if (api) {
    return api.open(path)
  }
  // Electron preload 未暴露时，先尝试原生文件选择器
  const picker = await openViaFilePicker()
  if (picker.ok || picker.error !== `浏览器不支持文件选择器（${envDiag()}）`) return picker
  // 最后 fallback 到 localStorage
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return { ok: false, error: `暂无已保存工程（${envDiag()}）`, project: null, path: '' }
  try {
    const p = JSON.parse(raw) as ProjectFile
    return { ok: true, error: '', project: p, path: '(localStorage)' }
  } catch (e) {
    return { ok: false, error: (e as Error).message, project: null, path: '' }
  }
}

export async function saveProjectFile(
  project: ProjectFile,
  path?: string,
): Promise<ProjectSaveResult> {
  saveLocalVersion(project)
  const api = getApi()
  if (api) {
    return api.save({ project, path })
  }
  const picker = await saveViaFilePicker(project)
  if (picker.ok || picker.error !== `浏览器不支持文件保存器（${envDiag()}）`) return picker
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project))
    return { ok: true, error: '', path: '(localStorage)' }
  } catch (e) {
    return { ok: false, error: (e as Error).message, path: '' }
  }
}

export async function loadRecent(): Promise<string[]> {
  const api = getApi()
  if (api) return api.getRecent()
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

export async function addRecent(path: string): Promise<void> {
  const api = getApi()
  if (api) return api.addRecent(path)
  const list = (await loadRecent()).filter((p) => p !== path)
  list.unshift(path)
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 10)))
}

// ---- 旧本地接口（保留给 canvasApi 内部快速保存/恢复） ----

export function saveLocal(project: ProjectFile): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(project))
}

export function loadLocal(): ProjectFile | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as ProjectFile
  } catch {
    return null
  }
}

export function clearLocal(): void {
  localStorage.removeItem(STORAGE_KEY)
}
