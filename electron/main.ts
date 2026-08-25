import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import { fileURLToPath } from 'url'

const execAsync = promisify(exec)

// ---- S1.10 真实工程文件存读（.magine JSON） ----
const RECENT_FILE = path.join(app.getPath('userData'), 'magine_recent.json')
const PROJECT_FILTER: Electron.FileFilter[] = [
  { name: 'Magine 工程文件', extensions: ['magine'] },
  { name: 'JSON', extensions: ['json'] },
  { name: '所有文件', extensions: ['*'] },
]

function readRecent(): string[] {
  try {
    const raw = fs.readFileSync(RECENT_FILE, 'utf8')
    const arr = JSON.parse(raw) as string[]
    return Array.isArray(arr) ? arr.filter((p) => typeof p === 'string') : []
  } catch {
    return []
  }
}

function writeRecent(paths: string[]) {
  try {
    fs.mkdirSync(path.dirname(RECENT_FILE), { recursive: true })
    fs.writeFileSync(RECENT_FILE, JSON.stringify(paths.slice(0, 10)), 'utf8')
  } catch {
    // 忽略写入失败
  }
}

function pushRecent(p: string) {
  const list = readRecent().filter((x) => x !== p)
  list.unshift(p)
  writeRecent(list)
}

// ESM 下没有 __dirname，需用 import.meta.url 推导（dist-electron/main.js 与 preload.js 同目录）
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 避免 macOS 多次实例化
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
}

let mainWindow: BrowserWindow | null = null
if (gotTheLock) {
  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })
}

// ---- S2.14 Agent 环境工具：主进程真执行（fs / net / terminal） ----
// 渲染进程经 preload 的 electronAPI.invoke('agent:tool', {tool, args}) 调到这里。
// api 组（read_config 等）在渲染进程用 vaultStore 直接跑，不经此通道。
// 注意：这里用 Node 递归实现 glob/grep，避免 shell 注入；run_bash 直接 exec（本地客户端自用）。

function globToRegExp(seg: string): RegExp {
  const esc = seg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')
  return new RegExp('^' + esc + '$')
}

function globSimple(pattern: string, root: string): string {
  const results: string[] = []
  const segs = pattern.split('/').filter((s) => s.length > 0)
  function walk(dir: string, idx: number) {
    if (idx >= segs.length) {
      results.push(dir)
      return
    }
    const seg = segs[idx]
    const rest = idx + 1
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    if (seg === '**') {
      walk(dir, rest)
      for (const e of entries) if (e.isDirectory()) walk(path.join(dir, e.name), idx)
    } else {
      const re = globToRegExp(seg)
      for (const e of entries) {
        if (!re.test(e.name)) continue
        const full = path.join(dir, e.name)
        if (rest >= segs.length) results.push(full)
        else if (e.isDirectory()) walk(full, rest)
      }
    }
  }
  walk(root, 0)
  return results.join('\n') || '（无匹配）'
}

function grepRecursive(root: string, pattern: string): string {
  let re: RegExp
  try {
    re = new RegExp(pattern)
  } catch {
    return `（正则无效：${pattern}）`
  }
  const out: string[] = []
  const allowed = /\.(ts|tsx|js|jsx|json|md|txt|css|html|mjs|cjs)$/
  function walk(dir: string) {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (['node_modules', '.git', 'dist', 'dist-electron'].includes(e.name)) continue
        walk(full)
      } else if (allowed.test(e.name)) {
        let content: string
        try {
          content = fs.readFileSync(full, 'utf8')
        } catch {
          continue
        }
        content.split('\n').forEach((line, i) => {
          if (re.test(line)) out.push(`${full}:${i + 1}: ${line}`)
        })
      }
    }
  }
  walk(root)
  return out.join('\n').slice(0, 12000) || '（无匹配）'
}

