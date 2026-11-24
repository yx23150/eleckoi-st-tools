window.__ModuleLoader__.load({
  id: 'eleckoi-st-tools',
  factory(require) {
    const React = require('react')

    // ---------- 内置快捷指令（来源：酒馆 QR「快捷指令大全」，已展开为扁平条目） ----------
    const BUILT_IN = [
      { category: '通用', label: '继续剧情', text: '请承接当前剧情、角色状态与人设，自然推进故事。保持情节连贯，不跳过关键过程，不替{{user}}决定行动。' },
      { category: '通用', label: '换个说法', text: '请用另一种方式重写你刚才那段回复，保持内容与信息量不变，只调整措辞与节奏。' },
      { category: '通用', label: '放慢节奏', text: '请放慢叙事节奏：细化当前场景的环境、动作与感官细节，减少时间跳跃。' },
      { category: '通用', label: '推进时间', text: '（时间流逝，数小时后。）' },
      { category: '通用', label: '结束这段', text: '请把当前场景收束到一个自然的停顿点，给{{user}}留出回应的空间。' },
      { category: '氛围', label: '描写环境', text: '请用两到三段描写当前场景的环境：光线、声音、气味、温度，以及它们对气氛的影响。' },
      { category: '氛围', label: '内心独白', text: '请写出{{char}}此刻的内心活动，语气与用词贴合人设，不要直接说出结论。' },
      { category: '氛围', label: '强化人设', text: '请更严格地贴合{{char}}的性格、说话习惯与口癖，避免通用化表达。' },
      { category: '互动', label: '角色主动', text: '请让{{char}}主动开口或做出一个推动剧情的举动，并给出具体动作与台词。' },
      { category: '互动', label: '制造冲突', text: '请引入一个小冲突或误会，来源必须符合已有设定，不要凭空添加新角色。' },
      { category: '互动', label: '转折', text: '请安排一个合乎逻辑的剧情转折，前面已有伏笔优先使用。' },
      { category: '写作', label: '多写一些', text: '请把这段写得更长：增加具体动作、细节与感官描写，正文不少于原文的两倍。' },
      { category: '写作', label: '精简', text: '请精简这段回复，保留关键动作与台词，去掉重复与赘述。' },
      { category: '写作', label: '避免重复', text: '请不要重复使用你已经用过的比喻与形容词，换一批新的表达。' }
    ]

    // 运行期补全：如果插件包内带有 data/quick-replies.json，会在启用后异步加载并合并。
    let builtIn = BUILT_IN.slice()
    let dataState = { loaded: false, error: '' }

    async function loadBundledData(ctx) {
      const normalize = payload => (Array.isArray(payload?.items) ? payload.items : [])
        .filter(item => item && typeof item.category === 'string' && typeof item.label === 'string' && typeof item.text === 'string')
        .map(item => ({ category: item.category, label: item.label, text: item.text }))
      const attempts = [
        () => import(new URL('./data/quick-replies.mjs', import.meta.url).href).then(module => module.default),
        () => fetch(new URL('./data/quick-replies.json', import.meta.url).href).then(response => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          return response.json()
        })
      ]
      for (const attempt of attempts) {
        try {
          const mapped = normalize(await attempt())
          if (mapped.length) {
            builtIn = mapped
            dataState = { loaded: true, error: '' }
            notifyStore()
            return
          }
        } catch (error) {
          dataState = { loaded: false, error: error?.message || String(error) }
        }
      }
      notifyStore()
    }

    // ---------- 用户自定义指令（本地保存） ----------
    const STORAGE_KEY = 'eleckoi.stTools.v1'

    function readStored() {
      try {
        const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
        if (!raw) return { items: [], favorites: [] }
        const parsed = JSON.parse(raw)
        return {
          items: Array.isArray(parsed.items)
            ? parsed.items.filter(item => item && typeof item.label === 'string' && typeof item.text === 'string')
            : [],
          favorites: Array.isArray(parsed.favorites) ? parsed.favorites.filter(item => typeof item === 'string') : []
        }
      } catch {
        return { items: [], favorites: [] }
      }
    }

    let stored = readStored()
    const listeners = new Set()

    function notifyStore() {
      for (const listener of listeners) listener()
    }

    function commit(patch) {
      stored = { ...stored, ...patch }
      try {
        globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(stored))
      } catch {
        /* 存储不可用时只保留内存态 */
      }
      notifyStore()
    }

    function useStore() {
      return React.useSyncExternalStore(
        listener => {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
        () => stored,
        () => stored
      )
    }

    function allItems() {
      return builtIn.concat(stored.items.map(item => ({ category: item.category || '我的', label: item.label, text: item.text })))
    }

    // ---------- 会话访问 ----------
    function conversationsOf(ctx) {
      try {
        return ctx.eleckoiConversations ?? ctx.get?.('eleckoiConversations') ?? null
      } catch {
        return null
      }
    }

    function activeConversationId(ctx) {
      const conversations = conversationsOf(ctx)
      if (!conversations) return null
      try {
        const snapshot = conversations.getSnapshot()
        return snapshot?.active?.conversationId ?? snapshot?.active?.id ?? null
      } catch {
        return null
      }
    }

    function messagesOf(ctx, conversationId) {
      const conversations = conversationsOf(ctx)
      if (!conversations || !conversationId) return []
      try {
        const details = conversations.getDetailsSnapshot()
        if (details?.id === conversationId && details.details?.messages) return details.details.messages
      } catch {
        /* 切换会话过程中可能短暂不可用 */
      }
      return []
    }

    function toast(ctx, message) {
      for (const getter of [() => ctx.toast, () => ctx.get?.('toast'), () => ctx.get?.('notifications')]) {
        try {
          const target = getter()
          if (target?.show) {
            target.show(message)
            return
          }
        } catch {
          /* 下一个 */
        }
      }
      globalThis.console?.info?.(`[eleckoi-st-tools] ${message}`)
    }

    function insertText(ctx, conversationId, text) {
      const conversations = conversationsOf(ctx)
      if (!conversations || !conversationId) {
        toast(ctx, '请先打开一个角色对话')
        return
      }
      try {
        const current = conversations.readInputDraft(conversationId) ?? ''
        const next = current.trim() ? `${current.trimEnd()}\n${text}` : text
        conversations.writeInputDraft(conversationId, next)
      } catch (error) {
        toast(ctx, `写入输入框失败：${error?.message || error}`)
      }
    }

    function sendText(ctx, conversationId, text) {
      const conversations = conversationsOf(ctx)
      if (!conversations || !conversationId) {
        toast(ctx, '请先打开一个角色对话')
        return
      }
      try {
        conversations.writeInputDraft(conversationId, text)
        conversations.submitInput(conversationId)
      } catch (error) {
        toast(ctx, `发送失败：${error?.message || error}`)
      }
    }

    // ---------- 聊天导出 ----------
    function plainText(messages) {
      return messages
        .filter(message => message && message.role !== 'system')
        .map(message => {
          const body = String(message.displayContent ?? message.content ?? '').trim()
          if (!body) return null
          const who = message.role === 'user' ? '我' : message.speakerName || '角色'
          return `${who}：${body}`
        })
        .filter(Boolean)
        .join('\n\n')
    }

    function markdown(messages) {
      return messages
        .filter(message => message && message.role !== 'system')
        .map(message => {
          const body = String(message.displayContent ?? message.content ?? '').trim()
          if (!body) return null
          const who = message.role === 'user' ? '我' : message.speakerName || '角色'
          return `**${who}**\n\n${body}`
        })
        .filter(Boolean)
        .join('\n\n---\n\n')
    }

    function saveBytes(fileName, text, mimeType) {
      const bytes = new TextEncoder().encode(text)
      if (globalThis.ElecKoiPlatform?.saveBytes) {
        return globalThis.ElecKoiPlatform.saveBytes(fileName, bytes, mimeType)
      }
      const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }))
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      link.style.display = 'none'
      try {
        document.body.append(link)
        link.click()
      } finally {
        link.remove()
        setTimeout(() => URL.revokeObjectURL(url), 0)
      }
      return undefined
    }

    function stamp() {
      const now = new Date()
      const pad = value => String(value).padStart(2, '0')
      return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
    }

    // ---------- 样式 ----------
    function ensureStyle() {
      const id = 'eleckoi-st-tools-style'
      if (typeof document === 'undefined' || document.getElementById(id)) return
      const style = document.createElement('style')
      style.id = id
      style.textContent = `
.stt-chips{display:flex;gap:6px;overflow-x:auto;padding:6px 10px 2px;scrollbar-width:none}
.stt-chips::-webkit-scrollbar{display:none}
.stt-chip{flex:0 0 auto;border:1px solid var(--dsw-alias-border-subtle,#d8d8e0);background:var(--dsw-alias-bg-secondary,#f4f4f8);
  color:inherit;border-radius:999px;padding:5px 11px;font-size:12px;line-height:1.4;white-space:nowrap}
.stt-chip:active{opacity:.55}
.stt-sheet{position:fixed;inset:0;z-index:60;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.35)}
.stt-panel{width:100%;max-width:680px;max-height:84vh;display:flex;flex-direction:column;background:var(--dsw-alias-bg-primary,#fff);
  border-radius:16px 16px 0 0;box-shadow:0 -8px 30px rgba(0,0,0,.22)}
.stt-head{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid var(--dsw-alias-border-subtle,#e6e6ee)}
.stt-title{font-size:15px;font-weight:600}
.stt-close{border:0;background:transparent;color:inherit;font-size:16px;padding:4px 8px;border-radius:8px;opacity:.7}
.stt-body{flex:1;overflow:auto;padding:10px 14px}
.stt-row{display:flex;gap:8px;align-items:center;margin:8px 0}
.stt-input{flex:1;min-width:0;border:1px solid var(--dsw-alias-border-subtle,#d0d0da);border-radius:8px;padding:8px 10px;
  font-size:13px;background:var(--dsw-alias-bg-secondary,#fafafc);color:inherit}
.stt-area{width:100%;min-height:76px;border:1px solid var(--dsw-alias-border-subtle,#d0d0da);border-radius:8px;padding:8px 10px;
  font-size:13px;background:var(--dsw-alias-bg-secondary,#fafafc);color:inherit;resize:vertical}
.stt-btn{border:1px solid var(--dsw-alias-border-subtle,#d0d0da);background:transparent;color:inherit;border-radius:8px;padding:6px 12px;font-size:13px}
.stt-btn--primary{background:#4a63c8;border-color:#4a63c8;color:#fff}
.stt-btn--on{background:#4a63c8;border-color:#4a63c8;color:#fff}
.stt-muted{font-size:12px;opacity:.62;line-height:1.55}
.stt-cat{font-size:12px;font-weight:600;opacity:.75;margin:12px 0 6px}
.stt-item{display:flex;gap:8px;align-items:center;padding:7px 0;border-bottom:1px solid var(--dsw-alias-border-subtle,#eeeef4)}
.stt-item-label{flex:0 0 96px;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.stt-item-text{flex:1;min-width:0;font-size:12px;opacity:.7;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.stt-tabs{display:flex;gap:6px;padding:8px 14px 0}
.stt-tab{border:0;background:transparent;color:inherit;font-size:13px;opacity:.6;padding:6px 4px}
.stt-tab--on{opacity:1;font-weight:600;border-bottom:2px solid #4a63c8}
.stt-menu{display:flex;align-items:center;gap:8px;width:100%;border:0;background:transparent;color:inherit;
  font-size:14px;text-align:left;padding:10px 4px;border-radius:8px}
.stt-menu:active{background:var(--dsw-alias-bg-secondary,#f2f2f7)}
`
      document.head.appendChild(style)
    }

    // ---------- UI ----------
    function Sheet({ title, onClose, children }) {
      return React.createElement(
        'div',
        { className: 'stt-sheet', role: 'dialog', 'aria-modal': 'true', onClick: event => { if (event.target === event.currentTarget) onClose() } },
        React.createElement(
          'div',
          { className: 'stt-panel' },
          React.createElement(
            'div',
            { className: 'stt-head' },
            React.createElement('span', { className: 'stt-title' }, title),
            React.createElement('button', { type: 'button', className: 'stt-close', onClick: onClose, 'aria-label': '关闭' }, '✕')
          ),
          children
        )
      )
    }

    function QuickPanel({ ctx, conversationId, onClose }) {
      const store = useStore()
      const [query, setQuery] = React.useState('')
      const [label, setLabel] = React.useState('')
      const [text, setText] = React.useState('')
      const [adding, setAdding] = React.useState(false)
      const keyword = query.trim()
      const items = allItems().filter(item =>
        !keyword || item.label.includes(keyword) || item.text.includes(keyword) || item.category.includes(keyword)
      )
      const groups = new Map()
      for (const item of items) {
        if (!groups.has(item.category)) groups.set(item.category, [])
        groups.get(item.category).push(item)
      }
      const save = () => {
        if (!label.trim() || !text.trim()) return
        commit({ items: [...stored.items, { category: '我的', label: label.trim().slice(0, 14), text }] })
        setLabel('')
        setText('')
        setAdding(false)
      }
      return React.createElement(
        Sheet,
        { title: '快捷指令', onClose },
        React.createElement(
          'div',
          { className: 'stt-head', style: { borderBottom: 0, paddingTop: 4 } },
          React.createElement('input', {
            className: 'stt-input',
            placeholder: `搜索 ${allItems().length} 条指令`,
            value: query,
            onChange: event => setQuery(event.target.value)
          }),
          React.createElement('button', { type: 'button', className: 'stt-btn', onClick: () => setAdding(value => !value) }, adding ? '收起' : '＋新建')
        ),
        adding
          ? React.createElement(
              'div',
              { className: 'stt-body', style: { flex: '0 0 auto', borderBottom: '1px solid var(--dsw-alias-border-subtle,#e6e6ee)' } },
              React.createElement('div', { className: 'stt-row' },
                React.createElement('input', { className: 'stt-input', placeholder: '指令名称', value: label, onChange: event => setLabel(event.target.value) })),
              React.createElement('div', { className: 'stt-row' },
                React.createElement('textarea', { className: 'stt-area', placeholder: '指令内容', value: text, onChange: event => setText(event.target.value) })),
              React.createElement('div', { className: 'stt-row', style: { justifyContent: 'flex-end' } },
                React.createElement('button', { type: 'button', className: 'stt-btn stt-btn--primary', onClick: save, disabled: !label.trim() || !text.trim() }, '保存'))
            )
          : null,
        React.createElement(
          'div',
          { className: 'stt-body' },
          React.createElement('div', { className: 'stt-muted' }, '点「插入」写进输入框，点「发送」立刻发出。双击胶囊也可直接发送。'),
          items.length === 0
            ? React.createElement('div', { className: 'stt-muted', style: { marginTop: 12 } }, '没有匹配的指令。')
            : [...groups.entries()].map(([category, list]) =>
                React.createElement(
                  'div',
                  { key: category },
                  React.createElement('div', { className: 'stt-cat' }, `${category} · ${list.length}`),
                  list.map((item, index) =>
                    React.createElement(
                      'div',
                      { className: 'stt-item', key: `${category}-${index}-${item.label}` },
                      React.createElement('span', { className: 'stt-item-label' }, item.label),
                      React.createElement('span', { className: 'stt-item-text' }, item.text),
                      React.createElement('button', { type: 'button', className: 'stt-btn', onClick: () => { insertText(ctx, conversationId, item.text); onClose() } }, '插入'),
                      React.createElement('button', { type: 'button', className: 'stt-btn', onClick: () => { sendText(ctx, conversationId, item.text); onClose() } }, '发送')
                    )
                  )
                )
              )
        )
      )
    }

    function ExportPanel({ ctx, conversationId, onClose }) {
      const [format, setFormat] = React.useState('markdown')
      const [scope, setScope] = React.useState('all')
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState('')
      const messages = messagesOf(ctx, conversationId)
      const picked = scope === 'last10' ? messages.slice(-10) : messages

      const run = async () => {
        if (busy) return
        setBusy(true)
        setError('')
        try {
          const conversations = conversationsOf(ctx)
          if (!conversations) throw new Error('会话服务不可用')
          if (format === 'archive') {
            const json = await conversations.exportArchive(conversationId)
            saveBytes(`eleckoi-chat-${stamp()}.json`, json, 'application/json')
            toast(ctx, '已保存归档 JSON')
          } else {
            const body = format === 'markdown' ? markdown(picked) : plainText(picked)
            const extension = format === 'markdown' ? 'md' : 'txt'
            const mime = format === 'markdown' ? 'text/markdown' : 'text/plain'
            saveBytes(`eleckoi-chat-${stamp()}.${extension}`, body, mime)
            toast(ctx, '已保存聊天记录')
          }
        } catch (reason) {
          setError(reason?.message || String(reason))
        } finally {
          setBusy(false)
        }
      }

      return React.createElement(
        Sheet,
        { title: '导出聊天', onClose },
        React.createElement(
          'div',
          { className: 'stt-body' },
          React.createElement('div', { className: 'stt-cat' }, '格式'),
          React.createElement('div', { className: 'stt-row' },
            React.createElement('button', { type: 'button', className: `stt-btn ${format === 'plain' ? 'stt-btn--on' : ''}`, onClick: () => setFormat('plain') }, '纯文本'),
            React.createElement('button', { type: 'button', className: `stt-btn ${format === 'markdown' ? 'stt-btn--on' : ''}`, onClick: () => setFormat('markdown') }, 'Markdown'),
            React.createElement('button', { type: 'button', className: `stt-btn ${format === 'archive' ? 'stt-btn--on' : ''}`, onClick: () => setFormat('archive') }, '归档 JSON')),
          React.createElement('div', { className: 'stt-cat' }, '范围'),
          React.createElement('div', { className: 'stt-row' },
            React.createElement('button', { type: 'button', className: `stt-btn ${scope === 'all' ? 'stt-btn--on' : ''}`, onClick: () => setScope('all') }, `全部（${messages.length} 条）`),
            React.createElement('button', { type: 'button', className: `stt-btn ${scope === 'last10' ? 'stt-btn--on' : ''}`, onClick: () => setScope('last10') }, '最近 10 条')),
          React.createElement('div', { className: 'stt-muted', style: { marginTop: 10 } },
            format === 'archive'
              ? '归档 JSON 是 ElecKoi 官方导出格式，可在其它设备导入。'
              : '纯文本 / Markdown 会过滤系统消息，只保留对话正文。'),
          error ? React.createElement('div', { style: { color: '#d14c4c', fontSize: 12, marginTop: 10 } }, error) : null,
          React.createElement(
            'div',
            { className: 'stt-row', style: { justifyContent: 'flex-end', marginTop: 12 } },
            React.createElement('button', { type: 'button', className: 'stt-btn', onClick: onClose }, '取消'),
            React.createElement('button', { type: 'button', className: 'stt-btn stt-btn--primary', onClick: run, disabled: busy },
              busy ? '导出中…' : '导出并保存')
          )
        )
      )
    }

    // ---------- 浮层管理 ----------
    const layerListeners = new Set()
    let layer = null

    function openLayer(render) {
      layer = render
      for (const listener of layerListeners) listener()
    }

    function closeLayer() {
      layer = null
      for (const listener of layerListeners) listener()
    }

    function Overlay() {
      const [, force] = React.useState(0)
      React.useEffect(() => {
        layerListeners.add(force)
        return () => layerListeners.delete(force)
      }, [])
      return layer ? layer(closeLayer) : null
    }

    // ---------- 快捷胶囊行 ----------
    function ChipsRow(props) {
      const { ctx } = props
      const store = useStore()
      const favorites = store.favorites
      const pinned = allItems().filter(item => favorites.includes(`${item.category}｜${item.label}`))
      const fallback = allItems().filter(item => item.category === '通用').slice(0, 4)
      const shown = (pinned.length ? pinned : fallback).slice(0, 6)
      const conversationId = props.conversationId || activeConversationId(ctx)
      return React.createElement(
        'div',
        { className: 'stt-chips' },
        shown.map((item, index) =>
          React.createElement(
            'button',
            {
              key: `${item.category}-${item.label}-${index}`,
              type: 'button',
              className: 'stt-chip',
              onClick: () => insertText(ctx, conversationId, item.text),
              onDoubleClick: () => sendText(ctx, conversationId, item.text)
            },
            item.label
          )
        ),
        React.createElement(
          'button',
          { type: 'button', className: 'stt-chip', onClick: () => props.onOpenQuick() },
          '全部指令'
        )
      )
    }

    // ---------- 插件入口 ----------
    return {
      inject: ['slots'],
      apply(ctx) {
        ensureStyle()
        void loadBundledData(ctx)
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'eleckoi-st-tools.overlay' }, Overlay))

        const openQuick = () => openLayer(close => React.createElement(QuickPanel, { ctx, conversationId: activeConversationId(ctx), onClose: close }))
        const openExport = () => openLayer(close => React.createElement(ExportPanel, { ctx, conversationId: activeConversationId(ctx), onClose: close }))

        ctx.slots.inject('eleckoi.roleplay.conversation.input.dock', () =>
          ctx.slots.register(
            { name: 'eleckoi.roleplay.conversation.input.dock', id: 'eleckoi-st-tools.chips', order: 40 },
            () => React.createElement(ChipsRow, { ctx, onOpenQuick: openQuick })
          )
        )

        ctx.slots.inject('eleckoi.roleplay.conversation.input.menu.actions', () =>
          ctx.slots.register(
            { name: 'eleckoi.roleplay.conversation.input.menu.actions', id: 'eleckoi-st-tools.menu', order: 50 },
            slotProps =>
              React.createElement(
                React.Fragment,
                null,
                React.createElement(
                  'button',
                  {
                    type: 'button',
                    role: 'menuitem',
                    className: 'stt-menu',
                    onClick: () => { slotProps?.onDismiss?.(); openQuick() }
                  },
                  '快捷指令'
                ),
                React.createElement(
                  'button',
                  {
                    type: 'button',
                    role: 'menuitem',
                    className: 'stt-menu',
                    onClick: () => { slotProps?.onDismiss?.(); openExport() }
                  },
                  '导出聊天'
                )
              )
          )
        )
      }
    }
  }
})
