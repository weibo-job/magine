// S2.11 Agent 运行时：自然语言 → LLM（<think> 思维链流式）→ 解析工具调用 → 执行画布工具
// S2.13 扩展：把 Agent 的"手"从 4 个最小画布手扩到 12 个（增删/连线/撤销/套模板/自动布局等）。
// 完整 57 工具在 S2.13 / S2.14 实装；此处 canvas 组 12 项已全实装，fs/net/terminal/api 组待 S2.14。
import { volcanoChatStream, type ChatMessage, DOUBAO_CHAT_MODEL } from './volcano'
import { deepseekChatStream, DEEPSEEK_CHAT_MODEL } from './deepseek'
import { selectProvider } from './providerRouter'
import type { EnvApi } from './envApi'
import { getKey } from '../settings/vaultStore'
import {
  dreaminaGenerateVideo,
  dreaminaGenerateImage,
  dreaminaExtend,
  dreaminaLipSync,
  dreaminaDigitalHuman,
  dreaminaSmartCanvas,
  dreaminaTemplate,
  dreaminaCameraMotion,
  dreaminaAssetSearch,
} from './dreamina'
import { startTimer, screenshot } from './misc'

export interface AgentToolCall {
  tool: string
  args: Record<string, unknown>
}

export interface CanvasApi {
  addNode: (typeId: string, text?: string) => { ok: boolean; nodeId?: string; error?: string }
  deleteNode: (id: string) => { ok: boolean; error?: string }
  connect: (source: string, target: string) => { ok: boolean; error?: string }
  disconnect: (source: string, target: string) => { ok: boolean; error?: string }
  runNode: (id: string) => Promise<{ ok: boolean; result?: string; error?: string }>
  runAll: () => Promise<{ ok: boolean; result?: string; error?: string }>
  undo: () => { ok: boolean; error?: string }
  redo: () => { ok: boolean; error?: string }
  saveTemplate: (name: string) => { ok: boolean; error?: string }
  applyTemplate: (name: string) => { ok: boolean; result?: string; error?: string }
  copyNode: (id: string) => { ok: boolean; nodeId?: string; error?: string }
  autoLayout: () => { ok: boolean; result?: string; error?: string }
  newProject: () => { ok: boolean; result?: string }
  openProject: () => { ok: boolean; result?: string; error?: string }
  saveProject: () => { ok: boolean; result?: string }
  listNodes: () => { id: string; type: string; label: string; hasOutput: boolean }[]
  getNodeText: (id: string) => string
}

export interface AgentHandlers {
  onThink?: (delta: string) => void
  onText?: (delta: string) => void
  onTool?: (call: AgentToolCall, result: string) => void
  onFinal?: (text: string) => void
  onError?: (err: string) => void
  onCancel?: () => void
}

export interface AgentDeps {
  apiKey: string
  model?: string
  maxSteps?: number
  canvas: CanvasApi
  env: EnvApi
  signal?: AbortSignal
}

// S2.14 环境组工具描述（共 16 个），拼进系统提示，让模型知道还有文件/网络/终端/配置类工具。
const ENV_TOOL_LINES = [
  '13) read_file：读取文件内容，args={"path":"文件路径"}',
  '14) write_file：写文件，args={"path":"路径","content":"内容"}',
  '15) glob：按模式搜索文件（** 表示递归），args={"pattern":"如 **/*.ts","cwd":"可选起始目录"}',
  '16) grep：在文件内容中搜索，args={"pattern":"正则","cwd":"可选目录"}',
  '17) list_dir：列出目录内容，args={"path":"目录路径"}',
  '18) web_search：联网搜索，args={"query":"搜索词"}',
  '19) web_fetch：抓取网页内容，args={"url":"网页地址"}',
  '20) run_bash：执行终端命令，args={"cmd":"命令"}',
  '21) spawn_subagent：派生子代理执行任务，args={"task":"任务描述"}',
  '22) kill_task：终止任务，args={"id":"任务id"}',
  '23) list_sessions：列出会话，args={}',
  '24) new_session：新建会话，args={}',
  '25) read_config：读取已配置服务商（Key 脱敏），args={}',
  '26) set_config：设置配置项，args={"key":"键","value":"值"}',
  '27) test_connection：测试服务商连通性，args={"providerId":"服务商id"}',
  '28) list_providers：列出所有已注册服务商，args={}',
]

