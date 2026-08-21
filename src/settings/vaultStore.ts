// S2.4 全局保险库单例：解锁后供画布节点等运行时读取 Key（明文仅驻内存，不落盘）
import type { VaultData } from './keyVault'

let current: VaultData | null = null

export function setVault(d: VaultData): void {
  current = d
}
export function getVault(): VaultData | null {
  return current
}
export function getKey(providerId: string): string {
  return current?.keys[providerId] ?? ''
}
