// S1.8 工具表（57 项 · 9 类，依据三注册表条目清单 §二）
import type { Tool } from './types'

export const tools: Tool[] = [
  // 2.1 canvas 画布（12，P0，real）
  { id: 'add_node', name: '添加节点', group: 'canvas', phase: 'P0', impl: 'real', step: 'S2.13', desc: '在画布添加节点' },
  { id: 'delete_node', name: '删除节点', group: 'canvas', phase: 'P0', impl: 'real', step: 'S2.13', desc: '删除画布节点' },
  { id: 'connect', name: '连线', group: 'canvas', phase: 'P0', impl: 'real', step: 'S2.13', desc: '连接两个节点' },
  { id: 'disconnect', name: '断连', group: 'canvas', phase: 'P0', impl: 'real', step: 'S2.13', desc: '断开节点连线' },
  { id: 'run_node', name: '运行单节点', group: 'canvas', phase: 'P0', impl: 'real', step: 'S2.13', desc: '运行单个节点' },
  { id: 'run_all', name: '运行全部', group: 'canvas', phase: 'P0', impl: 'real', step: 'S2.13', desc: '运行全部节点' },
  { id: 'undo', name: '撤销', group: 'canvas', phase: 'P0', impl: 'real', step: 'S2.13', desc: '撤销操作' },
  { id: 'redo', name: '重做', group: 'canvas', phase: 'P0', impl: 'real', step: 'S2.13', desc: '重做操作' },
  { id: 'save_template', name: '存为模板', group: 'canvas', phase: 'P0', impl: 'real', step: 'S2.13', desc: '存为工作流模板' },
  { id: 'apply_template', name: '套用模板', group: 'canvas', phase: 'P0', impl: 'real', step: 'S2.13', desc: '套用工作流模板' },
  { id: 'copy_node', name: '复制节点', group: 'canvas', phase: 'P0', impl: 'real', step: 'S2.13', desc: '复制节点' },
  { id: 'auto_layout', name: '自动布局', group: 'canvas', phase: 'P0', impl: 'real', step: 'S2.13', desc: '自动排布节点' },

  // 2.2 fs 文件（5，P0，real）
  { id: 'read_file', name: '读文件', group: 'fs', phase: 'P0', impl: 'real', step: 'S2.14', desc: '读取本地文件' },
  { id: 'write_file', name: '写文件', group: 'fs', phase: 'P0', impl: 'real', step: 'S2.14', desc: '写入本地文件' },
  { id: 'glob', name: '模式匹配', group: 'fs', phase: 'P0', impl: 'real', step: 'S2.14', desc: '按模式匹配文件' },
  { id: 'grep', name: '内容搜索', group: 'fs', phase: 'P0', impl: 'real', step: 'S2.14', desc: '搜索文件内容' },
  { id: 'list_dir', name: '列目录', group: 'fs', phase: 'P0', impl: 'real', step: 'S2.14', desc: '列出目录内容' },

  // 2.3 net 网络（2，P0，real）
  { id: 'web_search', name: '联网搜索', group: 'net', phase: 'P0', impl: 'real', step: 'S2.14', desc: '联网搜索' },
  { id: 'web_fetch', name: '抓取网页', group: 'net', phase: 'P0', impl: 'real', step: 'S2.14', desc: '抓取网页内容' },

  // 2.4 terminal 终端（5，P0，real）
  { id: 'run_bash', name: '跑命令', group: 'terminal', phase: 'P0', impl: 'real', step: 'S2.14', desc: '运行终端命令' },
  { id: 'spawn_subagent', name: '派生子代理', group: 'terminal', phase: 'P0', impl: 'real', step: 'S2.14', desc: '派生子代理任务' },
  { id: 'kill_task', name: '终止任务', group: 'terminal', phase: 'P0', impl: 'real', step: 'S2.14', desc: '终止运行中的任务' },
  { id: 'list_sessions', name: '列会话', group: 'terminal', phase: 'P0', impl: 'real', step: 'S2.14', desc: '列出会话' },
  { id: 'new_session', name: '新会话', group: 'terminal', phase: 'P0', impl: 'real', step: 'S2.14', desc: '新建会话' },

  // 2.5 api 配置（4，P0，real）
  { id: 'read_config', name: '读配置', group: 'api', phase: 'P0', impl: 'real', step: 'S2.14', desc: '读取配置' },
  { id: 'set_config', name: '写配置', group: 'api', phase: 'P0', impl: 'real', step: 'S2.14', desc: '写入配置' },
  { id: 'test_connection', name: '测试连通', group: 'api', phase: 'P0', impl: 'real', step: 'S2.14', desc: '测试服务商连通性' },
  { id: 'list_providers', name: '列服务商', group: 'api', phase: 'P0', impl: 'real', step: 'S2.14', desc: '列出已配置服务商' },

  // 2.6 music 音乐（9，P1，real 浅做）
  { id: 'music.generate', name: '生成音乐', group: 'music', phase: 'P1', impl: 'real', step: 'S3.2', desc: '生成背景音乐' },
  { id: 'music.pause', name: '暂停', group: 'music', phase: 'P1', impl: 'real', step: 'S3.2', desc: '暂停播放' },
  { id: 'music.stop', name: '停止', group: 'music', phase: 'P1', impl: 'real', step: 'S3.2', desc: '停止播放' },
  { id: 'music.list_tracks', name: '列音轨', group: 'music', phase: 'P1', impl: 'real', step: 'S3.2', desc: '列出音轨' },
  { id: 'music.set_tempo', name: '设节奏', group: 'music', phase: 'P1', impl: 'real', step: 'S3.2', desc: '设置节奏' },
  { id: 'music.mix', name: '混音', group: 'music', phase: 'P1', impl: 'real', step: 'S3.2', desc: '混音' },
  { id: 'music.tts', name: '文转语音', group: 'music', phase: 'P1', impl: 'real', step: 'S3.2', desc: '文本转语音' },
  { id: 'music.voice_clone', name: '声音克隆', group: 'music', phase: 'P1', impl: 'real', step: 'S3.2', desc: '声音克隆' },
  { id: 'music.lyrics', name: '歌词生成', group: 'music', phase: 'P1', impl: 'real', step: 'S3.2', desc: '生成歌词' },

  // 2.7 project 项目（3，P1，real 浅做）
  { id: 'project.new', name: '新建工程', group: 'project', phase: 'P1', impl: 'real', step: 'S3.2', desc: '新建工程' },
  { id: 'project.open', name: '打开工程', group: 'project', phase: 'P1', impl: 'real', step: 'S3.2', desc: '打开工程' },
  { id: 'project.save', name: '保存工程', group: 'project', phase: 'P1', impl: 'real', step: 'S3.2', desc: '保存工程' },

  // 2.8 misc 其他（6，P1×4 / P2×2）
  { id: 'notify', name: '通知', group: 'misc', phase: 'P1', impl: 'real', step: 'S3.2', desc: '发送通知' },
  { id: 'open_url', name: '打开链接', group: 'misc', phase: 'P1', impl: 'real', step: 'S3.2', desc: '打开外部链接' },
  { id: 'clipboard_read', name: '读剪贴板', group: 'misc', phase: 'P1', impl: 'real', step: 'S3.2', desc: '读取剪贴板' },
  { id: 'clipboard_write', name: '写剪贴板', group: 'misc', phase: 'P1', impl: 'real', step: 'S3.2', desc: '写入剪贴板' },
  { id: 'start_timer', name: '计时器', group: 'misc', phase: 'P2', impl: 'real', step: 'S3.6', desc: '计时器（到点桌面提醒）' },
  { id: 'screenshot', name: '截图', group: 'misc', phase: 'P2', impl: 'real', step: 'S3.6', desc: '截图（getDisplayMedia 截屏）' },

  // 2.9 dreamina 即梦（9，P2，real @ S3.6）视频/图/扩图路由火山真做；即梦独占能力走即梦开放平台端点（需即梦 Key）
  { id: 'dreamina.generate_video', name: '文生视频', group: 'dreamina', phase: 'P2', impl: 'real', step: 'S3.6', desc: '即梦文生视频（路由火山 Seedance）' },
  { id: 'dreamina.generate_image', name: '文生图', group: 'dreamina', phase: 'P2', impl: 'real', step: 'S3.6', desc: '即梦文生图（路由火山 Seedream）' },
  { id: 'dreamina.lip_sync', name: '对口型', group: 'dreamina', phase: 'P2', impl: 'real', step: 'S3.6', desc: '即梦对口型（需即梦 Key）' },
  { id: 'dreamina.digital_human', name: '数字人', group: 'dreamina', phase: 'P2', impl: 'real', step: 'S3.6', desc: '即梦数字人（需即梦 Key）' },
  { id: 'dreamina.smart_canvas', name: '智能画布', group: 'dreamina', phase: 'P2', impl: 'real', step: 'S3.6', desc: '即梦智能画布（需即梦 Key）' },
  { id: 'dreamina.template', name: '模板套用', group: 'dreamina', phase: 'P2', impl: 'real', step: 'S3.6', desc: '即梦模板套用（需即梦 Key）' },
  { id: 'dreamina.extend', name: '扩图/扩视频', group: 'dreamina', phase: 'P2', impl: 'real', step: 'S3.6', desc: '即梦扩图/扩视频（火山 Seedream 图生图）' },
  { id: 'dreamina.camera_motion', name: '运镜控制', group: 'dreamina', phase: 'P2', impl: 'real', step: 'S3.6', desc: '即梦运镜控制（需即梦 Key）' },
  { id: 'dreamina.asset_search', name: '素材搜索', group: 'dreamina', phase: 'P2', impl: 'real', step: 'S3.6', desc: '即梦素材搜索（需即梦 Key）' },
]
