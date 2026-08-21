// S1.3 欢迎页（浅色小云雀风，依据 UI 风格板）
// S1.10+ 支持真实 .magine 工程文件打开与最近文件列表
import { NODE_COUNT, TOOL_COUNT } from '../registry'

interface Props {
  onNew: () => void
  onOpen: (path?: string) => void
  recent?: string[]
}

export default function Welcome({ onNew, onOpen, recent = [] }: Props) {
  return (
    <main className="welcome">
      <h1>欢迎回来</h1>
      <p className="subtitle">Infinite Canvas, infinite Possibilities</p>
      <div className="btn-row">
        <button className="primary-btn" type="button" onClick={onNew}>
          新建画布 ＋
        </button>
        <button className="ghost-btn" type="button" onClick={() => onOpen()}>
          打开文件
        </button>
      </div>
      <div className="recent-card">
        {recent.length === 0 ? (
          <span className="recent-empty">暂无最近文件</span>
        ) : (
          <>
            <div className="recent-title">最近文件</div>
            <ul className="recent-list">
              {recent.map((p) => (
                <li key={p} className="recent-item" onClick={() => onOpen(p)}>
                  {p.split('/').pop() || p}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      <p className="hint">已就绪：{NODE_COUNT} 节点 / {TOOL_COUNT} 工具 / 15 主动交互场景 · 纯本地 .magine 工程</p>
    </main>
  )
}
