// S2.14 预加载脚本：在上下文隔离（contextIsolation）下，向渲染进程安全暴露唯一出口。
// 只暴露一个 invoke 通道，所有 Agent 环境工具（fs/net/terminal）都经此桥接主进程，
// 不暴露 node / fs / process 等原始能力，避免渲染进程被注入后直接拿到底层权限。
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),
})

// S1.10+：工程文件真实存读（类型友好的直接调用）
contextBridge.exposeInMainWorld('magineProject', {
  open: (path?: string) => ipcRenderer.invoke('project:open', { path }),
  save: (payload: { project: Record<string, unknown>; path?: string }) =>
    ipcRenderer.invoke('project:save', payload),
  getRecent: () => ipcRenderer.invoke('project:get-recent'),
  addRecent: (path: string) => ipcRenderer.invoke('project:add-recent', path),
})
