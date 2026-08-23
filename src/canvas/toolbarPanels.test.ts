import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ASSISTANT_ACTIONS,
  WORKFLOW_PRESETS,
  createPromptNodeData,
  planWorkflow,
} from './toolbarPanels.ts'

test('助手快捷项提供现有工作流可直接预览的指令', () => {
  assert.ok(ASSISTANT_ACTIONS.length >= 5)
  assert.ok(ASSISTANT_ACTIONS.every((item) => item.prompt.trim().length > 0))
})

test('内置工作流预设覆盖图文、视频、营销和短剧', () => {
  const labels = WORKFLOW_PRESETS.map((item) => item.title).join(' ')
  assert.match(labels, /图文/)
  assert.match(labels, /视频/)
  assert.match(labels, /营销/)
  assert.match(labels, /短剧/)
})

test('资产提示词可以转换为可直接放入画布的 Prompt 节点数据', () => {
  assert.deepEqual(createPromptNodeData('商品卖点', '突出轻便与续航'), {
    kind: '提示词',
    nodeTypeId: 'prompt',
    label: '商品卖点',
    status: 'idle',
    text: '突出轻便与续航',
  })
})

test('抖音图文预设不会误带视频节点', () => {
  assert.deepEqual(planWorkflow('搭建抖音图文工作流，生成五张九比十六配图。'), {
    nodes: ['提示词', 'LLM 文案', '图像'],
    outputs: ['标题/正文', '竖版配图'],
  })
})

test('提示词润色预设只规划文本节点', () => {
  assert.deepEqual(planWorkflow('搭建提示词润色工作流，输出结构化提示词。'), {
    nodes: ['提示词', 'LLM'],
    outputs: ['结构化提示词'],
  })
})
