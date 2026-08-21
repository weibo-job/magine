// S2.1 本地加密保险库（BYOK，依据 D3 纯本地优先）
// 方案：Web Crypto AES-GCM-256；主口令经 PBKDF2(SHA-256, 100k) 派生密钥
// 存储：localStorage 仅存密文（明文 API Key 永不落盘）。预留 Electron 文件存读接口。

const VAULT_KEY = 'magine.vault.v1'
const PBKDF2_ITER = 100000

export interface CustomProvider {
  id: string
  name: string
  baseUrl?: string
  capabilities: string[]
}

export interface VaultData {
  keys: Record<string, string> // providerId -> 明文 apiKey（仅内存）
  customProviders: CustomProvider[]
}

interface VaultBlob {
  v: 1
  salt: string // base64
  iv: string // base64
  ct: string // base64
}

// TS 5.7+ 中 Uint8Array 带 ArrayBufferLike 泛型，不满足 crypto 的 BufferSource 约束；
// 用运行时无副作用的断言桥接，保证跨 TS 版本编译通过。
function buf(u: Uint8Array): BufferSource {
  return u as unknown as BufferSource
}

function bufToB64(u: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < u.length; i++) bin += String.fromCharCode(u[i])
  return btoa(bin)
}
function b64ToBuf(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const baseKey = await crypto.subtle.importKey(
    'raw',
    buf(enc.encode(password)),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: buf(salt), iterations: PBKDF2_ITER, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export function isVaultInitialized(): boolean {
  return localStorage.getItem(VAULT_KEY) !== null
}

export async function createVault(password: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt)
  const empty: VaultData = { keys: {}, customProviders: [] }
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: buf(iv) },
    key,
    buf(new TextEncoder().encode(JSON.stringify(empty))),
  )
  const blob: VaultBlob = {
    v: 1,
    salt: bufToB64(salt),
    iv: bufToB64(iv),
    ct: bufToB64(new Uint8Array(ct)),
  }
  localStorage.setItem(VAULT_KEY, JSON.stringify(blob))
}

export async function unlockVault(password: string): Promise<VaultData> {
  const raw = localStorage.getItem(VAULT_KEY)
  if (!raw) throw new Error('保险库未初始化，请先创建主口令')
  const blob = JSON.parse(raw) as VaultBlob
  const key = await deriveKey(password, b64ToBuf(blob.salt))
  let plain: ArrayBuffer
  try {
    plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: buf(b64ToBuf(blob.iv)) },
      key,
      buf(b64ToBuf(blob.ct)),
    )
  } catch {
    throw new Error('主口令错误')
  }
  return JSON.parse(new TextDecoder().decode(plain)) as VaultData
}

export async function saveVault(password: string, data: VaultData): Promise<void> {
  // 复用已存在的 salt，保证同一口令可解锁历史数据
  const raw = localStorage.getItem(VAULT_KEY)
  const salt = raw
    ? b64ToBuf((JSON.parse(raw) as VaultBlob).salt)
    : crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt)
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: buf(iv) },
    key,
    buf(new TextEncoder().encode(JSON.stringify(data))),
  )
  const blob: VaultBlob = {
    v: 1,
    salt: bufToB64(salt),
    iv: bufToB64(iv),
    ct: bufToB64(new Uint8Array(ct)),
  }
  localStorage.setItem(VAULT_KEY, JSON.stringify(blob))
}

// —— S2.1 无密码模式（本地单机便利）：用应用内置静态口令派生密钥 ——
// 落盘仍是 AES-GCM 密文（满足 D3 明文 Key 永不落盘）；用户无需记口令、无需解锁。
// 安全边界：仅防"明文 Key 直接躺在磁盘"，不防"拿到本机文件的人"——属本地单机可接受取舍。
const STATIC_PASSPHRASE = 'magine-local-static-vault-v1'

export async function saveVaultStatic(data: VaultData): Promise<void> {
  return saveVault(STATIC_PASSPHRASE, data)
}

export async function loadVaultStatic(): Promise<VaultData | null> {
  if (!isVaultInitialized()) return null
  try {
    return await unlockVault(STATIC_PASSPHRASE)
  } catch {
    return null
  }
}

// S2.1 向后兼容：旧版用「用户主口令」加密的数据，在无密码版下解不开。
// 提供迁移入口——用户输入原主口令解锁，重新以静态口令加密保存，救回 Key。
export async function migrateVault(oldPassword: string): Promise<boolean> {
  if (!isVaultInitialized()) return false
  try {
    const d = await unlockVault(oldPassword) // 用旧主口令解开历史数据
    await saveVaultStatic(d) // 以静态口令重新加密保存
    return true
  } catch {
    return false
  }
}

