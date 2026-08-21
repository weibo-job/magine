// S1.4 占位页：创作 / 短剧 / 营销 / 资产 / 学习中心 未实装完整内容前，先显示对应标题与简介
interface Props {
  title: string
  desc: string
}

export default function PlaceholderPage({ title, desc }: Props) {
  return (
    <div className="welcome-page">
      <div className="welcome-center">
        <h1>{title}</h1>
        <p className="welcome-sub">{desc}</p>
      </div>
    </div>
  )
}
