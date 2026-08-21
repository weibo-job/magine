// S2.1 模型密钥配置中心（BYOK + 本地加密）+ S2.2 路由预览 + S2.4 解锁写入全局 vault
// 分模态 Tab（图/画质/视频/LLM）+ 预设（火山 Seedream / MiniMax / OpenAI）+ 自定义；
// Key 经 keyVault 本地加密读写，明文不上云；顶部展示网关默认路由（S2.2）。
import { useState, useEffect } from 'react'
import { providers } from '../registry/providers'
import { defaultRouteTable } from '../gateway/providerRouter'
import {
  isVaultInitialized,
  loadVaultStatic,
  saveVaultStatic,
  migrateVault,
  type VaultData,
  type CustomProvider,
} from './keyVault'
import { setVault } from './vaultStore'
import ChatTest from '../gateway/ChatTest'
import { deepseekChat, DEEPSEEK_CHAT_MODEL } from '../gateway/deepseek'

const TABS: { key: string; label: string }[] = [
  { key: 'image', label: '图' },
  { key: 'enhance', label: '画质' },
  { key: 'video', label: '视频' },
  { key: 'text', label: 'LLM' },
]

export default function ConfigCenter() {
  const [data, setData] = useState<VaultData>({ keys: {}, customProviders: [] })
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('image')
  const [show, setShow] = useState<Record<string, boolean>>({})
  const [saved, setSaved] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customCaps, setCustomCaps] = useState('')
  // 旧版（用户主口令加密）数据待迁移标记
  const [legacy, setLegacy] = useState(false)
  const [legacyPw, setLegacyPw] = useState('')
  const [legacyErr, setLegacyErr] = useState('')
  const [diag, setDiag] = useState<'idle' | 'running' | 'ok' | 'error'>('idle')
  const [diagMessage, setDiagMessage] = useState('')

  // S2.1：免密码加载（静态密钥解密），进入即编辑，无需解锁
  useEffect(() => {
    let mounted = true
    loadVaultStatic().then((d) => {
      if (!mounted) return
      if (d) {
        setData(d)
        setVault(d) // S2.4：写入全局 vault，供画布 LLM 节点读取 Key
      } else if (isVaultInitialized()) {
        // 有 blob 但静态口令解不开 → 旧主口令加密数据，提示迁移
        setLegacy(true)
      } else {
        const empty: VaultData = { keys: {}, customProviders: [] }
        setData(empty)
        setVault(empty)
      }
    })
    return () => {
      mounted = false
    }
  }, [])

  async function handleMigrate() {
    const ok = await migrateVault(legacyPw)
    if (ok) {
      const d = await loadVaultStatic()
      const v = d ?? { keys: {}, customProviders: [] }
      setData(v)
      setVault(v)
      setLegacy(false)
      setSaved(true)
    } else {
      setLegacyErr('原主口令错误，无法解锁旧数据')
    }
  }

  function skipMigrate() {
    const empty: VaultData = { keys: {}, customProviders: [] }
    setLegacy(false)
    setData(empty)
    setVault(empty)
  }

  function setKey(id: string, val: string) {
    setData((d) => {
      const next = { ...d, keys: { ...d.keys, [id]: val } }
      // S2.4 修复：输入即同步到全局 current，画布节点无需等"保存全部"就能读到
      setVault(next)
      return next
    })
    setSaved(false)
  }

  async function handleSave() {
    try {
      await saveVaultStatic(data)
      setVault(data)
      setSaved(true)
    } catch (e) {
      setError('保存失败：' + (e as Error).message)
    }
  }

  async function diagnoseDeepSeek() {
    const key = data.keys['deepseek'] || ''
    if (!key) {
      setDiag('error')
      setDiagMessage('尚未填写 DeepSeek API Key')
      return
    }
    setDiag('running')
    setDiagMessage('正在连接 DeepSeek…')
    try {
      const reply = await deepseekChat(
        key,
        [{ role: 'user', content: '请只回复：DeepSeek 连接正常' }],
        data.keys['deepseek_model'] || DEEPSEEK_CHAT_MODEL,
      )
      setDiag('ok')
      setDiagMessage(`连接正常：${reply.trim().slice(0, 80)}`)
    } catch (e) {
      setDiag('error')
      setDiagMessage((e as Error).message)
    }
  }

  function openAddCustom() {
    setCustomName('')
    setCustomCaps(activeTab)
    setShowAdd(true)
  }

  function confirmAddCustom() {
    const name = customName.trim()
    if (!name) return
    const id = 'custom_' + Date.now().toString(36)
    const cp: CustomProvider = {
      id,
      name,
      capabilities: customCaps
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    }
    setData((d) => ({ ...d, customProviders: [...d.customProviders, cp] }))
    setSaved(false)
    setShowAdd(false)
  }

  function removeCustom(id: string) {
    setData((d) => {
      const keys = { ...d.keys }
      delete keys[id]
      return {
        keys,
        customProviders: d.customProviders.filter((p) => p.id !== id),
      }
    })
    setSaved(false)
  }

  const presetInTab = providers.filter((p) => p.capabilities.includes(activeTab))
  const customInTab = data.customProviders.filter((p) => p.capabilities.includes(activeTab))

  const renderRow = (
    id: string,
    name: string,
    phaseTag?: string,
    onRemove?: () => void,
  ) => (
    <div className="cc-row" key={id}>
      <div className="cc-row-name">
        {name}
        {phaseTag && <span className="nl-phase">{phaseTag}</span>}
      </div>
      <div className="cc-row-input">
        <input
          className="cc-input cc-input-inline"
          type={show[id] ? 'text' : 'password'}
          placeholder="粘贴 API Key"
          value={data.keys[id] || ''}
          onChange={(e) => setKey(id, e.target.value)}
        />
        <button
          className="cc-eye"
          onClick={() => setShow((s) => ({ ...s, [id]: !s[id] }))}
        >
          {show[id] ? '隐藏' : '显示'}
        </button>
        {onRemove && (
          <button className="cc-remove" onClick={onRemove} title="删除该服务商">
            删除
          </button>
        )}
      </div>
    </div>
  )

  return (
      <div className="cc">
      {legacy && (
        <div className="cc-migrate">
          <div className="cc-migrate-title">检测到旧版加密密钥库</div>
          <div className="cc-migrate-sub">
            你之前设置过主口令，已保存的 Key 现在用免密码模式读不出来。
            输入<b>原主口令</b>即可把 Key 迁移回来（不会丢失）：
          </div>
          <input
            className="cc-input"
            type="password"
            placeholder="原主口令"
            value={legacyPw}
            onChange={(e) => setLegacyPw(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleMigrate()}
          />
          {legacyErr && <div className="cc-error">{legacyErr}</div>}
          <div className="cc-migrate-actions">
            <button className="ghost-btn" onClick={skipMigrate}>
              不用了，重新填
            </button>
            <button className="primary-btn" onClick={handleMigrate}>
              迁移并解锁
            </button>
          </div>
        </div>
      )}
      <div className="cc-head">
        <div>
          <div className="cc-title">模型密钥配置</div>
          <div className="cc-sub">本地 AES-GCM 加密保存，明文 Key 不上云（依据 D3 纯本地）</div>
        </div>
      </div>

      {/* S2.2 网关默认路由预览：能力 → 服务商（火山优先、OpenAI 备选） */}
      <div className="cc-route">
        {Object.entries(defaultRouteTable()).map(([cap, name]) => (
          <span key={cap} className="cc-route-item">
            <b>{cap}</b> → {name}
          </span>
        ))}
      </div>

      <div className="cc-tabs">
        {TABS.map((t) => (
          <span
            key={t.key}
            className={`cc-tab${t.key === activeTab ? ' active' : ''}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </span>
        ))}
      </div>

      {activeTab === 'text' && (
        <div className={`cc-diagnose cc-diagnose-${diag}`}>
          <div>
            <div className="cc-diagnose-title">普通 LLM：DeepSeek 优先</div>
            <div className="cc-diagnose-sub">
              状态：{data.keys['deepseek'] ? 'Key 已填写' : '未配置'} · 模型：{data.keys['deepseek_model'] || DEEPSEEK_CHAT_MODEL}
            </div>
            {diagMessage && <div className="cc-diagnose-message">{diagMessage}</div>}
          </div>
          <button className="ghost-btn" onClick={() => void diagnoseDeepSeek()} disabled={diag === 'running'}>
            {diag === 'running' ? '诊断中…' : '快速诊断'}
          </button>
        </div>
      )}

      <div className="cc-body">
        {presetInTab.length === 0 && customInTab.length === 0 && (
          <div className="cc-empty">该模态暂无预设服务商，可点击下方"添加自定义"。</div>
        )}
        {presetInTab.map((p) => renderRow(p.id, p.name, p.phase))}
        {activeTab === 'video' && presetInTab.some((p) => p.id === 'kling') && renderRow('kling_secret', 'Kling Secret Key')}
        {presetInTab.some((p) => p.id === 'minimax') && (
          <div className="cc-row" key="minimax_group">
            <div className="cc-row-name">MiniMax 组 ID</div>
            <div className="cc-row-input">
              <input
                className="cc-input cc-input-inline"
                type={show['minimax_group'] ? 'text' : 'password'}
                placeholder="MiniMax GroupId（音乐/语音需填）"
                value={data.keys['minimax_group'] || ''}
                onChange={(e) => setKey('minimax_group', e.target.value)}
              />
              <button
                className="cc-eye"
                onClick={() => setShow((s) => ({ ...s, ['minimax_group']: !s['minimax_group'] }))}
              >
                {show['minimax_group'] ? '隐藏' : '显示'}
              </button>
            </div>
          </div>
        )}
        {presetInTab.some((p) => p.id === 'deepseek') && (
          <div className="cc-row" key="deepseek_model">
            <div className="cc-row-name">DeepSeek 模型</div>
            <div className="cc-row-input">
              <input
                className="cc-input cc-input-inline"
                type="text"
                placeholder="模型 ID（不是 Key），如 deepseek-chat / deepseek-reasoner"
                value={data.keys['deepseek_model'] || ''}
                onChange={(e) => setKey('deepseek_model', e.target.value)}
              />
            </div>
          </div>
        )}
        {customInTab.map((p) => renderRow(p.id, p.name, '自定义', () => removeCustom(p.id)))}
        <button className="ghost-btn cc-add" onClick={openAddCustom}>
          + 添加自定义服务商
        </button>
      </div>

      {activeTab === 'text' && (
        <ChatTest
          volcanoKey={data.keys['volcano'] || ''}
          deepseekKey={data.keys['deepseek'] || ''}
          deepseekModel={data.keys['deepseek_model'] || ''}
        />
      )}

      <div className="cc-foot">
        {saved && <span className="cc-saved">✓ 已加密保存</span>}
        <button className="primary-btn" onClick={handleSave}>
          保存全部
        </button>
      </div>

      {showAdd && (
        <div className="cc-modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="cc-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="cc-modal-title">添加自定义服务商</div>
            <input
              className="cc-input"
              placeholder="服务商名称，如 Gemini"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
            />
            <input
              className="cc-input"
              placeholder="能力，逗号分隔：image,enhance,video,text"
              value={customCaps}
              onChange={(e) => setCustomCaps(e.target.value)}
            />
            <div className="cc-modal-actions">
              <button className="ghost-btn" onClick={() => setShowAdd(false)}>
                取消
              </button>
              <button className="primary-btn" onClick={confirmAddCustom}>
                确认添加
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