// S3.2 扩展组工具描述（共 12 个 P1）：音乐控制 5 + 项目管理 3 + 系统 4
const EXT_TOOL_LINES = [
  '29) music_pause：暂停当前所有音乐播放，args={}',
  '30) music_stop：停止并归零当前所有音乐，args={}',
  '31) music_list_tracks：列出页面内音频轨，args={}',
  '32) music_set_tempo：设置播放速度，args={"rate":1.0}（0.5–2）',
  '33) music_mix：混音提示（多音轨可并行播放），args={}',
  '34) new_project：新建空白工程，args={}',
  '35) open_project：打开已保存工程，args={}',
  '36) save_project：保存当前工程，args={}',
  '37) notify：发送系统通知，args={"msg":"内容"}',
  '38) open_url：打开网页链接，args={"url":"地址"}',
  '39) clipboard_read：读取剪贴板文本，args={}',
  '40) clipboard_write：写入剪贴板，args={"text":"内容"}',
  // S3.6 P2 转正：即梦 9 + 杂项 2（共 11 项）
  '41) dreamina_generate_video：即梦文生视频（路由火山 Seedance），args={"prompt":"描述"}',
  '42) dreamina_generate_image：即梦文生图（路由火山 Seedream），args={"prompt":"描述"}',
  '43) dreamina_extend：即梦扩图/扩视频（火山 Seedream 图生图），args={"prompt":"描述","image":"可选图片dataURL"}',
  '44) dreamina_lip_sync：即梦对口型（需即梦 Key），args={"video":"视频","audio":"音频"}',
  '45) dreamina_digital_human：即梦数字人（需即梦 Key），args={"prompt":"描述"}',
  '46) dreamina_smart_canvas：即梦智能画布（需即梦 Key），args={"prompt":"描述"}',
  '47) dreamina_template：即梦模板套用（需即梦 Key），args={"templateId":"模板id"}',
  '48) dreamina_camera_motion：即梦运镜控制（需即梦 Key），args={"video":"视频","motion":"运镜描述"}',
  '49) dreamina_asset_search：即梦素材搜索（需即梦 Key），args={"query":"关键词"}',
  '50) start_timer：计时器，到点桌面提醒，args={"seconds":30,"msg":"提醒内容"}',
  '51) screenshot：截屏（getDisplayMedia 捕获屏幕帧），args={}',
]

// 系统提示：约束 Agent 输出格式（XML 工具调用块），不依赖特定模型的 function-calling 协议，跨模型兼容。
const SYSTEM_PROMPT: string = [
  '你是一个画布智能体（Agent），运行在 Magine Canvas 节点式创意工作流里，可通过工具直接操作画布。',
  '可用工具（共 51 个，分画布组 12 + 环境组 16 + 扩展组 12 + P2 组 11）：',
  '1) add_node：新增节点，args={"type":"节点id，可选 prompt|llm|image|video|music|agent","text":"可选，该节点的提示词/指令文本"}',
  '2) delete_node：删除节点，args={"id":"节点id"}',
  '3) connect：连接两个节点（让上游喂下游），args={"source":"源节点id","target":"目标节点id"}',
  '4) disconnect：断开连线，args={"source":"源节点id","target":"目标节点id"}',
  '5) run_node：运行单个节点并产出内容，args={"id":"节点id"}',
  '6) run_all：按顺序运行画布上全部非智能体节点，args={}',
  '7) undo：撤销上一步画布操作，args={}',
  '8) redo：重做被撤销的操作，args={}',
  '9) save_template：把当前画布存为模板，args={"name":"模板名"}',
  '10) apply_template：套用已存模板，args={"name":"模板名"}',
  '11) copy_node：复制节点，args={"id":"节点id"}',
  '12) auto_layout：自动排布全部节点，args={}',
  '需要操作画布时，在回答中输出一个 XML 工具调用块（一次只一个）：',
  '<tool>',
  '{"tool":"工具名","args":{...}}',
  '</tool>',
  '规则：每次只输出一个工具调用块；不需要操作画布时直接给最终回答，不要输出工具块；JSON 必须合法。',
  ...ENV_TOOL_LINES,
  ...EXT_TOOL_LINES,
  '',
  '【工作流搭建任务】当用户要求"搭/生成/创建/建一条工作流/流程/链路/管线"时，按以下标准动作执行：',
  '1) 先规划节点链：第一个通常是 prompt 节点（承载用户灵感/主题文本），其后按需要接 llm（润色/扩展文案）、image（生图）、video（生视频）、music（配乐）等。',
  '2) 用 add_node 逐个创建节点（建议每步只建一个，text 填上该节点要做什么）。',
  '3) 用 connect 把节点串成链路：source 是上游、target 是下游（数据从上游流向下游）。例如 prompt→image→video。',
  '4) 用 auto_layout 把节点自动排布整齐。',
  '5) 链路搭好后，可调用 run_all 一键按依赖顺序运行全部节点；若只想先搭不跑，则直接给出最终说明（不要再加工具调用块）。',
  '注意：add_node 的 type 用节点 id（prompt/llm/image/video/music/agent）；connect 的 source/target 用 add_node 返回的节点 id。每步只输出一个 <tool> 块，工具执行结果里会回显节点 id，请据此串联。',
].join('\n')

