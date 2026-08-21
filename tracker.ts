// S2.16 主动交互埋点层：统一采集 idle / 复制 / 错误 / 可见性 等信号，
// 供 S2.17 的 15 场景状态机评估。与 UI 解耦（纯逻辑，renderer 环境运行）。

export interface TrackerState {
  sessionStart: number
  lastActive: number
  idleMs: number // 距上次活动的毫秒数（每次 sample 刷新）
  copyCount: number // 近 60s 内的复制/粘贴次数
  copyWindowStart: number
  errorCount: number // 会话累计 JS 错误数
  visible: boolean
  returnedFromHidden: boolean // 本 tick 内由 hidden -> visible（一次性，sample 后消费）
  now: number
}

export class InteractionTracker {
  private state: TrackerState
  private onActivity = () => {
    this.state.lastActive = Date.now()
  }
  private onCopy = () => {
    const now = Date.now()
    if (now - this.state.copyWindowStart > 60_000) {
      this.state.copyWindowStart = now
      this.state.copyCount = 0
    }
    this.state.copyCount++
  }
  private onError = () => {
    this.state.errorCount++
  }
  private onVis = () => {
    const v = document.visibilityState === 'visible'
    if (v && !this.state.visible) this.state.returnedFromHidden = true
    this.state.visible = v
  }

  constructor() {
    this.state = {
      sessionStart: Date.now(),
      lastActive: Date.now(),
      idleMs: 0,
      copyCount: 0,
      copyWindowStart: Date.now(),
      errorCount: 0,
      visible: typeof document !== 'undefined' ? document.visibilityState === 'visible' : true,
      returnedFromHidden: false,
      now: Date.now(),
    }
  }

  attach() {
    if (typeof window === 'undefined') return
    window.addEventListener('mousemove', this.onActivity, { passive: true })
    window.addEventListener('keydown', this.onActivity, { passive: true })
    document.addEventListener('copy', this.onCopy)
    document.addEventListener('paste', this.onCopy)
    window.addEventListener('error', this.onError)
    document.addEventListener('visibilitychange', this.onVis)
  }

  detach() {
    if (typeof window === 'undefined') return
    window.removeEventListener('mousemove', this.onActivity)
    window.removeEventListener('keydown', this.onActivity)
    document.removeEventListener('copy', this.onCopy)
    document.removeEventListener('paste', this.onCopy)
    window.removeEventListener('error', this.onError)
    document.removeEventListener('visibilitychange', this.onVis)
  }

  /** 每次评估前调用：刷新 idle/now，返回快照并消费一次性标志 */
  sample(): TrackerState {
    this.state.now = Date.now()
    this.state.idleMs = this.state.now - this.state.lastActive
    const snap: TrackerState = { ...this.state }
    this.state.returnedFromHidden = false
    return snap
  }
}
