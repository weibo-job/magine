// S1.4 左侧导航（小云雀浅色风）+ S2.1 设置入口
interface NavItem {
  key: string
  label: string
}

const ITEMS: NavItem[] = [
  { key: 'projects', label: '项目中心' },
  { key: 'roundtable', label: '圆桌思辨' },
  { key: 'create', label: '创作' },
  { key: 'drama', label: '短剧 Agent' },
  { key: 'market', label: '营销 Agent' },
  { key: 'free', label: '自由画布' },
  { key: 'assets', label: '资产' },
  { key: 'learn', label: '学习中心' },
]

const BOTTOM: NavItem[] = [{ key: 'settings', label: '设置' }]

interface Props {
  active: string
  onSelect: (key: string) => void
}

export default function Sidebar({ active, onSelect }: Props) {
  return (
    <aside className="sidebar">
      <div className="logo">Magine</div>
      <nav>
        {ITEMS.map((it) => (
          <span
            key={it.key}
            className={`nav-item${it.key === active ? ' active' : ''}`}
            onClick={() => onSelect(it.key)}
          >
            {it.label}
          </span>
        ))}
      </nav>
      <div className="nav-bottom">
        {BOTTOM.map((it) => (
          <span
            key={it.key}
            className={`nav-item${it.key === active ? ' active' : ''}`}
            onClick={() => onSelect(it.key)}
          >
            {it.label}
          </span>
        ))}
      </div>
    </aside>
  )
}