// 从 LLM 输出中解析 <tool> 工具调用块；解析失败视为最终回答，不中断流程。
function parseToolCall(text: string): AgentToolCall | null {
  const m = text.match(/<tool>\s*([\s\S]*?)\s*<\/tool>/)
  if (!m) return null
  try {
    const obj = JSON.parse(m[1])
    if (obj && typeof obj.tool === 'string' && obj.args && typeof obj.args === 'object') {
      return { tool: obj.tool, args: obj.args as Record<string, unknown> }
    }
  } catch {
    /* 解析失败 → 视为最终回答 */
  }
  return null
}

function strArg(args: Record<string, unknown>, key: string, fallback = ''): string {
  const v = args[key]
  return typeof v === 'string' ? v : fallback
}

// 执行单个工具调用：把 Agent 的决策落到画布上。run_node 是异步（可能涉及生图/生视频/生音乐）。
async function executeTool(call: AgentToolCall, deps: AgentDeps): Promise<string> {
  const c = deps.canvas
  switch (call.tool) {
    case 'add_node': {
      const type = strArg(call.args, 'type')
      const text = strArg(call.args, 'text')
      const r = c.addNode(type, text || undefined)
      if (!r.ok) return `❌ add_node 失败：${r.error}`
      return `✅ 已新增节点 ${r.nodeId}（类型 ${type}）`
    }
    case 'run_node': {
      const id = strArg(call.args, 'id')
      const r = await c.runNode(id)
      if (!r.ok) return `❌ run_node(${id}) 失败：${r.error}`
      return `✅ run_node(${id}) 完成：${r.result ?? ''}`
    }
    case 'list_nodes': {
      const list = c.listNodes()
      if (list.length === 0) return '当前画布没有任何节点。'
      return list
        .map((n) => `- ${n.id} [${n.type}] ${n.label} ${n.hasOutput ? '(已产出)' : '(空)'}`)
        .join('\n')
    }
    case 'get_node_text': {
      const id = strArg(call.args, 'id')
      const t = c.getNodeText(id)
      return t ? `节点 ${id} 文本：${t}` : `节点 ${id} 没有文本。`
    }
    case 'delete_node': {
      const id = strArg(call.args, 'id')
      const r = c.deleteNode(id)
      return r.ok ? `✅ 已删除节点 ${id}` : `❌ delete_node 失败：${r.error}`
    }
    case 'connect': {
      const source = strArg(call.args, 'source')
      const target = strArg(call.args, 'target')
      const r = c.connect(source, target)
      return r.ok ? `✅ 已连线 ${source} → ${target}` : `❌ connect 失败：${r.error}`
    }
    case 'disconnect': {
      const source = strArg(call.args, 'source')
      const target = strArg(call.args, 'target')
      const r = c.disconnect(source, target)
      return r.ok ? `✅ 已断开 ${source} → ${target}` : `❌ disconnect 失败：${r.error}`
    }
    case 'run_all': {
      const r = await c.runAll()
      return r.ok ? `✅ ${r.result ?? '已全部运行'}` : `❌ run_all 失败：${r.error}`
    }
    case 'undo': {
      const r = c.undo()
      return r.ok ? `✅ 已撤销` : `❌ undo 失败：${r.error}`
    }
    case 'redo': {
      const r = c.redo()
      return r.ok ? `✅ 已重做` : `❌ redo 失败：${r.error}`
    }
    case 'save_template': {
      const name = strArg(call.args, 'name')
      const r = c.saveTemplate(name)
      return r.ok ? `✅ 已存为模板：${name}` : `❌ save_template 失败：${r.error}`
    }
    case 'apply_template': {
      const name = strArg(call.args, 'name')
      const r = c.applyTemplate(name)
      return r.ok ? `✅ ${r.result ?? '已套用模板'}：${name}` : `❌ apply_template 失败：${r.error}`
    }
    case 'copy_node': {
      const id = strArg(call.args, 'id')
      const r = c.copyNode(id)
      return r.ok ? `✅ 已复制节点 ${id} → ${r.nodeId}` : `❌ copy_node 失败：${r.error}`
    }
    case 'auto_layout': {
      const r = c.autoLayout()
      return r.ok ? `✅ ${r.result ?? '已自动布局'}` : `❌ auto_layout 失败：${r.error}`
    }
    // ---- S2.14 环境组（fs / net / terminal / api 共 16 项） ----
    case 'read_file':
      return await deps.env.readFile(strArg(call.args, 'path'))
    case 'write_file':
      return await deps.env.writeFile(strArg(call.args, 'path'), strArg(call.args, 'content'))
    case 'glob':
      return await deps.env.glob(strArg(call.args, 'pattern'), strArg(call.args, 'cwd') || undefined)
    case 'grep':
      return await deps.env.grep(strArg(call.args, 'pattern'), strArg(call.args, 'cwd') || undefined)
    case 'list_dir':
      return await deps.env.listDir(strArg(call.args, 'path'))
    case 'web_search':
      return await deps.env.webSearch(strArg(call.args, 'query'))
    case 'web_fetch':
      return await deps.env.webFetch(strArg(call.args, 'url'))
    case 'run_bash':
      return await deps.env.runBash(strArg(call.args, 'cmd'))
    case 'spawn_subagent':
      return await deps.env.spawnSubagent(strArg(call.args, 'task'))
    case 'kill_task':
      return await deps.env.killTask(strArg(call.args, 'id'))
    case 'list_sessions':
      return await deps.env.listSessions()
    case 'new_session':
      return await deps.env.newSession()
    case 'read_config':
      return await deps.env.readConfig()
    case 'set_config':
      return await deps.env.setConfig(strArg(call.args, 'key'), strArg(call.args, 'value'))
    case 'test_connection':
      return await deps.env.testConnection(strArg(call.args, 'providerId'))
    case 'list_providers':
      return await deps.env.listProviders()
    // ---- S3.2 扩展组（音乐 5 + 项目 3 + 系统 4 共 12 项 P1） ----
    case 'music_pause':
      return await deps.env.musicControl('pause')
    case 'music_stop':
      return await deps.env.musicControl('stop')
    case 'music_list_tracks':
      return await deps.env.musicControl('list_tracks')
    case 'music_set_tempo':
      return await deps.env.musicControl('set_tempo', { rate: Number(String(call.args.rate ?? 1)) })
    case 'music_mix':
      return await deps.env.musicControl('mix')
    case 'new_project':
      return c.newProject().ok ? '✅ 已新建空白工程' : '❌ new_project 失败'
    case 'open_project': {
      const r = c.openProject()
      return r.ok ? `✅ ${r.result ?? '已打开工程'}` : `❌ open_project 失败：${r.error}`
    }
    case 'save_project': {
      const r = c.saveProject()
      return r.ok ? `✅ ${r.result ?? '已保存工程'}` : '❌ save_project 失败'
    }
    case 'notify':
      return await deps.env.notify(strArg(call.args, 'msg'))
    case 'open_url':
      return await deps.env.openUrl(strArg(call.args, 'url'))
    case 'clipboard_read':
      return await deps.env.clipboard('read')
    case 'clipboard_write':
      return await deps.env.clipboard('write', strArg(call.args, 'text'))
    // ---- S3.6 P2 转正（即梦 9 + 杂项 2） ----
    case 'dreamina_generate_video': {
      const r = await dreaminaGenerateVideo(getKey('volcano') || deps.apiKey, strArg(call.args, 'prompt'))
      return r ? `✅ 即梦文生视频完成：${r}` : '❌ 生成失败'
    }
    case 'dreamina_generate_image': {
      const r = await dreaminaGenerateImage(getKey('volcano') || deps.apiKey, strArg(call.args, 'prompt'))
      return r ? `✅ 即梦文生图完成：${r}` : '❌ 生成失败'
    }
    case 'dreamina_extend': {
      const r = await dreaminaExtend(getKey('volcano') || deps.apiKey, strArg(call.args, 'prompt'), strArg(call.args, 'image') || undefined)
      return r ? `✅ 即梦扩图完成：${r}` : '❌ 扩图失败'
    }
    case 'dreamina_lip_sync':
      return await dreaminaLipSync(getKey('dreamina'), strArg(call.args, 'video'), strArg(call.args, 'audio'))
    case 'dreamina_digital_human':
      return await dreaminaDigitalHuman(getKey('dreamina'), strArg(call.args, 'prompt'))
    case 'dreamina_smart_canvas':
      return await dreaminaSmartCanvas(getKey('dreamina'), strArg(call.args, 'prompt'))
    case 'dreamina_template':
      return await dreaminaTemplate(getKey('dreamina'), strArg(call.args, 'templateId'))
    case 'dreamina_camera_motion':
      return await dreaminaCameraMotion(getKey('dreamina'), strArg(call.args, 'video'), strArg(call.args, 'motion'))
    case 'dreamina_asset_search':
      return await dreaminaAssetSearch(getKey('dreamina'), strArg(call.args, 'query'))
    case 'start_timer':
      return await startTimer(Number(String(call.args.seconds ?? 30)), strArg(call.args, 'msg'))
    case 'screenshot': {
      try {
        const url = await screenshot()
        return `✅ 截屏完成：${url.slice(0, 60)}…（dataURL，请在支持的环境查看）`
      } catch (e) {
        return `❌ 截屏失败：${(e as Error).message}`
      }
    }
    default:
      return `❌ 未知工具：${call.tool}（可用 51 个：画布组 add_node/delete_node/connect/disconnect/run_node/run_all/undo/redo/save_template/apply_template/copy_node/auto_layout/new_project/open_project/save_project；环境组 read_file/write_file/glob/grep/list_dir/web_search/web_fetch/run_bash/spawn_subagent/kill_task/list_sessions/new_session/read_config/set_config/test_connection/list_providers；扩展组 music_pause/music_stop/music_list_tracks/music_set_tempo/music_mix/notify/open_url/clipboard_read/clipboard_write；P2 组 dreamina_generate_video/dreamina_generate_image/dreamina_extend/dreamina_lip_sync/dreamina_digital_human/dreamina_smart_canvas/dreamina_template/dreamina_camera_motion/dreamina_asset_search/start_timer/screenshot）`
  }
}

