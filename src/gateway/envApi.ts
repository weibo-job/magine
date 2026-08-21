// S2.14 Agent 执行环境接口（fs / net / terminal / api 共 16 项 P0 工具）
// 设计：renderer 侧优先通过 window.electronAPI.invoke('agent:tool', {tool,args}) 桥接主进程真执行；
// 若运行在纯 Web（无 electronAPI，如沙箱/demo 预览），则 api 组用注册表/vault 真跑，
// fs/net/terminal 返回"需 Electron 主进程"的友好降级提示（不崩、不报错中断 Agent 循环）。
import { getVault } from '../settings/vaultStore'
import { providers } from '../registry/providers'

export interface EnvApi {
  // 2.2 fs 文件（5）
  readFile: (path: string) => Promise<string>
  writeFile: (path: string, content: string) => Promise<string>
  glob: (pattern: string, cwd?: string) => Promise<string>
  grep: (pattern: string, cwd?: string) => Promise<string>
  listDir: (path: string) => Promise<string>
  // 2.3 net 网络（2）
  webSearch: (query: string) => Promise<string>
  webFetch: (url: string) => Promise<string>
  // 2.4 terminal 终端（5）
  runBash: (cmd: string) => Promise<string>
  spawnSubagent: (task: string) => Promise<string>
  killTask: (id: string) => Promise<string>
  listSessions: () => Promise<string>
  newSession: () => Promise<string>
  // 2.5 api 配置（4）
  readConfig: () => Promise<string>
  setConfig: (key: string, value: string) => Promise<string>
  testConnection: (providerId: string) => Promise<string>
  listProviders: () => Promise<string>
  // 2.6 媒体 / 系统（P1 扩展，4）：音乐控制 / 通知 / 打开链接 / 剪贴板
  musicControl: (action: string, opts?: Record<string, unknown>) => Promise<string>
  notify: (msg: string) => Promise<string>
  openUrl: (url: string) => Promise<string>
  clipboard: (op: 'read' | 'write', text?: string) => Promise<string>
}

// 主进程桥接是否存在（Electron 环境才暴露 window.electronAPI）
function hasBridge(): boolean {
  const api = (window as unknown as { electronAPI?: { invoke?: unknown } }).electronAPI
  return !!(api && typeof api.invoke === 'function')
}

// 走 IPC：渲染进程 → 主进程 ipcMain.handle('agent:tool')
async function bridge(tool: string, args: Record<string, unknown>): Promise<string> {
  const api = (window as unknown as { electronAPI: { invoke: (c: string, p: unknown) => Promise<unknown> } }).electronAPI
  try {
    const r = await api.invoke('agent:tool', { tool, args })
    return typeof r === 'string' ? r : String(r)
  } catch (e) {
    return `IPC 失败 ${tool}：${(e as Error).message}`
  }
}

// api 组在 renderer 也能真跑（不依赖文件/终端/网络，只读注册表与内存保险库）
function apiOnWeb(tool: string, args: Record<string, unknown>): Promise<string> {
  switch (tool) {
    case 'list_providers': {
      const lines = providers.map((p) => `- ${p.id}（${p.name}）能力：${p.capabilities.join('/')}`)
      return Promise.resolve(lines.join('\n'))
    }
    case 'read_config': {
      const v = getVault()
      if (!v) return Promise.resolve('（保险库未解锁，请在"设置"里解锁）')
      const keys = Object.keys(v.keys)
      if (keys.length === 0) return Promise.resolve('已配置服务商：无')
      const masked = keys.map((k) => `${k}: ${'*'.repeat(8)}`).join('\n')
      return Promise.resolve('已配置服务商（Key 已脱敏）：\n' + masked)
    }
    case 'set_config':
      return Promise.resolve('（set_config 需主进程写入本地存储，请在 Electron 中使用）')
    case 'test_connection': {
      const id = String(args.providerId ?? '')
      const p = providers.find((x) => x.id === id)
      return Promise.resolve(p ? `服务商 ${p.name} 已注册；连通性真测请在 Electron 主进程执行` : `未知服务商：${id}`)
    }
    default:
      return Promise.resolve(`（工具 ${tool} 在 Web 环境不可用，需 Electron 主进程）`)
  }
}

function notInWeb(msg: string): Promise<string> {
  return Promise.resolve(`（${msg} 需 Electron 主进程，当前为 Web 预览环境）`)
}

