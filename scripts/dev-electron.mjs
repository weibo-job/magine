import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const electronBinary = require('electron')
const vite = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dev', '--', '--host', '127.0.0.1'], {
  stdio: 'inherit',
  shell: false,
})

const url = 'http://127.0.0.1:5173/'
let ready = false
for (let attempt = 0; attempt < 40 && !ready; attempt += 1) {
  try {
    await fetch(url)
    ready = true
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
}

if (!ready) {
  vite.kill()
  throw new Error('Vite 开发服务启动失败，请先检查 npm run dev 的输出。')
}

const userDataDir = process.env.MAGINE_ELECTRON_USER_DATA_DIR || path.join(process.cwd(), '.magine-runtime')
const electronArgs = [process.cwd(), `--user-data-dir=${userDataDir}`]
const electron = spawn(electronBinary, electronArgs, {
  stdio: 'inherit',
  env: { ...process.env, VITE_DEV_SERVER_URL: url },
})

const stop = () => {
  if (!vite.killed) vite.kill()
}
electron.on('exit', (code, signal) => {
  stop()
  process.exit(code ?? (signal ? 1 : 0))
})
process.on('SIGINT', () => { electron.kill('SIGINT'); stop() })
process.on('SIGTERM', () => { electron.kill('SIGTERM'); stop() })
