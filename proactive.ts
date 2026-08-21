// S2.17 主动交互 15 场景引擎（全接入、可实时打断）+ 满足 S3.4 调优要求（去重/冷却/一键关闭分类）。
// 纯逻辑：evaluate 拿到埋点快照 + 应用信号，命中即产出一条 Magic 提醒；引擎负责冷却去重。
import type { TrackerState } from './tracker'

/** Canvas 侧提供的应用信号（节点数 / 失败数 等），由调用方每 tick 构造 */
export interface AppSignals {
  nodeCount: number
  failedCount: number
  runningCount: number
  hasSaved: boolean
}

/** 一条主动提醒（推到 Magic 浮层） */
export interface MagicItem {
  id: string
  category: string // 用于"一键关闭某类"
  title: string
  body: string
  time: number
}

export interface SceneDef {
  id: string
  category: string
  cooldownMs: number
  title: string
  /** 命中返回文案，未命中返回 null */
  evaluate: (t: TrackerState, a: AppSignals) => string | null
}

const MIN = 60_000
const HOUR = 60 * MIN

// ===== 15 场景定义（PRD §7.2）=====
export const SCENES: SceneDef[] = [
  {
    id: 'late_night',
    category: 'care',
    cooldownMs: 4 * HOUR,
    title: '深夜关怀',
    evaluate: (t) => {
      const h = new Date(t.now).getHours()
      if ((h >= 23 || h < 5) && t.idleMs < 3 * MIN) return '夜深了，创作不急于这一刻，注意休息 🌙'
      return null
    },
  },
  {
    id: 'consecutive_error',
    category: 'troubleshoot',
    cooldownMs: 30 * MIN,
    title: '连续错误主动排查',
    evaluate: (t) => {
      if (t.errorCount >= 3) return `检测到连续 ${t.errorCount} 次运行错误，要我帮你看下配置或节点状态吗？`
      return null
    },
  },
  {
    id: 'high_freq_copy',
    category: 'material',
    cooldownMs: HOUR,
    title: '高频复制提醒',
    evaluate: (t) => {
      if (t.copyCount >= 8) return '复制很频繁，要不要我把这些素材整理进一个「素材」节点，方便复用？'
      return null
    },
  },
  {
    id: 'layered_idle',
    category: 'suggest',
    cooldownMs: 20 * MIN,
    title: '分层空闲建议',
    evaluate: (t, a) => {
      if (a.nodeCount > 0 && t.idleMs > 5 * MIN && a.runningCount === 0)
        return '画布有点安静，要不要试「一键示例流程」快速看效果？'
      return null
    },
  },
  {
    id: 'return_report',
    category: 'report',
    cooldownMs: 30 * MIN,
    title: '归来汇报进度',
    evaluate: (t, a) => {
      if (t.returnedFromHidden && a.nodeCount > 0)
        return `欢迎回来！画布现有 ${a.nodeCount} 个节点，进度已自动保留。`
      return null
    },
  },
  {
    id: 'long_idle',
    category: 'report',
    cooldownMs: 30 * MIN,
    title: '长时间无操作提醒',
    evaluate: (t, a) => {
      if (t.idleMs > 10 * MIN && a.nodeCount > 0)
        return a.hasSaved ? '离开一会儿了，进度已自动保存，随时回来继续。' : '离开一会儿了，记得点工具栏「保存」以免丢失。'
      return null
    },
  },
  {
    id: 'gen_fail_retry',
    category: 'troubleshoot',
    cooldownMs: 15 * MIN,
    title: '生成失败重试建议',
    evaluate: (_t, a) => {
      if (a.failedCount > 0) return `有 ${a.failedCount} 个节点生成失败，可能是 Key 失效或网络问题，要我重试吗？`
      return null
    },
  },
  {
    id: 'quota_low',
    category: 'notify',
    cooldownMs: 6 * HOUR,
    title: '配额不足提醒',
    evaluate: () => {
      // 真机由网关回传剩余配额；当前占位不主动触发（保留接口）
      return null
    },
  },
  {
    id: 'new_model',
    category: 'notify',
    cooldownMs: 12 * HOUR,
    title: '新模型可用通知',
    evaluate: () => {
      // 真机由服务商注册表回传新模型；当前占位不触发（保留接口）
      return null
    },
  },
  {
    id: 'workflow_reuse',
    category: 'suggest',
    cooldownMs: 2 * HOUR,
    title: '工作流可复用提示',
    evaluate: (_t, a) => {
      if (a.nodeCount >= 5) return '这条流程节点完整，要不要存为「模板」一键复用？'
      return null
    },
  },
  {
    id: 'drag_lag',
    category: 'optimize',
    cooldownMs: HOUR,
    title: '拖拽卡顿优化建议',
    evaluate: (_t, a) => {
      if (a.nodeCount > 20) return '节点较多时拖拽可能卡顿，试试「自动布局」让画布更清爽。'
      return null
    },
  },
  {
    id: 'hotkey_teach',
    category: 'teach',
    cooldownMs: 3 * HOUR,
    title: '快捷键教学',
    evaluate: (t, a) => {
      if (a.nodeCount === 0 && t.now - t.sessionStart < 40_000)
        return '小技巧：顶部输入框「一句话搭工作流」；节点右侧圆点拖到下一节点左侧即可连线。'
      return null
    },
  },
  {
    id: 'inspire',
    category: 'suggest',
    cooldownMs: 45 * MIN,
    title: '灵感推荐',
    evaluate: (t, a) => {
      if (t.idleMs > 3 * MIN && a.nodeCount > 0)
        return '灵感：试试「星空 + 赛博朋克」主题生图，或「一只宇航员柴犬」做短视频。'
      return null
    },
  },
  {
    id: 'festival',
    category: 'care',
    cooldownMs: 24 * HOUR,
    title: '节日问候',
    evaluate: (t) => {
      const d = new Date(t.now)
      const md = `${d.getMonth() + 1}-${d.getDate()}`
      const map: Record<string, string> = {
        '1-1': '元旦快乐，新年新创作 🎉',
        '10-1': '国庆快乐，劳逸结合 🇨🇳',
        '12-25': '圣诞快乐 🎄',
        '2-14': '情人节快乐 💗',
      }
      return map[md] ?? null
    },
  },
  {
    id: 'exit_save',
    category: 'report',
    cooldownMs: 0,
    title: '退出前保存确认',
    // 该场景由 beforeunload 单独触发，不进入 tick 轮询；evaluate 仍可用作文案生成
    evaluate: () => '退出前记得点工具栏「保存」，把画布进度留下来哦。',
  },
]