// 工厂：返回注入 Agent 的 EnvApi 实例（按运行环境自动选择真实执行或降级）
export function createRendererEnvApi(): EnvApi {
  return {
    readFile: (p) => (hasBridge() ? bridge('read_file', { path: p }) : notInWeb('read_file')),
    writeFile: (p, c) => (hasBridge() ? bridge('write_file', { path: p, content: c }) : notInWeb('write_file')),
    glob: (pat, cwd) => (hasBridge() ? bridge('glob', { pattern: pat, cwd }) : notInWeb('glob')),
    grep: (pat, cwd) => (hasBridge() ? bridge('grep', { pattern: pat, cwd }) : notInWeb('grep')),
    listDir: (p) => (hasBridge() ? bridge('list_dir', { path: p }) : notInWeb('list_dir')),
    webSearch: (q) => (hasBridge() ? bridge('web_search', { query: q }) : notInWeb('web_search')),
    webFetch: (u) => (hasBridge() ? bridge('web_fetch', { url: u }) : notInWeb('web_fetch')),
    runBash: (cmd) => (hasBridge() ? bridge('run_bash', { cmd }) : notInWeb('run_bash')),
    spawnSubagent: (task) => (hasBridge() ? bridge('spawn_subagent', { task }) : notInWeb('spawn_subagent')),
    killTask: (id) => (hasBridge() ? bridge('kill_task', { id }) : notInWeb('kill_task')),
    listSessions: () => (hasBridge() ? bridge('list_sessions', {}) : notInWeb('list_sessions')),
    newSession: () => (hasBridge() ? bridge('new_session', {}) : notInWeb('new_session')),
    readConfig: () => apiOnWeb('read_config', {}),
    setConfig: (k, v) => apiOnWeb('set_config', { key: k, value: v }),
    testConnection: (id) => apiOnWeb('test_connection', { providerId: id }),
    listProviders: () => apiOnWeb('list_providers', {}),
    musicControl: (action, opts) => musicControlImpl(action, opts),
    notify: (msg) => notifyImpl(msg),
    openUrl: (url) => openUrlImpl(url),
    clipboard: (op, text) => clipboardImpl(op, text),
  }
}

// ---- P1 扩展：媒体 / 系统工具实现（renderer 直跑，无需主进程 IPC） ----
// S3.2 音乐控制：直接操作页面内已渲染的 <audio> 元素（NodeCard 的 music 节点产出）。
function musicControlImpl(action: string, opts?: Record<string, unknown>): Promise<string> {
  const audios = Array.from(document.querySelectorAll('audio')) as HTMLAudioElement[]
  switch (action) {
    case 'pause':
      audios.forEach((a) => a.pause())
      return Promise.resolve(`已暂停 ${audios.length} 个音频`)
    case 'stop':
      audios.forEach((a) => {
        a.pause()
        a.currentTime = 0
      })
      return Promise.resolve(`已停止 ${audios.length} 个音频`)
    case 'list_tracks':
      return Promise.resolve(
        audios.map((a, i) => `${i + 1}. ${(a.src || '').slice(0, 60)}`).join('\n') || '（页面内暂无音频）',
      )
    case 'set_tempo': {
      const r = Math.min(2, Math.max(0.5, Number(opts?.rate ?? 1) || 1))
      audios.forEach((a) => (a.playbackRate = r))
      return Promise.resolve(`已设置播放速度 ${r}x（共 ${audios.length} 个音频）`)
    }
    case 'mix':
      return Promise.resolve('（混音需专业软件；当前多音轨可并行播放，已确保互不停止）')
    default:
      return Promise.resolve(`未知音乐控制动作：${action}（可选 pause/stop/list_tracks/set_tempo/mix）`)
  }
}

function notifyImpl(msg: string): Promise<string> {
  try {
    if (typeof Notification !== 'undefined') {
      if (Notification.permission === 'granted') {
        new Notification('Magine Canvas', { body: msg })
      } else if (Notification.permission !== 'denied') {
        void Notification.requestPermission().then((p) => {
          if (p === 'granted') new Notification('Magine Canvas', { body: msg })
        })
      }
    }
    return Promise.resolve('已发送通知（系统不支持时仅记录）：' + msg)
  } catch {
    return Promise.resolve('通知不可用，内容：' + msg)
  }
}

function openUrlImpl(url: string): Promise<string> {
  try {
    window.open(url, '_blank', 'noopener')
    return Promise.resolve('已打开链接：' + url)
  } catch {
    return Promise.resolve('打开链接失败：' + url)
  }
}

async function clipboardImpl(op: 'read' | 'write', text?: string): Promise<string> {
  try {
    if (op === 'write' && text != null) {
      await navigator.clipboard.writeText(text)
      return Promise.resolve('已复制到剪贴板')
    }
    if (op === 'read') {
      const t = await navigator.clipboard.readText()
      return Promise.resolve(t || '（剪贴板为空）')
    }
    return Promise.resolve('clipboard 需要 op=read|write')
  } catch (e) {
    return Promise.resolve('剪贴板操作失败（需安全上下文/授权）：' + (e as Error).message)
  }
}
