// S1.9 节点库面板：列出 12 节点类型（来自注册表），点击往画布放置 stub 卡片
import { listNodes } from '../registry'

interface Props {
  onAdd: (typeId: string) => void
}

export default function NodeLibrary({ onAdd }: Props) {
  const items = listNodes()

  return (
    <div className="node-library">
      <div className="nl-title">节点库 · {items.length}</div>
      <div className="nl-list">
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            className={`nl-item${it.status === 'stub' ? ' is-stub' : ''}`}
            title={it.desc}
            onClick={() => onAdd(it.id)}
          >
            <span className="nl-name">{it.name}</span>
            <span className="nl-phase">{it.phase}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
