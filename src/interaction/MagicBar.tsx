// S2.17 Magic 助手浮层：把主动交互引擎产出的提醒以卡片呈现，支持「知道了」与「不再提醒这类」（满足 S3.4）。
import type { MagicItem } from './proactive'

interface Props {
  items: MagicItem[]
  onDismiss: (id: string) => void
  onDisableCat: (cat: string) => void
}

export default function MagicBar({ items, onDismiss, onDisableCat }: Props) {
  if (items.length === 0) return null
  return (
    <div className="magic-bar">
      {items.map((it) => (
        <div className="magic-card" key={it.id}>
          <div className="magic-head">
            <span className="magic-ic">🪄</span>
            <span className="magic-title">{it.title}</span>
            <span className="magic-cat">{it.category}</span>
          </div>
          <div className="magic-body">{it.body}</div>
          <div className="magic-actions">
            <button className="magic-btn ghost" onClick={() => onDisableCat(it.category)}>
              不再提醒这类
            </button>
            <button className="magic-btn" onClick={() => onDismiss(it.id)}>
              知道了
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
