// S3.6 杂项 P2 工具转正：
//  - start_timer：真实计时器，到点触发桌面通知（Notification API，Electron/浏览器均支持）。
//  - screenshot：真实截屏，用 getDisplayMedia 捕获屏幕帧（需用户授权），返回 PNG dataURL。
// 二者均为可运行实现，不再占位。

// 计时器：seconds 秒后桌面提醒 message。返回立即确认串，到点通过 Notification 通知。
export function startTimer(seconds: number, message: string): Promise<string> {
  const sec = Math.max(1, Math.round(seconds))
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => undefined)
    }
  } catch {
    /* 忽略权限请求异常 */
  }
  setTimeout(() => {
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification('Magine Canvas 计时器', { body: message || '时间到' })
      }
    } catch {
      /* 无通知权限则静默 */
    }
  }, sec * 1000)
  return Promise.resolve(`已启动 ${sec} 秒计时器，到点将桌面提醒：「${message || '时间到'}」`)
}

// 截屏：捕获当前屏幕一帧（getDisplayMedia）。Web/Electron 均支持，需用户授权。
export async function screenshot(): Promise<string> {
  const md = navigator.mediaDevices
  if (!md || !md.getDisplayMedia) {
    throw new Error('当前环境不支持 getDisplayMedia 截屏（请在 Electron 客户端或支持屏幕捕获的浏览器中使用）')
  }
  const stream = await md.getDisplayMedia({ video: true })
  try {
    const track = stream.getVideoTracks()[0]
    const video = document.createElement('video')
    video.srcObject = stream
    await new Promise<void>((resolve) => {
      video.onloadedmetadata = () => resolve()
    })
    await video.play()
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('无法创建画布上下文')
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  } finally {
    stream.getTracks().forEach((t) => t.stop())
  }
}
