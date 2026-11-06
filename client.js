/**
 * Client half of the Wolfram notebook bundle: a right Sidebar page that renders
 * the notebook document published by the Host tools.
 */
window.__ModuleLoader__.load({
  id: '@nashihang777/dsh-wolfram-nb',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'wolframNotebook'
    const TAB_ID = '@nashihang777/dsh-wolfram-nb#panel'
    const KIND = 'wolfram-notebook'
    const LATEST = '.dsh-wolfram/latest.json'
    const NOTEBOOK_DIR = 'wolfram-notebooks'
    const OPEN_COMMAND = '/wolfram-open'
    const POLL_MS = 1500

    const en = {
      'tab.title': 'Wolfram notebook',
      'guide.title': 'Wolfram notebook',
      'guide.description': 'Live Mathematica notebook',
      'empty.title': 'No Wolfram notebook yet',
      'empty.body': 'Ask the agent to evaluate Wolfram Language code, or open an existing .nb file.',
      'state.loading': 'Loading…',
      'state.error': 'Cannot read the notebook document.',
      'state.waiting': 'Waiting for a notebook…',
      'action.refresh': 'Refresh',
      'action.open': 'Open…',
      'picker.path': 'Notebook path',
      'picker.placeholder': 'e.g. wolfram-notebooks/demo.nb',
      'picker.open': 'Open',
      'picker.loading': 'Reading notebooks…',
      'picker.empty': 'No .nb file found in this workspace.',
      'picker.refresh': 'Refresh list',
      'picker.opening': 'Opening',
      'picker.failed': 'Could not open the notebook.',
      'picker.noCommand': 'This build does not expose the /wolfram-open command channel.',
      'picker.close': 'Close',
      'meta.cells': 'cells',
      'meta.kernel': 'Kernel',
      'meta.updated': 'Updated',
      'meta.notebook': 'Notebook file',
      'meta.published': 'Published',
      'kind.graphics': 'Graphics',
      'kind.image': 'Image',
      'kind.parse': 'This input could not be parsed.',
      'kind.timeout': 'Evaluation timed out.',
      'kind.fallback': 'Output could not be typeset.',
      'kind.opened': 'Opened notebook',
    }

    const zh = {
      'tab.title': 'Wolfram 笔记本',
      'guide.title': 'Wolfram 笔记本',
      'guide.description': '实时 Mathematica 笔记本',
      'empty.title': '还没有 Wolfram 笔记本',
      'empty.body': '让智能体计算 Wolfram Language 代码，或打开一个已有的 .nb 文件。',
      'state.loading': '加载中…',
      'state.error': '无法读取笔记本文档。',
      'state.waiting': '等待笔记本…',
      'action.refresh': '刷新',
      'action.open': '打开…',
      'picker.path': '笔记本路径',
      'picker.placeholder': '例如 wolfram-notebooks/demo.nb',
      'picker.open': '打开',
      'picker.loading': '正在读取笔记本列表…',
      'picker.empty': '当前工作区没有找到 .nb 文件。',
      'picker.refresh': '刷新列表',
      'picker.opening': '正在打开',
      'picker.failed': '无法打开这个笔记本。',
      'picker.noCommand': '当前版本没有暴露 /wolfram-open 命令通道。',
      'picker.close': '关闭',
      'meta.cells': '个单元',
      'meta.kernel': '内核',
      'meta.updated': '更新于',
      'meta.notebook': '笔记本文件',
      'meta.published': '发布',
      'kind.graphics': '图形',
      'kind.image': '图像',
      'kind.parse': '这个输入无法解析。',
      'kind.timeout': '计算超时。',
      'kind.fallback': '输出无法排版。',
      'kind.opened': '已打开的笔记本',
    }

    const CSS = `
.dsw-wl-root{height:100%;min-height:0;overflow:auto;padding:14px 18px 32px;display:flex;flex-direction:column;gap:14px;color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;line-height:1.65;box-sizing:border-box}
.dsw-wl-root *{box-sizing:border-box}
.dsw-wl-header{display:flex;flex-direction:column;gap:6px;padding-bottom:10px;border-bottom:.5px solid var(--dsw-alias-border-l1);position:sticky;top:0;background:var(--dsw-alias-bg-base);z-index:1;margin:-14px -18px 0;padding:12px 18px 10px}
.dsw-wl-headrow{display:flex;align-items:flex-start;gap:10px}
.dsw-wl-headtext{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.dsw-wl-title{margin:0;font-size:16px;font-weight:600;line-height:1.35;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsw-wl-sub{font-size:11px;line-height:1.5;color:var(--dsw-alias-label-secondary);display:flex;flex-wrap:wrap;gap:4px 10px}
.dsw-wl-sub code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:10.5px;background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l1);border-radius:4px;padding:1px 5px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsw-wl-refresh{flex:none;appearance:none;border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:8px;font:inherit;font-size:12px;line-height:1;padding:7px 10px;cursor:pointer}
.dsw-wl-refresh:hover{background:var(--dsw-alias-bg-layer-2)}
.dsw-wl-body{display:flex;flex-direction:column;gap:12px}
.dsw-wl-cell{display:flex;flex-direction:column;gap:6px}
.dsw-wl-code{margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px;line-height:1.55;background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l1);border-left:2px solid var(--dsw-alias-brand-primary);border-radius:8px;padding:8px 10px;white-space:pre-wrap;word-break:break-word;overflow-x:auto}
.dsw-wl-out{display:flex;flex-direction:column;gap:6px;min-width:0}
.dsw-wl-math{overflow-x:auto;overflow-y:hidden;padding:2px 0 4px;font-size:1.06em}
.dsw-wl-math math{font-size:1.06em}
.dsw-wl-plain{margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px;white-space:pre-wrap;word-break:break-word;color:var(--dsw-alias-label-primary)}
.dsw-wl-image{max-width:100%;height:auto;border-radius:8px;background:#fff;padding:4px}
.dsw-wl-note{font-size:12px;color:var(--dsw-alias-label-secondary)}
.dsw-wl-error{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;color:var(--dsw-alias-state-error-primary);white-space:pre-wrap;word-break:break-word}
.dsw-wl-text{margin:0;white-space:pre-wrap;word-break:break-word}
.dsw-wl-section{margin:6px 0 0;font-size:14px;font-weight:600;line-height:1.4}
.dsw-wl-chapter{margin:4px 0 0;font-size:15px;font-weight:600;line-height:1.4}
.dsw-wl-console{margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px;line-height:1.5;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;word-break:break-word;background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l1);border-radius:8px;padding:7px 9px}
.dsw-wl-empty{margin:auto;text-align:center;display:flex;flex-direction:column;gap:6px;padding:40px 20px;max-width:340px}
.dsw-wl-empty-title{font-size:14px;font-weight:600}
.dsw-wl-empty-body{font-size:12.5px;color:var(--dsw-alias-label-secondary);line-height:1.6}
.dsw-wl-spinner{font-size:12px;color:var(--dsw-alias-label-secondary)}
.dsw-wl-timing{font-size:10.5px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.dsw-wl-headactions{display:flex;gap:6px;flex:0 0 auto;align-items:flex-start}
.dsw-wl-picker{display:flex;flex-direction:column;gap:8px;border:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);border-radius:10px;padding:10px}
.dsw-wl-pickrow{display:flex;gap:6px;align-items:center}
.dsw-wl-input{flex:1;min-width:0;border:.5px solid var(--dsw-alias-border-l2);border-radius:7px;background:var(--dsw-alias-bg-base);color:inherit;font:inherit;font-size:12px;line-height:1.4;padding:6px 8px}
.dsw-wl-list{max-height:220px;overflow:auto;display:flex;flex-direction:column;gap:2px;border-top:.5px solid var(--dsw-alias-border-l1);padding-top:6px}
.dsw-wl-file{appearance:none;text-align:left;border:0;background:transparent;color:inherit;font:inherit;font-size:12.5px;padding:6px 8px;border-radius:6px;cursor:pointer;display:flex;flex-direction:column;gap:2px;min-width:0}
.dsw-wl-file:hover{background:var(--dsw-alias-bg-layer-2)}
.dsw-wl-filemeta{font-size:10.5px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsw-wl-pickerror{font-size:11.5px;color:var(--dsw-alias-state-error-primary);white-space:pre-wrap;word-break:break-word}
`

    function unwrapRemote(result) {
      if (result !== null && typeof result === 'object' && 'ok' in result) {
        if (result.ok === false) {
          const reason = result.error?.message ?? result.error?.code ?? 'remote call failed'
          throw new Error(String(reason))
        }
        return result.value
      }
      return result
    }

    function decodeText(bytes) {
      return new TextDecoder('utf-8').decode(bytes)
    }

    function safeMathML(value) {
      if (typeof value !== 'string') return ''
      const text = value.trim()
      if (!text.startsWith('<math')) return ''
      if (/<script/i.test(text) || /\son[a-z]+\s*=/i.test(text) || /javascript:/i.test(text)) return ''
      return text
    }

    function formatTime(value) {
      if (typeof value !== 'string' || value === '') return ''
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return ''
      return date.toLocaleString()
    }

    function MathBlock({ mathml, plain }) {
      const safe = safeMathML(mathml)
      if (safe === '') {
        if (typeof plain === 'string' && plain.trim() !== '') {
          return h('pre', { className: 'dsw-wl-plain' }, plain)
        }
        return null
      }
      return h('div', { className: 'dsw-wl-math', dangerouslySetInnerHTML: { __html: safe } })
    }

    function OutputView({ cell, t }) {
      const kind = cell.kind
      if (kind === 'expression') {
        return h('div', { className: 'dsw-wl-out' },
          h(MathBlock, { mathml: cell.mathml, plain: cell.inputForm }))
      }
      if (kind === 'graphics' || kind === 'image') {
        if (typeof cell.image === 'string' && cell.image.length > 0) {
          return h('img', {
            className: 'dsw-wl-image',
            src: `data:image/png;base64,${cell.image}`,
            alt: kind === 'graphics' ? t('kind.graphics') : t('kind.image'),
            loading: 'lazy',
          })
        }
        return h('div', { className: 'dsw-wl-note' },
          kind === 'graphics' ? t('kind.fallback') : t('kind.fallback'))
      }
      if (kind === 'parseError') return h('div', { className: 'dsw-wl-error' }, t('kind.parse'))
      if (kind === 'timedOut') return h('div', { className: 'dsw-wl-error' }, t('kind.timeout'))
      return null
    }

    function CellView({ cell, t }) {
      const kind = cell.kind
      if (kind === 'text') {
        const text = String(cell.text ?? '')
        if (cell.cellType === 'title') return h('h2', { className: 'dsw-wl-title' }, text)
        if (cell.cellType === 'section') return h('h3', { className: 'dsw-wl-section' }, text)
        if (cell.cellType === 'chapter') return h('h3', { className: 'dsw-wl-chapter' }, text)
        return h('p', { className: 'dsw-wl-text' }, text)
      }
      const source = String(cell.source ?? '')
      return h('div', { className: 'dsw-wl-cell' },
        source.trim() === '' ? null : h('pre', { className: 'dsw-wl-code' }, source),
        h(OutputView, { cell, t }),
        Number.isFinite(cell.timingMs) && cell.timingMs >= 1000
          ? h('div', { className: 'dsw-wl-timing' }, `${cell.timingMs} ms`)
          : null)
    }

    function NotebookPanel(props) {
      const { sessionId, remote, t, commands } = props
      const tabInfo = typeof props.useTabInfo === 'function' ? props.useTabInfo() : undefined
      const tab = tabInfo?.tab
      const visible = tab === undefined || tab.visible !== false
      const [state, setState] = React.useState({ status: 'loading', doc: null })
      const [refreshToken, setRefreshToken] = React.useState(0)
      const [pickerOpen, setPickerOpen] = React.useState(false)
      const [files, setFiles] = React.useState([])
      const [filesLoading, setFilesLoading] = React.useState(false)
      const [pickerError, setPickerError] = React.useState('')
      const [manualPath, setManualPath] = React.useState('')
      const [pendingPath, setPendingPath] = React.useState('')
      const stamp = React.useRef('')
      const session = String(sessionId ?? '')

      React.useEffect(() => {
        if (session === '' || remote === undefined || visible === false) {
          setState(previous => (previous.doc !== null ? previous : { status: 'empty', doc: null }))
          return undefined
        }
        let cancelled = false
        let timer = null
        const controller = new AbortController()
        stamp.current = ''

        const load = async () => {
          if (cancelled) return
          try {
            const headRead = unwrapRemote(await remote.readBytes(
              session,
              LATEST,
              { range: { offset: 0, length: 320 } },
              controller.signal,
            ))
            const head = decodeText(headRead.data)
            const match = /"publishedAt":"([^"]*)"/.exec(head)
            const nextStamp = match === null ? '' : match[1]
            if (nextStamp === '' || nextStamp !== stamp.current) {
              const read = unwrapRemote(await remote.readBytes(session, LATEST, {}, controller.signal))
              const doc = JSON.parse(decodeText(read.data))
              stamp.current = nextStamp === '' ? String(doc.publishedAt ?? '') : nextStamp
              if (!cancelled) {
                setState(previous => (
                  previous.doc !== null && previous.doc.publishedAt === doc.publishedAt
                    ? previous
                    : { status: 'ready', doc }
                ))
              }
            }
          } catch (error) {
            if (!cancelled) {
              setState(previous => (previous.doc !== null ? previous : { status: 'empty', doc: null }))
            }
          }
          if (!cancelled) timer = setTimeout(load, POLL_MS)
        }

        load()
        return () => {
          cancelled = true
          if (timer !== null) clearTimeout(timer)
          controller.abort()
        }
      }, [session, remote, refreshToken, visible])

      const doc = state.doc
      const cells = Array.isArray(doc?.cells) ? doc.cells : []
      const kernel = typeof doc?.kernelVersion === 'string' ? doc.kernelVersion.split(' for ')[0] : ''
      const notebookPath = typeof doc?.notebookPath === 'string' ? doc.notebookPath : ''
      const updated = formatTime(doc?.publishedAt)

      const loadFiles = async () => {
        if (session === '' || remote === undefined) return
        setFilesLoading(true)
        setPickerError('')
        const controller = new AbortController()
        const directories = ['', NOTEBOOK_DIR]
        if (notebookPath !== '') {
          const normalized = notebookPath.replace(/\\/g, '/')
          const slash = normalized.lastIndexOf('/')
          if (slash > 0) directories.push(normalized.slice(0, slash))
        }
        const collected = []
        const seen = new Set()
        for (const directory of [...new Set(directories)]) {
          try {
            const listing = unwrapRemote(await remote.list(session, directory, controller.signal))
            for (const entry of listing?.entries ?? []) {
              if (entry?.type !== 'file' || !/\.nb$/i.test(String(entry.name ?? ''))) continue
              const path = directory === '' ? String(entry.name) : `${directory}/${entry.name}`
              if (seen.has(path)) continue
              seen.add(path)
              collected.push({ path, name: String(entry.name) })
            }
          } catch {
            /* a directory that does not exist is not an error here */
          }
        }
        collected.sort((left, right) => left.path.localeCompare(right.path))
        setFiles(collected)
        setFilesLoading(false)
      }

      const openNotebook = async (rawPath) => {
        const path = String(rawPath ?? '').trim()
        if (path === '') return
        if (commands?.execute === undefined) {
          setPickerError(t('picker.noCommand'))
          return
        }
        setPendingPath(path)
        setPickerError('')
        try {
          const controller = new AbortController()
          const executed = unwrapRemote(await commands.execute(
            session,
            `${OPEN_COMMAND} "${path}"`,
            [],
            controller.signal,
          ))
          const outcome = executed?.result ?? executed
          if (outcome?.kind === 'error') throw new Error(outcome.text || t('picker.failed'))
          setPickerOpen(false)
          setManualPath('')
          setRefreshToken(value => value + 1)
        } catch (error) {
          setPickerError(String(error?.message ?? error))
        } finally {
          setPendingPath('')
        }
      }

      const togglePicker = () => {
        const next = !pickerOpen
        setPickerOpen(next)
        if (next) loadFiles()
      }

      const header = doc === null ? null : h('div', { className: 'dsw-wl-header' },
        h('div', { className: 'dsw-wl-headrow' },
          h('div', { className: 'dsw-wl-headtext' },
            h('h1', { className: 'dsw-wl-title' }, String(doc.title ?? '') || t('tab.title')),
            h('div', { className: 'dsw-wl-sub' },
              kernel === '' ? null : h('span', null, `${t('meta.kernel')} ${kernel}`),
              h('span', null, `${cells.length} ${t('meta.cells')}`),
              updated === '' ? null : h('span', null, `${t('meta.updated')} ${updated}`),
              notebookPath === '' ? null : h('code', { title: notebookPath }, notebookPath))),
          h('div', { className: 'dsw-wl-headactions' },
            h('button', {
              type: 'button',
              className: 'dsw-wl-refresh',
              onClick: togglePicker,
            }, t('action.open')),
            h('button', {
              type: 'button',
              className: 'dsw-wl-refresh',
              onClick: () => setRefreshToken(value => value + 1),
            }, t('action.refresh')))))

      const picker = pickerOpen === false ? null : h('div', { className: 'dsw-wl-picker' },
        h('div', { className: 'dsw-wl-pickrow' },
          h('input', {
            className: 'dsw-wl-input',
            value: manualPath,
            placeholder: t('picker.placeholder'),
            'aria-label': t('picker.path'),
            onChange: event => setManualPath(event.target.value),
            onKeyDown: event => {
              if (event.key === 'Enter') openNotebook(manualPath)
            },
          }),
          h('button', { type: 'button', className: 'dsw-wl-refresh', onClick: () => openNotebook(manualPath) }, t('picker.open')),
          h('button', { type: 'button', className: 'dsw-wl-refresh', onClick: () => setPickerOpen(false) }, t('picker.close'))),
        pickerError === '' ? null : h('div', { className: 'dsw-wl-pickerror' }, pickerError),
        pendingPath === '' ? null : h('div', { className: 'dsw-wl-note' }, `${t('picker.opening')} ${pendingPath}`),
        h('div', { className: 'dsw-wl-list' },
          filesLoading
            ? h('div', { className: 'dsw-wl-note' }, t('picker.loading'))
            : files.length === 0
              ? h('div', { className: 'dsw-wl-note' }, t('picker.empty'))
              : files.map(file => h('button', {
                key: file.path,
                type: 'button',
                className: 'dsw-wl-file',
                title: file.path,
                onClick: () => openNotebook(file.path),
              }, h('span', null, file.name), h('span', { className: 'dsw-wl-filemeta' }, file.path)))),
        h('div', { className: 'dsw-wl-pickrow' },
          h('button', { type: 'button', className: 'dsw-wl-refresh', onClick: loadFiles }, t('picker.refresh'))))

      let body
      if (state.status === 'loading') {
        body = h('div', { className: 'dsw-wl-spinner' }, t('state.loading'))
      } else if (doc === null) {
        body = h('div', { className: 'dsw-wl-empty' },
          h('div', { className: 'dsw-wl-empty-title' }, state.status === 'waiting' ? t('state.waiting') : t('empty.title')),
          h('div', { className: 'dsw-wl-empty-body' }, t('empty.body')),
          h('button', { type: 'button', className: 'dsw-wl-refresh', onClick: togglePicker }, t('action.open')))
      } else {
        const consoleText = typeof doc.console === 'string' ? doc.console.trim() : ''
        body = h('div', { className: 'dsw-wl-body' },
          cells.map((cell, index) => h(CellView, {
            key: `${index}-${cell.index ?? index}`,
            cell,
            t,
          })),
          consoleText === '' ? null : h('pre', { className: 'dsw-wl-console' }, consoleText))
      }

      return h('div', { className: 'dsw-wl-root' },
        h('style', null, CSS),
        header,
        picker,
        body)
    }

    function autoOpen(ctx) {
      return () => {
        const sidebar = ctx.sidebarRight
        const mount = sidebar?.mounted
        if (mount === undefined) return undefined
        let stopped = false
        let timer = null
        let retry = null
        const seen = new Map()
        const controllers = new Set()

        const reveal = () => {
          try {
            sidebar.openTab(KIND)
            return
          } catch {
            /* the column has no mounted surface yet */
          }
          try {
            sidebar.toggleExpanded()
          } catch {
            return
          }
          retry = setTimeout(() => {
            try {
              sidebar.openTab(KIND)
            } catch {
              /* the surface still is not ready */
            }
          }, 400)
        }

        const poll = async () => {
          if (stopped) return
          const sessionId = mount.getSnapshot?.()
          if (sessionId !== undefined && sessionId !== null) {
            const key = String(sessionId)
            const controller = new AbortController()
            controllers.add(controller)
            try {
              const read = unwrapRemote(await ctx.remote.workspaceFiles.readBytes(
                key,
                LATEST,
                { range: { offset: 0, length: 320 } },
                controller.signal,
              ))
              const head = decodeText(read.data)
              const match = /"publishedAt":"([^"]*)"/.exec(head)
              const stamp = match === null ? '' : match[1]
              const previous = seen.get(key)
              seen.set(key, stamp)
              if (previous !== undefined && stamp !== '' && previous !== stamp) {
                reveal()
              }
            } catch {
              if (!seen.has(key)) seen.set(key, '')
            } finally {
              controllers.delete(controller)
            }
          }
          if (!stopped) timer = setTimeout(poll, 2000)
        }

        poll()
        return () => {
          stopped = true
          if (timer !== null) clearTimeout(timer)
          if (retry !== null) clearTimeout(retry)
          for (const controller of controllers) controller.abort()
        }
      }
    }

    return {
      inject: ['slots', 'locale', 'sidebarRight', 'sidebarRightTabs', 'remote', 'remote.workspaceFiles', 'remote.commands'],
      apply(ctx) {
        const t = ctx.locale.bind(NS)
        ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'wolfram notebook: dictionaries')
        ctx.effect(() => ctx.sidebarRightTabs.register({
          id: TAB_ID,
          kind: KIND,
          title: () => t('tab.title'),
          guide: [{
            id: 'panel',
            order: 10,
            title: () => t('guide.title'),
            description: () => t('guide.description'),
          }],
        }), 'wolfram notebook: tab type')
        ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          key: TAB_ID,
          locale: NS,
          inject: sessionId => ({
            sessionId,
            remote: ctx.remote.workspaceFiles,
            commands: (() => {
              try {
                return ctx.remote.commands
              } catch {
                return undefined
              }
            })(),
            t,
          }),
        }, NotebookPanel)), 'wolfram notebook: panel body')
        ctx.effect(autoOpen(ctx), 'wolfram notebook: auto open')
      },
    }
  },
})
