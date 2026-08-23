export interface ToolbarPanelItem {
  id: string
  icon: string
  title: string
  description: string
  prompt: string
}

export const ASSISTANT_ACTIONS: ToolbarPanelItem[] = [
  { id: 'workflow', icon: '⌘', title: '快速搭工作流', description: '把一句目标拆成节点与连线', prompt: '根据我的目标搭建一条完整、可执行的创作工作流。' },
  { id: 'organize', icon: '↗', title: '整理当前画布', description: '自动排列节点并居中显示', prompt: '整理当前画布中的节点布局。' },
  { id: 'complete', icon: '＋', title: '补全当前链路', description: '检查缺失步骤并补齐节点', prompt: '检查当前画布工作流，补齐缺失的关键节点和连线，保留已有内容。' },
  { id: 'douyin', icon: '▣', title: '抖音图文工作流', description: '选题、文案、配图到成稿', prompt: '搭建一条抖音图文创作工作流：选题分析、标题文案、分镜配图、九比十六图片和发布稿。' },
  { id: 'video', icon: '▶', title: '短视频工作流', description: '脚本、画面、视频与配乐', prompt: '搭建一条短视频创作工作流：脚本、分镜、图像、视频和配乐，产出九比十六短视频。' },
  { id: 'inspect', icon: '◎', title: '分析当前画布', description: '找出断点、重复和可优化项', prompt: '分析当前画布的节点和连线，指出断点、重复步骤和三个最值得优先优化的地方。' },
]

export const WORKFLOW_PRESETS: ToolbarPanelItem[] = [
  { id: 'image-video', icon: '◫', title: '图生视频', description: '提示词 → 图像 → 视频 → 配乐', prompt: '搭建图生视频工作流：提示词润色、生成首帧图、图生视频、生成配乐并输出成片。' },
  { id: 'douyin-post', icon: '▤', title: '抖音图文', description: '选题 → 文案 → 竖版配图', prompt: '搭建抖音图文工作流：确定选题、生成标题与正文、规划五张九比十六配图并逐张生成。' },
  { id: 'marketing', icon: '◇', title: '营销短片', description: '卖点 → 脚本 → 商品图 → 视频', prompt: '搭建营销短片工作流：提炼商品卖点、生成广告脚本、商品图、九比十六营销视频和配乐。' },
  { id: 'drama', icon: '◉', title: '短剧分镜', description: '剧情 → 角色 → 分镜 → 成片', prompt: '搭建短剧分镜工作流：剧情大纲、角色设定、分镜脚本、首帧图、视频镜头和配乐。' },
  { id: 'product-image', icon: '□', title: '产品图', description: '卖点 → 场景 → 多比例商品图', prompt: '搭建产品图工作流：提炼卖点、生成场景提示词，并输出一比一、四比三和九比十六商品图。' },
  { id: 'prompt-polish', icon: '✦', title: '提示词润色', description: '原始想法 → 结构化提示词', prompt: '搭建提示词润色工作流：接收原始想法，由大语言模型补充主体、场景、镜头、光线、风格和负面约束。' },
]

export function planWorkflow(instruction: string) {
  const isMarket = /营销|电商|卖点|详情页|广告/.test(instruction)
  const isDrama = /短剧|剧情|分镜|角色|剧本/.test(instruction)
  const isPromptPolish = /提示词润色|结构化提示词/.test(instruction)
  const isImagePost = /图文|配图|海报/.test(instruction)
  const isProductImage = /产品图|商品图/.test(instruction)

  let nodes: string[]
  let outputs: string[]
  if (isMarket) {
    nodes = ['提示词', 'LLM 文案', '图像', '视频']
    outputs = ['标题/卖点文案', '商品图', '营销视频']
  } else if (isDrama) {
    nodes = ['提示词', 'LLM 剧本', '分镜', '图像', '视频']
    outputs = ['剧本/分镜', '首帧图', '短剧视频']
  } else if (isPromptPolish) {
    nodes = ['提示词', 'LLM']
    outputs = ['结构化提示词']
  } else if (isImagePost) {
    nodes = ['提示词', 'LLM 文案', '图像']
    outputs = ['标题/正文', '竖版配图']
  } else if (isProductImage) {
    nodes = ['提示词', 'LLM 文案', '图像']
    outputs = ['商品卖点', '多比例商品图']
  } else {
    nodes = ['提示词', 'LLM', '图像', '视频']
    outputs = ['文本', '图片', '视频']
  }

  if (/音乐|配乐/.test(instruction)) {
    if (!nodes.includes('音乐/语音')) nodes.push('音乐/语音')
    if (!outputs.includes('配乐')) outputs.push('配乐')
  }
  return { nodes, outputs }
}

export function createPromptNodeData(name: string, content: string) {
  return {
    kind: '提示词',
    nodeTypeId: 'prompt',
    label: name,
    status: 'idle',
    text: content,
  }
}
