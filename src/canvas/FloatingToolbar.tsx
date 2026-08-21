// S1.7 底部悬浮工具栏（5 胶囊：清空/打开/新建/助手/预设）
// 功能占位，S2+ 接入真实逻辑（onAction 现仅打印）
interface Props {
  onAction: (action: string) => void
}

const ITEMS = [
  { key: 'undo', label: '撤销', title: '撤销（⌘/Ctrl+Z）' },
  { key: 'redo', label: '恢复', title: '恢复（⌘/Ctrl+Shift+Z）' },
  { key: 'copy-selected', label: '复制选中', title: '复制选中（⌘/Ctrl+D）' },
  { key: 'delete-selected', label: '删除选中', title: '删除选中（Delete/Backspace）' },
  { key: 'export-selected', label: '导出选中', title: '导出选中的节点和连线' },
  { key: 'save', label: '保存工程', title: '保存当前 .magine 工程（⌘/Ctrl+S）' },
  { key: 'clear', label: '清空' },
  { key: 'open', label: '打开' },
  { key: 'new', label: '新建' },
  { key: 'import', label: '导入素材' },
  { key: 'region', label: '框选分组' },
  { key: 'assistant', label: '助手' },
  { key: 'preset', label: '预设' },
  { key: 'history', label: '历史' },
]

export default function FloatingToolbar({ onAction }: Props) {
  return (
    <div className="floating-toolbar">
      {ITEMS.map((it) => (
        <button
          key={it.key}
          className="ft-pill"
          type="button"
          title={it.title}
          onClick={() => onAction(it.key)}
        >
          {it.label}
        </button>
      ))}
    </div>
  )
}