ipcMain.handle('agent:tool', async (_e, payload: { tool: string; args?: Record<string, unknown> }) => {
  const tool = payload?.tool
  const a = (payload?.args || {}) as Record<string, string>
  try {
    switch (tool) {
      case 'read_file':
        return await fs.promises.readFile(a.path, 'utf8')
      case 'write_file':
        await fs.promises.writeFile(a.path, a.content ?? '', 'utf8')
        return `✅ 已写入 ${a.path}`
      case 'list_dir': {
        const entries = await fs.promises.readdir(a.path || '.', { withFileTypes: true })
        return entries.map((e) => (e.isDirectory() ? `[D] ${e.name}` : e.name)).join('\n')
      }
      case 'glob':
        return globSimple(a.pattern || '*', a.cwd || process.cwd())
      case 'grep':
        return grepRecursive(a.cwd || process.cwd(), a.pattern || '')
      case 'web_fetch': {
        const resp = await fetch(a.url)
        const text = await resp.text()
        return text.slice(0, 8000)
      }
      case 'web_search':
        return '（web_search 需接入搜索 API，如 Tavily/SerpAPI；当前未配置，请在设置中补充）'
      case 'run_bash': {
        const { stdout, stderr } = await execAsync(a.cmd, { maxBuffer: 12 * 1024 * 1024 })
        return (stdout + (stderr ? `\n[stderr]\n${stderr}` : '')).slice(0, 8000)
      }
      case 'spawn_subagent':
        return '（spawn_subagent 需子代理运行时，当前本地客户端暂未实现，S3 阶段接入）'
      case 'kill_task':
      case 'list_sessions':
      case 'new_session':
        return '（会话管理需子代理运行时，当前暂未实现）'
      default:
        return `未知环境工具：${tool}`
    }
  } catch (err) {
    return `❌ ${tool} 失败：${(err as Error).message}`
  }
})

ipcMain.handle('project:open', async (_e, _payload?: { path?: string }) => {
  const win = BrowserWindow.getFocusedWindow()
  const target =
    _payload?.path ||
    (
      await dialog.showOpenDialog(win!, {
        title: '打开 Magine 工程',
        filters: PROJECT_FILTER,
        properties: ['openFile'],
      })
    ).filePaths[0]
  if (!target) return { ok: false, error: '未选择文件', project: null }
  try {
    const raw = fs.readFileSync(target, 'utf8')
    const project = JSON.parse(raw)
    if (!Array.isArray(project.nodes) || !Array.isArray(project.edges)) {
      return { ok: false, error: '不是有效的 Magine 工程文件', project: null }
    }
    pushRecent(target)
    return { ok: true, error: '', project, path: target }
  } catch (err) {
    return { ok: false, error: `打开失败：${(err as Error).message}`, project: null }
  }
})

ipcMain.handle(
  'project:save',
  async (_e, payload: { project: Record<string, unknown>; path?: string }) => {
    const win = BrowserWindow.getFocusedWindow()
    let target = payload?.path
    if (!target) {
      const r = await dialog.showSaveDialog(win!, {
        title: '保存 Magine 工程',
        filters: PROJECT_FILTER,
        defaultPath: '未命名.magine',
      })
      if (r.canceled || !r.filePath) return { ok: false, error: '未选择保存位置', path: '' }
      target = r.filePath
    }
    try {
      fs.writeFileSync(target, JSON.stringify(payload.project, null, 2), 'utf8')
      pushRecent(target)
      return { ok: true, error: '', path: target }
    } catch (err) {
      return { ok: false, error: `保存失败：${(err as Error).message}`, path: '' }
    }
  },
)

ipcMain.handle('project:get-recent', async () => readRecent())

ipcMain.handle('project:add-recent', async (_e, p: string) => pushRecent(p))

ipcMain.handle('demo:capture', async (event, payload: { x?: number; y?: number; width?: number; height?: number }) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) throw new Error('找不到当前窗口')
  const bounds = win.getContentBounds()
  const x = Math.max(0, Math.min(Math.round(payload?.x || 0), bounds.width - 1))
  const y = Math.max(0, Math.min(Math.round(payload?.y || 0), bounds.height - 1))
  const width = Math.max(1, Math.min(Math.round(payload?.width || 1), bounds.width - x))
  const height = Math.max(1, Math.min(Math.round(payload?.height || 1), bounds.height - y))
  const image = await win.webContents.capturePage({ x, y, width, height })
  return image.toDataURL()
})

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#f2f2f2',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  })
  mainWindow = win
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  // 开发模式优先加载 Vite；服务未启动时自动回退到构建产物，避免 Electron 空白窗口。
  const productionIndex = path.join(__dirname, '..', 'dist', 'index.html')
  const loadProduction = () => void win.loadFile(productionIndex)
  const devServerUrl = process.env.VITE_DEV_SERVER_URL || (!app.isPackaged ? 'http://127.0.0.1:5173' : '')
  if (devServerUrl) {
    win.webContents.once('did-fail-load', loadProduction)
    void win.loadURL(devServerUrl).catch(loadProduction)
  } else {
    loadProduction()
  }
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