export class ProactiveEngine {
  private lastFired: Record<string, number> = {}

  constructor(private scenes: SceneDef[] = SCENES) {}

  /** 每 tick 调用：返回本次新触发的提醒（已过冷却且分类未被关闭） */
  tick(t: TrackerState, a: AppSignals, disabledCats: Set<string>): MagicItem[] {
    const now = t.now
    const out: MagicItem[] = []
    for (const s of this.scenes) {
      if (s.cooldownMs === 0) continue // 退出前保存由 beforeunload 触发，不轮询
      if (disabledCats.has(s.category)) continue
      const last = this.lastFired[s.id] ?? 0
      if (now - last < s.cooldownMs) continue
      const body = s.evaluate(t, a)
      if (body) {
        this.lastFired[s.id] = now
        out.push({ id: `${s.id}-${now}`, category: s.category, title: s.title, body, time: now })
      }
    }
    return out
  }

  /** 退出前保存确认：直接生成一条（不受冷却约束） */
  exitPrompt(): MagicItem {
    return {
      id: `exit_save-${Date.now()}`,
      category: 'report',
      title: '退出前保存确认',
      body: '退出前记得点工具栏「保存」，把画布进度留下来哦。',
      time: Date.now(),
    }
  }

  /** 由 Magic 浮层"不再提醒某类"调用 */
  disableCategory(cat: string, disabledCats: Set<string>) {
    disabledCats.add(cat)
  }
}
