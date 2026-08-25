// 小云雀风左侧 dock：＋浮点（弹出添加节点面板）+ AI角色库/项目资产/资产库/帮助
// 替代旧的常驻 NodeLibrary 面板；帮助按钮弹出帮助文档弹层
import { useEffect, useRef, useState } from 'react'
import { listNodes } from '../registry'

interface Props {
  onAdd: (typeId: string) => void
}

// 节点类型 → 极简单色符号
const TYPE_ICON: Record<string, { icon: string; cls: string }> = {
  prompt: { icon: 'T', cls: 'gi-neutral' },
  image: { icon: '□', cls: 'gi-neutral' },
  edit: { icon: '✎', cls: 'gi-neutral' },
  video: { icon: '▶', cls: 'gi-neutral' },
  llm: { icon: '·', cls: 'gi-neutral' },
  agent: { icon: 'A', cls: 'gi-neutral' },
  music: { icon: '♫', cls: 'gi-neutral' },
  storyboard: { icon: '▤', cls: 'gi-neutral' },
  material: { icon: '□', cls: 'gi-neutral' },
  region: { icon: '＋', cls: 'gi-neutral' },
  panorama: { icon: '◎', cls: 'gi-neutral' },
  topaz: { icon: '✦', cls: 'gi-neutral' },
  face: { icon: '○', cls: 'gi-neutral' },
}

const HELP_HTML = `
<h3>画布是什么</h3>
<p>Magine Canvas 是节点式 AI 创意工作流画布：每个<b>竖卡节点</b>是一个生成单元（图片 / 视频 / 音频 / 角色 / 场景），节点之间<b>连线协作</b>，上游节点的输出自动成为下游节点的输入。</p>
<h3>添加节点</h3>
<ul><li>点左侧 dock 的 <b>＋</b> 按钮 → 弹出「添加节点」面板</li><li>选择节点类型 → 自动在画布中创建节点</li></ul>
<h3>节点连线（核心）</h3>
<ul>
<li><b>按住节点右侧的紫色 ● 连接点拖动</b> → 拖出一条虚线</li>
<li><b>拖到另一个节点的 ● 上</b> → 磁吸高亮，松手自动连接（上游 → 下游）</li>
<li><b>拖到空白处松手</b> → 弹出「<b>向该节点生成</b>」菜单，选中自动创建新节点并自动连线</li>
<li>新节点输入 = 上游节点输出（自动作为参考 / 上下文）</li>
</ul>
<h3>选中节点 & 提示词框</h3>
<ul>
<li><b>点击竖卡</b> → 选中（橙色虚线框），竖卡下方浮现<b>宽大提示词框</b></li>
<li>提示词框<b>整个区域都可以输入</b>提示词，每个节点各自的提示词独立保存</li>
<li><b>再点同一张竖卡</b> → 收起提示词框；点其他竖卡 → 切换到该卡的提示词</li>
</ul>
<h3>提示词框底部工具条</h3>
<ul>
<li><b>＋</b> 添加文件（图片 / 视频 / 文档）</li>
<li><b>@</b> 引用（资产库 / 项目资产）</li>
<li><b>🎨 风格</b> / <b>模型</b> / <b>比例</b> / <b>画质</b>：生成参数选择</li>
<li><b>🎁 预设提示词</b>：常用提示词面板，点选自动填入</li>
<li><b>生成</b>：按提示词 + 参数生成，结果回填节点</li>
</ul>
<h3>触控板手势</h3>
<ul>
<li><b>双指捏合</b> → 画布缩放</li>
<li><b>双指滑动</b> → 平移画布</li>
<li><b>三指拖动</b>（选中竖卡）→ 移动竖卡，提示词框锁定跟随</li>
</ul>
`

export default function Dock({ onAdd }: Props) {
  const [showAdd, setShowAdd] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const addRef = useRef<HTMLDivElement>(null)
  const items = listNodes()

  // 点击面板外关闭
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (addRef.current && !addRef.current.contains(t)) setShowAdd(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  useEffect(() => {
    if (!showAdd && !showHelp) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowAdd(false)
        setShowHelp(false)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [showAdd, showHelp])

  return (
    <>
      <div className="mc-dock">
        <button
          className={`mc-dock-add${showAdd ? ' active' : ''}`}
          title="添加节点"
          onClick={() => setShowAdd((v) => !v)}
        >
          ＋
        </button>
        <div className="mc-dock-sep" />
        <button className="mc-dock-item" title="AI 角色库">
          <span className="ic">A</span>
          <span className="lb">AI角色库</span>
        </button>
        <button className="mc-dock-item" title="项目资产">
          <span className="ic">□</span>
          <span className="lb">项目资产</span>
        </button>
        <button className="mc-dock-item" title="资产库">
          <span className="ic">▦</span>
          <span className="lb">资产库</span>
        </button>
        <button className="mc-dock-item" title="帮助" onClick={() => setShowHelp(true)}>
          <span className="ic">?</span>
          <span className="lb">帮助</span>
        </button>
      </div>

      {/* 添加节点面板（＋ 弹出） */}
      {showAdd && (
        <div className="mc-add-panel" ref={addRef}>
          <div className="mc-add-title"><span>添加节点</span><button type="button" className="mc-add-close" aria-label="关闭添加节点面板" onClick={() => setShowAdd(false)}>×</button></div>
          <div className="mc-add-list">
            {items.map((it) => {
              const meta = TYPE_ICON[it.id] ?? { icon: '▪', cls: 'gi-blue' }
              return (
                <button
                  key={it.id}
                  type="button"
                  className="mc-add-item"
                  onClick={() => {
                    onAdd(it.id)
                    setShowAdd(false)
                  }}
                >
                  <span className={`mc-add-ic ${meta.cls}`}>{meta.icon}</span>
                  <span className="mc-add-name">{it.name}</span>
                  <span className="mc-add-desc">{it.desc}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* 帮助文档弹层 */}
      {showHelp && (
        <div className="mc-help-mask" onMouseDown={(e) => e.target === e.currentTarget && setShowHelp(false)}>
          <div className="mc-help-box">
            <div className="mc-help-head">
              <div className="mc-help-title">
                <span className="mc-help-logo">M</span>Magine Canvas · 使用帮助
              </div>
              <button className="mc-help-close" onClick={() => setShowHelp(false)}>✕</button>
            </div>
            <div className="mc-help-body" dangerouslySetInnerHTML={{ __html: HELP_HTML }} />
          </div>
        </div>
      )}
    </>
  )
}
