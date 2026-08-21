// S1.4 顶部胶囊工具栏（占位，S1.7 接入底部悬浮栏，S2 接入搜索/命令）
interface Props {
  title: string
}

export default function TopBar({ title }: Props) {
  return (
    <header className="topbar">
      <div className="topbar-title">{title}</div>
    </header>
  )
}