// Agent 主循环：调 LLM → 解析工具调用 → 执行 → 回灌结果 → 再调，直到无工具调用或达步数上限。
export async function runAgentLoop(
  deps: AgentDeps,
  instruction: string,
  handlers: AgentHandlers,
): Promise<void> {
  const maxSteps = deps.maxSteps ?? 14
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: instruction },
  ]
  try {
    // 按 providerRouter 选择 text 服务商（DeepSeek 优先）
    const textProvider = selectProvider('text')
    if (!textProvider) throw new Error('没有可用的 LLM 服务商')
    const textKey = getKey(textProvider.id)
    if (!textKey) throw new Error(`请先在设置中填写 ${textProvider.name} 的 API Key 并解锁`)
    const isDeepSeek = textProvider.id === 'deepseek'
    const textModel = isDeepSeek
      ? (getKey('deepseek_model') || DEEPSEEK_CHAT_MODEL)
      : (deps.model || DOUBAO_CHAT_MODEL)

    for (let step = 0; step < maxSteps; step++) {
      if (deps.signal?.aborted) throw new DOMException('Agent 已取消', 'AbortError')
      let raw = ''
      const streamHandlers = {
        onThink: (d: string) => handlers.onThink?.(d),
        onText: (d: string) => {
          raw += d
          handlers.onText?.(d)
        },
      }
      if (isDeepSeek) {
        await deepseekChatStream(textKey, messages, streamHandlers, textModel, deps.signal)
      } else {
        await volcanoChatStream(textKey, messages, streamHandlers, textModel, deps.signal)
      }
      // 剥离 <think> 标签（兜底；流式已优先走 reasoning_content），用于逻辑判断与回灌
      const clean = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
      const call = parseToolCall(clean)
      if (!call) {
        handlers.onFinal?.(clean)
        return
      }
      if (deps.signal?.aborted) throw new DOMException('Agent 已取消', 'AbortError')
      const result = await executeTool(call, deps)
      handlers.onTool?.(call, result)
      messages.push({ role: 'assistant', content: clean })
      messages.push({
        role: 'user',
        content: `工具 ${call.tool} 执行结果：\n${result}\n\n请继续。若任务已完成，直接给出最终回答（不要再加工具调用块）。`,
      })
    }
    handlers.onFinal?.('（已达最大步数，Agent 停止）')
  } catch (e) {
    if ((e as Error).name === 'AbortError') handlers.onCancel?.()
    else handlers.onError?.((e as Error).message)
  }
}
