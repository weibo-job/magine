// S1.8 节点类型表（13 项，依据三注册表条目清单 §一）
import type { NodeType } from './types'

export const nodes: NodeType[] = [
  { id: 'prompt', name: '提示词', group: '核心', phase: 'P0', status: 'active', desc: '文本提示词输入节点' },
  { id: 'image', name: '图像', group: '核心', phase: 'P0', status: 'active', desc: 'AI 生图节点' },
  { id: 'edit', name: '图像编辑', group: '核心', phase: 'P0', status: 'active', desc: 'AI 图像后期编辑：局部重绘/扩图/换风格/打光/镜头/人像（复刻小云雀后期工具栏）' },
  { id: 'video', name: '视频', group: '核心', phase: 'P0', status: 'active', desc: 'AI 生视频节点' },
  { id: 'llm', name: '对话 / 大模型', group: '核心', phase: 'P0', status: 'active', desc: '大模型对话节点' },
  { id: 'agent', name: '智能体', group: '核心', phase: 'P0', status: 'active', desc: 'Agent 编排节点' },
  { id: 'music', name: '音乐 / 语音', group: '核心', phase: 'P0', status: 'active', desc: '音乐 / 语音生成节点' },
  { id: 'storyboard', name: '分镜', group: '基础', phase: 'P1', status: 'active', desc: '视频分镜节点（基础）' },
  { id: 'material', name: '素材', group: '基础', phase: 'P1', status: 'active', desc: '素材管理节点（基础）' },
  { id: 'region', name: '区域', group: '基础', phase: 'P1', status: 'active', desc: '局部重绘 / 区域节点（基础）' },
  { id: 'panorama', name: '全景', group: '扩展', phase: 'P2', status: 'active', desc: '全景图节点（Three.js 720° 查看器）' },
  { id: 'topaz', name: '画质增强', group: '扩展', phase: 'P2', status: 'active', desc: '画质增强节点（火山 AI + 本地兜底）' },
  { id: 'face', name: '人脸合规', group: '扩展', phase: 'P2', status: 'active', desc: '人脸合规节点（火山视觉理解）' },
]
