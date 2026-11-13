/**
 * Host half of the Wolfram notebook bundle.
 *
 * Keeps one persistent `math.exe` kernel per Session working directory, exposes
 * `wolfram_eval` and `wolfram_notebook` tools, and publishes every evaluation as
 * a JSON notebook document the Client panel renders.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveKernel } from './kernel-discovery.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const BRIDGE_PATH = join(HERE, 'bridge.wl')

/** Directory (inside the Session workspace) that carries the published document. */
const PUBLISH_DIR = '.dsh-wolfram'
const LATEST_NAME = 'latest.json'
/** Directory (inside the Session workspace) that receives exported `.nb` files. */
const EXPORT_DIR = 'wolfram-notebooks'

const BRIDGE_VERSION = '1.3.0'
const DEFAULT_TIMEOUT_MS = 180_000
const MAX_JOBS = 20
const DEFAULT_MAX_RUNNING_JOBS = 4
const DEFAULT_BATCH_PARALLEL = 4
const MAX_BATCH = 12
const JOB_TTL_MS = 60 * 60_000
const LIVE_KERNELS = new Set()
const DEFAULT_IDLE_MS = 30 * 60_000
const START_TIMEOUT_MS = 90_000

function asciiJson(value) {
  return JSON.stringify(value).replace(/[\u007f-\uffff]/g, code =>
    `\\u${code.charCodeAt(0).toString(16).padStart(4, '0')}`)
}

function truncate(text, max) {
  const value = String(text ?? '')
  return value.length > max ? `${value.slice(0, max)}…` : value
}

const ERROR_HINTS = [
  [/Power::infy|Divide::infy/, 'Division by zero or an infinite limit: guard the denominator or use Limit.'],
  [/Part::partw|Part::partd/, 'Part index or depth is wrong: check Length/Dimensions first, or use a default value.'],
  [/Syntax::sntxi|Syntax::bktmcp|Syntax::bktx/, 'Syntax error: check brackets and operators; SyntaxQ can validate an expression before evaluation.'],
  [/General::stop/, 'Further messages were suppressed: fix the first reported error.'],
  [/EntityValue::conopen|Quantity::conopen/, 'Wolfram data services need network access; EntityValue may download metadata on first use.'],
  [/URLRead::offline|Import::nfurl/, 'Internet access is disabled in this call: avoid network functions here or drop the wrapper.'],
  [/CountryData::/, 'CountryData goes through Entity downloads and can hang here; use EntityValue[Entity["Country", ...], ...] instead.'],
  [/Initializing WordData indices|Downloading metadata for type/, 'The kernel is downloading Wolfram data; that can stall for a long time. Postpone the call or widen the timeout.'],
]

function suggestFixes(text) {
  const source = String(text ?? '')
  const hints = []
  for (const [pattern, hint] of ERROR_HINTS) {
    if (pattern.test(source) && !hints.includes(hint)) hints.push(hint)
  }
  return hints
}

/** Heads whose unevaluated result usually means "try another method". */
const INERT_ADVICE = {
  Integrate: 'use NIntegrate for a numeric value, or add Assumptions',
  Solve: 'try Reduce, NSolve or FindInstance',
  Reduce: 'try Solve, FindInstance or numeric methods',
  DSolve: 'try NDSolve, or add Method/Assumptions',
  NDSolve: 'check the range and the initial conditions',
  Simplify: 'try Together/TrigExpand/PowerExpand, or add Assumptions',
  FullSimplify: 'try Simplify with Assumptions',
  Limit: 'check Direction and Assumptions',
  Sum: 'try NSum or a numeric evaluation',
  Series: 'check the expansion point and order',
}
const INERT_PATTERN = /^(Integrate|Solve|Reduce|DSolve|NDSolve|Simplify|FullSimplify|Limit|Sum|Series)\[/

/** Quote a Wolfram Language string literal. */
function wlString(value) {
  return `"${String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n')}"`
}

/** Parse the JSON payload the kernel prints after a marker (e.g. @@WB_VERIFY@@). */
function parseMarker(console, marker) {
  for (const rawLine of String(console ?? '').split(/\r?\n/)) {
    let text = rawLine
    // Print may echo the string in InputForm (quoted, with escapes); decode it.
    if (text.trimStart().startsWith('"')) {
      try { text = JSON.parse(text.trim()) } catch { /* keep the raw line */ }
    }
    const at = text.indexOf(marker)
    if (at < 0) continue
    try {
      return JSON.parse(text.slice(at + marker.length))
    } catch {
      return null
    }
  }
  return null
}

/** Format a JS number as a Wolfram Language literal (WL uses *^, not e). */
function wlReal(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '0.'
  const text = String(number)
  if (!/[eE]/.test(text)) return text.includes('.') ? text : `${text}.`
  const [mantissa, exponent] = text.toLowerCase().split('e')
  return `${mantissa}*^${exponent}`
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function timestamp() {
  const now = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

function slugify(title) {
  const ascii = String(title ?? '').trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return ascii === '' ? 'notebook' : ascii.slice(0, 48)
}

function normalizeCells(args) {
  const cells = []
  if (Array.isArray(args?.cells)) {
    for (const cell of args.cells) {
      if (cell === null || typeof cell !== 'object') continue
      const type = ['input', 'code', 'text', 'title', 'section', 'subsection', 'chapter'].includes(cell.type)
        ? cell.type
        : 'input'
      if (type === 'input' || type === 'code') {
        cells.push({ type, code: String(cell.code ?? '') })
      } else {
        cells.push({ type, text: String(cell.text ?? '') })
      }
      if (cells.length >= 200) break
    }
  }
  if (cells.length === 0 && typeof args?.code === 'string' && args.code.trim() !== '') {
    cells.push({ type: 'input', code: args.code })
  }
  return cells
}

function describeDocument(document, extra) {
  const lines = []
  const inert = []
  const title = String(document?.title ?? '').trim()
  if (title !== '') lines.push(`# ${title}`)
  for (const cell of document?.cells ?? []) {
    const kind = cell?.kind
    const cellType = cell?.cellType
    if (kind === 'text') {
      const text = String(cell.text ?? '').trim()
      if (text !== '') {
        const prefix = cellType === 'title' ? '## ' : cellType === 'section' ? '### ' : ''
        lines.push(`${prefix}${truncate(text, 400)}`)
      }
      continue
    }
    if (cellType === 'input' || cell?.source) {
      const source = String(cell?.source ?? '').trim()
      if (source !== '') lines.push(`In: ${truncate(source, 400)}`)
    }
    if (kind === 'expression') {
      lines.push(`Out: ${truncate(cell.inputForm, 1200)}`)
      const source = String(cell?.source ?? '').trim().replace(/\s+/g, ' ')
      const form = String(cell?.inputForm ?? '').trim().replace(/\s+/g, ' ')
      const match = INERT_PATTERN.exec(form)
      if (match !== null && form === source) inert.push(match[1])
    } else if (kind === 'graphics') {
      lines.push(cell.graphicsFailed === true
        ? 'Out: [graphics could not be rasterized]'
        : 'Out: [graphics rendered in the notebook panel]')
    } else if (kind === 'image') {
      lines.push('Out: [image rendered in the notebook panel]')
    } else if (kind === 'parseError') {
      lines.push('Out: [syntax error: the cell could not be parsed]')
    } else if (kind === 'timedOut') {
      lines.push('Out: [evaluation timed out]')
    }
    if (Number.isFinite(cell?.timingMs) && cell.timingMs >= 1000) {
      lines.push(`(${cell.timingMs} ms)`)
    }
  }
  const console = String(extra?.console ?? '').trim()
  if (inert.length > 0) {
    const heads = [...new Set(inert)]
    const advice = heads.map((head) => `${head}: ${INERT_ADVICE[head] ?? 'try another method'}`).join('; ')
    lines.push(`Hint: the symbolic call returned unevaluated — ${advice}.`)
  }
  if (console !== '') lines.push(`Console:\n${truncate(console, 1500)}`)
  if (extra?.notebookPath) lines.push(`Notebook file: ${extra.notebookPath}`)
  if (extra?.panel === true) {
    lines.push('The rendered notebook is shown in the Wolfram panel beside the conversation.')
  }
  const text = lines.join('\n')
  return text === '' ? 'Wolfram Language evaluation finished without a visible result.' : truncate(text, 6000)
}

const WOLFRAM_KERNEL_KEY = Symbol.for('dsh.wolfram.kernels')
const WOLFRAM_EXIT_KEY = Symbol.for('dsh.wolfram.exitHook')

class WolframKernel {
  constructor(options) {
    this.kernelPath = options.kernelPath
    this.kernelArgs = Array.isArray(options.kernelArgs) ? options.kernelArgs : []
    LIVE_KERNELS.add(this)
    this.cwd = options.cwd
    this.tmpDir = options.tmpDir
    this.timeoutMs = options.timeoutMs
    this.proc = null
    this.buffer = ''
    this.readyPromise = null
    this.startPromise = null
    this.waiters = new Map()
    this.activeId = null
    this.seq = 0
    this.queue = Promise.resolve()
    this.lastUsed = Date.now()
    this.stderr = ''
  }

  get pid() {
    return this.proc?.pid
  }

  async start() {
    mkdirSync(this.tmpDir, { recursive: true })
    const child = spawn(this.kernelPath, ['-noprompt', ...this.kernelArgs], {
      cwd: this.cwd,
      env: process.env,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    this.proc = child
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdin.on('error', () => { /* the kernel may already be gone */ })
    child.stdout.on('data', chunk => this.onData(chunk))
    child.stderr.on('data', chunk => { this.stderr = `${this.stderr}${chunk}`.slice(-4000) })
    child.on('error', error => this.failAll(error))
    child.on('exit', (code) => this.failAll(new Error(`Wolfram kernel exited (code ${code}). ${this.stderr.slice(-800)}`)))

    this.readyPromise = new Promise((resolveReady, rejectReady) => {
      this.resolveReady = resolveReady
      this.rejectReady = rejectReady
    })
    const timer = setTimeout(() => {
      this.rejectReady?.(new Error('Wolfram kernel did not start within 90 seconds.'))
      this.dispose()
    }, START_TIMEOUT_MS)
    this.readyTimer = timer

    child.stdin.write(`Get["${BRIDGE_PATH.replace(/\\/g, '/')}"];\n`)
    child.stdin.write('WolframBridge`Ready[]\n')
    return this.readyPromise
  }

  async ensureStarted() {
    if (this.readyPromise !== null && this.proc !== null) return this.readyPromise
    if (this.startPromise === null) {
      this.startPromise = this.start().finally(() => { this.startPromise = null })
    }
    return this.startPromise
  }

  onData(chunk) {
    this.buffer += chunk
    let index
    while ((index = this.buffer.indexOf('\n')) >= 0) {
      const raw = this.buffer.slice(0, index)
      this.buffer = this.buffer.slice(index + 1)
      this.onLine(raw.endsWith('\r') ? raw.slice(0, -1) : raw)
    }
  }

  onLine(line) {
    if (line.startsWith('@@WB_READY@@')) {
      clearTimeout(this.readyTimer)
      const payload = line.slice('@@WB_READY@@'.length).trim()
      const [bridgeVersion = '', kernelVersion = ''] = payload.split('|')
      this.bridgeVersion = bridgeVersion
      this.kernelVersion = kernelVersion
      if (bridgeVersion !== BRIDGE_VERSION) {
        this.rejectReady?.(new Error(
          `Wolfram bridge version mismatch: host expects ${BRIDGE_VERSION}, bridge.wl reports ${bridgeVersion === '' ? 'none' : bridgeVersion}. Update bridge.wl and index.js together.`))
        this.dispose()
        return
      }
      this.resolveReady?.(payload)
      return
    }
    if (line.startsWith('@@WB_BEGIN@@')) {
      const id = line.slice('@@WB_BEGIN@@'.length).trim()
      this.activeId = id
      const waiter = this.waiters.get(id)
      if (waiter !== undefined) waiter.console = []
      return
    }
    if (line.startsWith('@@WB_DOC@@')) {
      const rest = line.slice('@@WB_DOC@@'.length)
      const split = rest.indexOf('@@')
      const id = rest.slice(0, split)
      const payload = rest.slice(split + 2)
      const waiter = this.waiters.get(id)
      if (waiter === undefined) return
      this.waiters.delete(id)
      clearTimeout(waiter.timer)
      if (this.activeId === id) this.activeId = null
      try {
        let jsonText
        if (/^[A-Za-z]:[\\/]/.test(payload) || payload.startsWith('/')) {
          jsonText = readFileSync(payload, 'utf8').trim()
        } else {
          jsonText = payload
        }
        if (!jsonText.startsWith('{')) jsonText = Buffer.from(jsonText, 'base64').toString('utf8')
        const document = JSON.parse(jsonText)
        try { unlinkSync(waiter.requestPath) } catch { /* ignore */ }
        try { unlinkSync(waiter.responsePath) } catch { /* ignore */ }
        waiter.resolve({ document, console: waiter.console.join('\n') })
      } catch (error) {
        waiter.reject(error)
      }
      return
    }
    const waiter = this.activeId === null ? undefined : this.waiters.get(this.activeId)
    if (waiter !== undefined && line.trim() !== '' && !line.startsWith('@@WB_')) {
      if (!/^Connecting\.\.\./.test(line) && !/^Elapsed time\b/.test(line)) {
        waiter.console.push(line)
        waiter.onOutput?.(line)
      }
    }
  }

  failAll(error) {
    LIVE_KERNELS.delete(this)
    clearTimeout(this.readyTimer)
    this.rejectReady?.(error)
    for (const [id, waiter] of this.waiters) {
      clearTimeout(waiter.timer)
      waiter.reject(error)
      this.waiters.delete(id)
    }
    this.proc = null
    this.readyPromise = null
    this.activeId = null
    this.buffer = ''
  }

  evaluate(request, options = {}) {
    const run = () => this.send(request, options)
    const next = this.queue.then(run, run)
    this.queue = next.catch(() => {})
    return next
  }

  async send(request, options) {
    const signal = options.signal
    if (signal?.aborted) throw new Error('Wolfram evaluation was cancelled.')
    await this.ensureStarted()
    this.lastUsed = Date.now()
    const id = `r${++this.seq}x${Date.now()}`
    const requestPath = join(this.tmpDir, `req-${id}.json`)
    const responsePath = join(this.tmpDir, `resp-${id}.b64`)
    mkdirSync(this.tmpDir, { recursive: true })
    const payload = {
      ...request,
      id,
      respPath: responsePath.replace(/\\/g, '/'),
    }
    writeFileSync(requestPath, asciiJson(payload), 'ascii')
    const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
      ? options.timeoutMs
      : this.timeoutMs
    return new Promise((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => {
        const waiter = this.waiters.get(id)
        const consoleTail = (waiter?.console ?? []).slice(-8).join('\n').trim()
        this.waiters.delete(id)
        const suffix = consoleTail === '' ? '' : `\nLast kernel output:\n${consoleTail}`
        const stuck = /Loading from Wolfram Research server|Downloading metadata for type|Initializing WordData indices/.test(consoleTail)
        const hint = stuck ? '\nHint: the kernel is stuck on a Wolfram network download; pass kernelArgs: ["-pacletreadonly"] or disable "Automatically check for data updates".' : ''
        rejectPromise(new Error(`Wolfram evaluation timed out after ${Math.round(timeoutMs / 1000)} s.${suffix}${hint}`))
        this.dispose()
      }, timeoutMs)
      this.waiters.set(id, {
        console: [],
        onOutput: options.onOutput,
        requestPath,
        responsePath,
        timer,
        resolve: resolvePromise,
        reject: rejectPromise,
      })
      try {
        this.proc.stdin.write(`WolframBridge\`EvalFile["${requestPath.replace(/\\/g, '/')}"];\n`)
      } catch (error) {
        clearTimeout(timer)
        this.waiters.delete(id)
        rejectPromise(error)
      }
    })
  }

  killSync() {
    try { this.proc?.kill() } catch { /* ignore */ }
  }

  dispose() {
    LIVE_KERNELS.delete(this)
    clearTimeout(this.readyTimer)
    const child = this.proc
    this.proc = null
    this.readyPromise = null
    try { child?.stdin.write('Exit[0]\n') } catch { /* ignore */ }
    setTimeout(() => {
      try { child?.kill() } catch { /* ignore */ }
    }, 400)
  }
}

export const inject = ['tools', 'workingDirectory']

export function apply(ctx, config = {}) {
  const registry = (globalThis[WOLFRAM_KERNEL_KEY] instanceof Map)
    ? globalThis[WOLFRAM_KERNEL_KEY]
    : new Map()
  globalThis[WOLFRAM_KERNEL_KEY] = registry

  const stats = { evaluations: 0, timeouts: 0, restarts: 0 }
  const jobs = new Map()
  let jobSeq = 0
  let runningJobs = 0
  if (globalThis[WOLFRAM_EXIT_KEY] !== true) {
    globalThis[WOLFRAM_EXIT_KEY] = true
    process.once('exit', () => {
      for (const kernel of LIVE_KERNELS) kernel.killSync()
    })
  }

  const configuredKernel = config?.kernel ?? ''
  const kernelArgs = Array.isArray(config?.kernelArgs)
    ? config.kernelArgs.filter((arg) => typeof arg === 'string' && arg.trim() !== '')
    : []
  const maxRunningJobs = Number.isFinite(config?.maxRunningJobs) && config.maxRunningJobs > 0
    ? Math.floor(config.maxRunningJobs)
    : DEFAULT_MAX_RUNNING_JOBS
  const timeoutMs = Number.isFinite(config?.timeoutMs) ? config.timeoutMs : DEFAULT_TIMEOUT_MS
  const idleMs = Number.isFinite(config?.idleMs) ? config.idleMs : DEFAULT_IDLE_MS

  const disposeKernel = (key) => {
    const kernel = registry.get(key)
    if (kernel === undefined) return
    registry.delete(key)
    kernel.dispose()
  }

  const kernelFor = (key, options) => {
    let kernel = registry.get(key)
    if (kernel === undefined) {
      kernel = new WolframKernel({ ...options, timeoutMs })
      registry.set(key, kernel)
    }
    return kernel
  }

  let resolvedKernel
  const kernelInfo = () => {
    if (resolvedKernel === undefined) {
      resolvedKernel = resolveKernel({ configured: configuredKernel })
    }
    return resolvedKernel
  }

  const kernelContext = async (exec) => {
    const agent = exec?.agent
    const signal = exec?.signal
    let cwd = process.cwd()
    if (agent !== undefined) {
      try {
        cwd = await ctx.workingDirectory.ensure(agent, signal)
      } catch {
        cwd = agent?.session?.header?.cwd ?? cwd
      }
    }
    const session = agent?.session
    const sessionId = String(session?.header?.id ?? session?.id ?? cwd)
    const tmpDir = join(cwd, PUBLISH_DIR, 'tmp')
    return { cwd, sessionId, tmpDir, signal }
  }

  const publish = (cwd, sessionId, document, extra = {}) => {
    const dir = join(cwd, PUBLISH_DIR)
    mkdirSync(dir, { recursive: true })
    const record = {
      publishedAt: new Date().toISOString(),
      sessionId,
      ...document,
      ...extra,
    }
    writeFileSync(join(dir, LATEST_NAME), JSON.stringify(record), 'utf8')
    return join(dir, LATEST_NAME)
  }

  const evaluateRequest = async (context, request, options = {}) => {
    const kernel = kernelFor(context.sessionId, {
      kernelPath: kernelInfo().path,
      kernelArgs,
      cwd: context.cwd,
      tmpDir: context.tmpDir,
    })
    const perCallTimeout = Number(options.timeoutMs)
    const effectiveTimeout = Number.isFinite(perCallTimeout) && perCallTimeout > 0
      ? perCallTimeout
      : timeoutMs
    try {
      return await kernel.evaluate(request, { signal: context.signal, timeoutMs: effectiveTimeout })
    } catch (error) {
      if (/timed out/i.test(String(error?.message ?? ''))) stats.timeouts += 1
      throw error
    }
  }

  /** Read a .nb through the kernel and publish its document to the panel. */
  const renderNotebookFile = async (context, requestedPath) => {
    const requested = String(requestedPath ?? '').trim().replace(/^["']+|["']+$/g, '')
    if (requested === '') throw new Error('A notebook path is required.')
    const sourcePath = isAbsolute(requested) ? requested : resolve(context.cwd, requested)
    if (!existsSync(sourcePath)) throw new Error(`Notebook not found: ${sourcePath}`)
    if (!/\.nb$/i.test(sourcePath)) throw new Error(`Not a Mathematica notebook (.nb): ${sourcePath}`)
    const response = await evaluateRequest(context, {
      id: `open-${Date.now()}`,
      action: 'open',
      srcPath: sourcePath.replace(/\\/g, '/'),
    })
    const document = response.document
    if (document?.error) throw new Error(`Could not read ${sourcePath}: ${document.error}`)
    publish(context.cwd, context.sessionId, document, { notebookPath: sourcePath, opened: true })
    return { sourcePath, document }
  }

  /** Resolve an optional path argument against the session workspace. */
  const resolveWorkspacePath = (cwd, requested, fallback) => {
    const value = typeof requested === 'string' && requested.trim() !== '' ? requested.trim() : fallback
    return isAbsolute(value) ? value : resolve(cwd, value)
  }

  /**
   * Run one input cell and read the JSON payload it prints after `marker`.
   * Used by wolfram_verify / wolfram_state / wolfram_render so their results do
   * not have to be reverse-engineered from the rendered notebook document.
   */
  const evaluateMarked = async (context, code, marker, prelude = '') => {
    const cells = prelude === ''
      ? [{ type: 'input', code }]
      : [{ type: 'input', code: prelude }, { type: 'input', code }]
    const response = await evaluateRequest(context, {
      id: `marked-${Date.now()}`,
      cells,
    })
    const document = response.document
    if (document?.error) throw new Error(String(document.error))
    const payload = parseMarker(response.console, marker)
    if (payload === null || typeof payload !== 'object') {
      throw new Error(`The kernel produced no structured result. Console:\n${truncate(response.console, 1200)}`)
    }
    return payload
  }

  /** The context a Host command handler runs in (same kernel as the tools). */
  const commandContext = async (agent) => {
    let cwd = process.cwd()
    try {
      cwd = await ctx.workingDirectory.ensure(agent, undefined)
    } catch {
      cwd = agent?.session?.header?.cwd ?? cwd
    }
    const session = agent?.session
    const sessionId = String(session?.header?.id ?? session?.id ?? cwd)
    return { cwd, sessionId, tmpDir: join(cwd, PUBLISH_DIR, 'tmp') }
  }

  const wolframEval = {
    name: 'wolfram_eval',
    description: [
      'Evaluate Wolfram Language (Mathematica) source in a persistent local kernel.',
      'Use it for symbolic algebra, calculus, equation solving, simplifications, matrices, special functions, units, data and any other Wolfram Language work.',
      'Send one or more cells: input cells are evaluated in order and share definitions with earlier calls in the same session; text/title/section cells are display-only.',
      'Every call publishes a notebook document that the Wolfram panel renders beside the conversation, and writes a .nb file unless exportNotebook is false.',
      'The tool result is a compact text summary; use the panel to read the typeset formulas.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'Wolfram Language source for a single input cell. Use this or `cells`.',
        },
        cells: {
          type: 'array',
          description: 'Ordered notebook cells.',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['input', 'code', 'text', 'title', 'section', 'subsection', 'chapter'],
                description: 'input/code cells evaluate; text/title/section cells only display.',
              },
              code: { type: 'string', description: 'Source for input cells.' },
              text: { type: 'string', description: 'Text for display cells.' },
            },
            required: ['type'],
          },
        },
        title: { type: 'string', description: 'Notebook title.' },
        exportNotebook: {
          type: 'boolean',
          description: 'Write a .nb file into the workspace (default true).',
        },
        reset: {
          type: 'boolean',
          description: 'Restart the kernel before evaluating this call (drops earlier definitions).',
        },
        timeoutMs: {
          type: 'number',
          description: 'Per-call timeout in milliseconds; overrides the configured default and restarts the kernel when it elapses.',
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          summary: { type: 'string' },
          cells: { type: 'integer' },
          notebookPath: { type: 'string' },
          message: { type: 'string' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: String(value?.summary ?? '') }],
    },
    async execute(args, exec) {
      stats.evaluations += 1
      const context = await kernelContext(exec)
      const cells = normalizeCells(args)
      if (cells.length === 0) throw new Error('wolfram_eval needs `code` or at least one input cell.')
      if (args?.reset === true) disposeKernel(context.sessionId)
      const title = typeof args?.title === 'string' ? args.title : ''
      const exportNotebook = args?.exportNotebook !== false
      let nbPath
      if (exportNotebook) {
        const dir = join(context.cwd, EXPORT_DIR)
        mkdirSync(dir, { recursive: true })
        nbPath = join(dir, `${slugify(title)}-${timestamp()}.nb`).replace(/\\/g, '/')
      }
      const requestedTimeout = Number(args?.timeoutMs)
      const callTimeout = Number.isFinite(requestedTimeout) && requestedTimeout > 0
        ? requestedTimeout
        : undefined
      const response = await evaluateRequest(context, {
        id: `eval-${Date.now()}`,
        title,
        cells,
        nbPath: nbPath ?? null,
      }, { timeoutMs: callTimeout })
      const document = response.document
      if (document?.error) {
        return {
          ok: false,
          summary: `Wolfram evaluation failed: ${document.error} ${document.detail ?? ''}`.trim(),
          cells: 0,
          message: String(document.error),
        }
      }
      document.console = typeof response.console === 'string' ? response.console : ''
      const latestPath = publish(context.cwd, context.sessionId, document, {
        notebookPath: nbPath ?? '',
        prompt: typeof args?.title === 'string' ? args.title : '',
      })
      const hints = suggestFixes(response.console)
      const summary = describeDocument(document, {
        console: response.console,
        notebookPath: nbPath ? nbPath.replace(/\//g, '\\') : undefined,
        panel: true,
      }) + (hints.length === 0 ? '' : `\nSuggested fix: ${hints.join(' ')}`)
      return {
        ok: true,
        summary,
        cells: Array.isArray(document?.cells) ? document.cells.length : cells.length,
        notebookPath: nbPath ? nbPath.replace(/\//g, '\\') : '',
        message: latestPath,
      }
    },
  }

  const wolframNotebook = {
    name: 'wolfram_notebook',
    description: [
      'Work with Wolfram notebooks in the Wolfram panel beside the conversation.',
      'action=open renders an existing .nb file; action=reset restarts the kernel; action=status reports the kernel.',
      'Relative paths resolve against the session workspace.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['open', 'reset', 'status'],
          description: 'open a notebook file, reset the kernel, or report status.',
        },
        path: { type: 'string', description: 'Notebook path for action=open.' },
      },
      required: ['action'],
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          summary: { type: 'string' },
          notebookPath: { type: 'string' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: String(value?.summary ?? '') }],
    },
    async execute(args, exec) {
      const context = await kernelContext(exec)
      const action = String(args?.action ?? '')
      if (action === 'reset') {
        stats.restarts += 1
        disposeKernel(context.sessionId)
        return { ok: true, summary: 'Wolfram kernel restarted; earlier definitions are gone.', notebookPath: '' }
      }
      if (action === 'status') {
        const kernel = registry.get(context.sessionId)
        let discovery
        try {
          const info = kernelInfo()
          discovery = `Kernel: ${info.path} (found via ${info.source}).`
        } catch (error) {
          discovery = `Kernel discovery failed: ${error.message ?? error}`
        }
        const runtime = kernel === undefined
          ? ''
          : ` Args: ${kernel.kernelArgs.length === 0 ? 'none' : kernel.kernelArgs.join(' ')}. Timeout: ${Math.round(kernel.timeoutMs / 1000)} s.`
        const bridge = ` Bridge: ${kernel?.bridgeVersion ?? 'n/a'} (Mathematica ${kernel?.kernelVersion ?? 'n/a'}). Evaluations: ${stats.evaluations}, timeouts: ${stats.timeouts}, restarts: ${stats.restarts}.`
        const summary = kernel === undefined
          ? `No kernel is running for this session (${context.cwd}). ${discovery}${bridge}`
          : `Wolfram kernel pid ${kernel.pid ?? 'n/a'} in ${context.cwd}. ${discovery}${runtime}${bridge} Notebook documents go to ${join(context.cwd, PUBLISH_DIR, LATEST_NAME)}.`
        return { ok: true, summary, notebookPath: '' }
      }
      const requested = String(args?.path ?? '').trim()
      if (requested === '') throw new Error('wolfram_notebook needs `path` for action=open.')
      try {
        const { sourcePath, document } = await renderNotebookFile(context, requested)
        return {
          ok: true,
          summary: `Rendered ${Array.isArray(document?.cells) ? document.cells.length : 0} cells from ${sourcePath} in the Wolfram panel.`,
          notebookPath: sourcePath,
        }
      } catch (error) {
        return {
          ok: false,
          summary: `Could not open the notebook: ${error?.message ?? error}`,
          notebookPath: requested,
        }
      }
    },
  }

  const startJob = (job) => {
    runningJobs += 1
    job.status = 'running'
    job.startedAt = Date.now()
    const kernel = new WolframKernel({
      kernelPath: kernelInfo().path,
      kernelArgs,
      cwd: job.cwd,
      tmpDir: join(job.tmpDir, 'jobs', job.id),
      timeoutMs: job.timeoutMs,
    })
    job.kernel = kernel
    job.promise = (async () => {
      try {
        const response = await kernel.evaluate(
          { id: job.id, title: job.title, cells: job.cells, nbPath: job.nbPath },
          {
            timeoutMs: job.timeoutMs,
            signal: job.controller.signal,
            onOutput: (line) => {
              if (job.progress[job.progress.length - 1] !== line) job.progress.push(line)
              if (job.progress.length > 20) job.progress.shift()
            },
          },
        )
        const document = response.document
        if (document?.error) {
          job.status = 'failed'
          job.error = String(document.error)
        } else {
          const hints = suggestFixes(response.console)
          job.summary = describeDocument(document, { console: response.console, panel: false })
            + (hints.length === 0 ? '' : `\nSuggested fix: ${hints.join(' ')}`)
          const hasGraphics = Array.isArray(document?.cells)
            && document.cells.some((cell) => cell.kind === 'graphics' || cell.kind === 'image')
          if (hasGraphics) {
            publish(job.cwd, job.sessionId, document, {
              notebookPath: job.nbPath ?? '',
              prompt: job.title,
            })
            job.published = true
            job.summary += '\nGraphics published to the Wolfram panel.'
          }
          job.console = response.console
          job.status = 'done'
        }
      } catch (error) {
        job.status = job.cancelled === true ? 'cancelled' : 'failed'
        if (job.cancelled !== true) job.error = String(error?.message ?? error)
      } finally {
        job.finishedAt = job.finishedAt ?? Date.now()
        kernel.dispose()
        runningJobs -= 1
        pumpJobs()
      }
    })()
  }

  const pumpJobs = () => {
    while (runningJobs < maxRunningJobs) {
      const next = [...jobs.values()].find((job) => job.status === 'queued')
      if (next === undefined) return
      startJob(next)
    }
  }

  const wolframJob = {
    name: 'wolfram_job',
    description: [
      'Run a Wolfram Language evaluation as a background job in its own kernel.',
      'action=submit starts a job and returns its id; status/result/cancel/list manage it.',
      'Use it for long computations that would otherwise hit the 180 s per-call timeout.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['submit', 'status', 'result', 'cancel', 'list'] },
        id: { type: 'string', description: 'Job id for status/result/cancel.' },
        code: { type: 'string', description: 'Wolfram Language source for a submit.' },
        cells: {
          type: 'array',
          description: 'Ordered cells for a submit (same shape as wolfram_eval).',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['input', 'code', 'text', 'title', 'section', 'subsection', 'chapter'] },
              code: { type: 'string' },
              text: { type: 'string' },
            },
            required: ['type'],
          },
        },
        title: { type: 'string', description: 'Job title / notebook title.' },
        timeoutMs: { type: 'number', description: 'Job timeout in milliseconds (default 30 min).' },
        exportNotebook: { type: 'boolean', description: 'Write a .nb file for the job result (default false).' },
      },
      required: ['action'],
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          summary: { type: 'string' },
          jobId: { type: 'string' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: String(value?.summary ?? '') }],
    },
    async execute(args, exec) {
      const context = await kernelContext(exec)
      const action = String(args?.action ?? '')
      const prune = () => {
        const now = Date.now()
        for (const [id, job] of jobs) {
          if (job.status !== 'running' && job.status !== 'queued'
            && now - (job.finishedAt ?? now) > JOB_TTL_MS) jobs.delete(id)
        }
        while (jobs.size > MAX_JOBS) {
          const finished = [...jobs.entries()]
            .find(([, job]) => job.status !== 'running' && job.status !== 'queued')
          if (finished === undefined) break
          jobs.delete(finished[0])
        }
      }
      if (action === 'submit') {
        const cells = normalizeCells(args)
        if (cells.length === 0) throw new Error('wolfram_job submit needs `code` or at least one input cell.')
        prune()
        if (jobs.size >= MAX_JOBS) throw new Error(`Too many jobs (max ${MAX_JOBS}); wait for finished jobs to expire.`)
        const requested = Number(args?.timeoutMs)
        const jobTimeout = Number.isFinite(requested) && requested > 0 ? requested : Math.max(timeoutMs, 30 * 60_000)
        const id = `j${++jobSeq}x${Date.now().toString(36)}`
        const title = typeof args?.title === 'string' ? args.title : ''
        let nbPath = null
        if (args?.exportNotebook === true) {
          const dir = join(context.cwd, EXPORT_DIR)
          mkdirSync(dir, { recursive: true })
          nbPath = join(dir, `job-${slugify(title)}-${timestamp()}.nb`).replace(/\\/g, '/')
        }
        const job = {
          id,
          name: (title || String(args?.code ?? '')).slice(0, 80),
          status: 'queued',
          submittedAt: Date.now(),
          startedAt: null,
          finishedAt: null,
          kernel: null,
          timeoutMs: jobTimeout,
          summary: '',
          console: '',
          progress: [],
          error: null,
          cancelled: false,
          published: false,
          controller: new AbortController(),
          cwd: context.cwd,
          sessionId: context.sessionId,
          tmpDir: context.tmpDir,
          title,
          cells,
          nbPath,
        }
        jobs.set(id, job)
        pumpJobs()
        const state = job.status === 'queued' ? 'queued' : 'submitted'
        return {
          ok: true,
          summary: `Job ${id} ${state} (timeout ${Math.round(jobTimeout / 60_000)} min). Poll with wolfram_job action="status" id="${id}".`,
          jobId: id,
        }
      }
      if (action === 'list') {
        prune()
        const lines = [...jobs.values()]
          .sort((a, b) => a.submittedAt - b.submittedAt)
          .map((job) => {
            const elapsed = Math.round(((job.finishedAt ?? Date.now()) - job.submittedAt) / 1000)
            return `${job.id}\t${job.status}\t${elapsed} s\t${job.name}`
          })
        return { ok: true, summary: lines.length === 0 ? 'No jobs.' : lines.join('\n'), jobId: '' }
      }
      const id = String(args?.id ?? '')
      const job = jobs.get(id)
      if (job === undefined) {
        return { ok: false, summary: `No job with id "${id}". Use action="list" to see known jobs.`, jobId: id }
      }
      const elapsed = Math.round(((job.finishedAt ?? Date.now()) - job.submittedAt) / 1000)
      if (action === 'status') {
        const suffix = job.status === 'failed' && job.error !== null ? ` Error: ${job.error}` : ''
        let extra = ''
        if (job.status === 'queued') {
          const position = [...jobs.values()]
            .filter((item) => item.status === 'queued')
            .findIndex((item) => item.id === job.id) + 1
          extra = `\nPosition in queue: ${position}.`
        } else if (job.status === 'running' && job.progress.length > 0) {
          extra = `\nProgress:\n${job.progress.slice(-10).join('\n')}`
        }
        return { ok: true, summary: `Job ${job.id}: ${job.status} (${elapsed} s).${suffix}${extra}`, jobId: job.id }
      }
      if (action === 'cancel') {
        if (job.status === 'running' || job.status === 'queued') {
          job.cancelled = true
          job.status = 'cancelled'
          job.finishedAt = Date.now()
          job.controller.abort()
          if (job.kernel !== null) job.kernel.killSync()
        }
        return { ok: true, summary: `Job ${job.id}: ${job.status}.`, jobId: job.id }
      }
      if (action === 'result') {
        if (job.status === 'queued') return { ok: false, summary: `Job ${job.id} is queued and has not started yet.`, jobId: job.id }
        if (job.status === 'running') return { ok: false, summary: `Job ${job.id} is still running (${elapsed} s).`, jobId: job.id }
        if (job.status === 'failed') return { ok: false, summary: `Job ${job.id} failed: ${job.error}`, jobId: job.id }
        if (job.status === 'cancelled') return { ok: false, summary: `Job ${job.id} was cancelled.`, jobId: job.id }
        return { ok: true, summary: job.summary === '' ? '(no output)' : job.summary, jobId: job.id }
      }
      throw new Error(`Unknown wolfram_job action: ${action}`)
    },
  }

  const VERIFY_MARKER = '@@WB_VERIFY@@'
  const STATE_MARKER = '@@WB_STATE@@'
  const RENDER_MARKER = '@@WB_RENDER@@'

  /** A simple Wolfram symbol name from an optional user value. */
  const symbolName = (value, fallback) => {
    const name = String(value ?? '').replace(/[^A-Za-z0-9]/g, '')
    return name === '' ? fallback : name
  }

  /** Run one input cell in a throwaway kernel: session definitions cannot leak into a check. */
  const evaluateMarkedIsolated = async (context, code, marker) => {
    const kernel = new WolframKernel({
      kernelPath: kernelInfo().path,
      kernelArgs,
      cwd: context.cwd,
      tmpDir: join(context.tmpDir, 'verify', `run-${Date.now()}`),
      timeoutMs,
    })
    try {
      const response = await kernel.evaluate(
        { id: `verify-${Date.now()}`, cells: [{ type: 'input', code }] },
        { timeoutMs },
      )
      const document = response.document
      if (document?.error) throw new Error(String(document.error))
      const payload = parseMarker(response.console, marker)
      if (payload === null || typeof payload !== 'object') {
        throw new Error(`The verification kernel produced no structured result. Console:\n${truncate(response.console, 1200)}`)
      }
      return payload
    } finally {
      kernel.dispose()
    }
  }

  const wolframVerify = {
    name: 'wolfram_verify',
    description: [
      'Check a result independently instead of trusting it; every check runs in a throwaway kernel, so definitions left in the session cannot skew it.',
      'action=identity proves lhs == rhs symbolically for the listed variables, and falls back to sampling.',
      'action=ode substitutes a candidate solution into an ODE, simplifies the residual, and checks optional initial/boundary conditions.',
      'action=integral compares a definite integral with the claimed closed form, symbolically first.',
      'action=antiderivative differentiates the claimed antiderivative and compares it with the integrand.',
      'status reports verified_symbolic, numerically_consistent (evidence, not proof), falsified, or inconclusive.',
      'Use it after Integrate/DSolve to catch sign, branch and algebra mistakes.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['identity', 'ode', 'integral', 'antiderivative'] },
        lhs: { type: 'string', description: 'Left-hand side for action=identity.' },
        rhs: { type: 'string', description: 'Right-hand side for action=identity.' },
        variables: {
          type: 'array',
          items: { type: 'string' },
          description: 'Variables to sample for action=identity (default ["x"]).',
        },
        range: {
          type: 'array',
          items: { type: 'number' },
          description: 'Sample interval [lo, hi]: identity [-5, 5], ODE [0, 1], antiderivative [-5, 5].',
        },
        samples: { type: 'number', description: 'Number of random samples or evaluation points (default 8).' },
        tolerance: { type: 'number', description: 'Absolute tolerance (default 1e-9).' },
        assumptions: {
          type: 'string',
          description: 'Assumptions for the symbolic check of every action, e.g. "x >= 0" or "a > 0".',
        },
        ode: { type: 'string', description: 'ODE as an equation, e.g. "y\'[x] == y[x]".' },
        solution: { type: 'string', description: 'Candidate solution expression for action=ode.' },
        conditions: {
          type: 'array',
          items: { type: 'string' },
          description: 'Initial/boundary conditions checked with action=ode, e.g. ["y[0] == 1"].',
        },
        function: { type: 'string', description: 'Dependent function symbol (default "y").' },
        variable: { type: 'string', description: 'Independent variable (default "x").' },
        integral: { type: 'string', description: 'Definite integral expression, e.g. "Integrate[Exp[-x^2], {x, 0, 1}]".' },
        integrand: { type: 'string', description: 'Integrand expression for action=antiderivative, e.g. "Sin[x]".' },
        result: { type: 'string', description: 'Claimed closed form for action=integral, or claimed antiderivative for action=antiderivative.' },
      },
      required: ['action'],
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          status: { type: 'string' },
          summary: { type: 'string' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: String(value?.summary ?? '') }],
    },
    async execute(args, exec) {
      const context = await kernelContext(exec)
      const action = String(args?.action ?? '')
      const samples = Math.max(2, Math.min(200, Math.floor(Number(args?.samples) || 8)))
      const tolerance = Number.isFinite(Number(args?.tolerance)) && Number(args.tolerance) > 0
        ? Number(args.tolerance)
        : 1e-9
      const range = Array.isArray(args?.range) && args.range.length === 2 && args.range.every(isFiniteNumber)
        ? args.range
        : null
      const assumptions = typeof args?.assumptions === 'string' && args.assumptions.trim() !== ''
        ? args.assumptions.trim()
        : 'True'
      const sym = symbolName(args?.variable, 'x')
      const fun = symbolName(args?.function, 'y')
      /** Turn a structured kernel verdict into the tool result. */
      const verdict = (payload, { ok, symbolic, numeric, bad, inconclusive, note }) => {
        const status = String(payload.status ?? (payload.ok === true ? 'verified_symbolic' : 'falsified'))
        if (status === 'verified_symbolic') {
          return { ok: true, status, summary: `OK: ${symbolic}${note === '' ? '' : ` ${note}`}` }
        }
        if (status === 'numerically_consistent') {
          return { ok: true, status, summary: `OK (numerical check only, not a proof): ${numeric(payload)}${note === '' ? '' : ` ${note}`}` }
        }
        if (status === 'inconclusive') {
          return { ok: false, status, summary: `INCONCLUSIVE: ${inconclusive}${note === '' ? '' : ` ${note}`}` }
        }
        return { ok: false, status: 'falsified', summary: `FAILED: ${bad(payload)}${note === '' ? '' : ` ${note}`}` }
      }
      if (action === 'identity') {
        const lhs = String(args?.lhs ?? '').trim()
        const rhs = String(args?.rhs ?? '').trim()
        if (lhs === '' || rhs === '') throw new Error('wolfram_verify identity needs `lhs` and `rhs`.')
        const variables = Array.isArray(args?.variables) && args.variables.length > 0
          ? args.variables.map((name) => String(name))
          : ['x']
        const vars = variables.map((name) => `Symbol[${wlString(name)}]`).join(', ')
        const lo = range ? range[0] : -5
        const hi = range ? range[1] : 5
        const code = `Module[{lhs = ${lhs}, rhs = ${rhs}, vars = {${vars}}, lo = ${lo}, hi = ${hi}, n = ${samples}, tol = ${wlReal(tolerance)}, ass = ${assumptions}, simplified, diffs, finite, maxErr},
  simplified = TimeConstrained[Quiet@Check[FullSimplify[lhs - rhs, ass], $Failed], 30, $Failed];
  If[simplified === 0,
    Print["${VERIFY_MARKER}" <> "{\\"status\\":\\"verified_symbolic\\",\\"ok\\":true,\\"maxError\\":0}"],
    diffs = Table[With[{v = Table[RandomReal[{lo, hi}], {Length[vars]}]}, Quiet@Check[N[(lhs - rhs) /. Thread[vars -> v]], Indeterminate]], {n}];
    finite = Select[diffs, NumericQ[#] && NumberQ[#] &];
    If[finite === {},
      Print["${VERIFY_MARKER}" <> "{\\"status\\":\\"inconclusive\\",\\"ok\\":false}"],
      maxErr = Max[Abs[finite]];
      Print["${VERIFY_MARKER}" <> StringReplace[ExportString[<|"status" -> If[maxErr < tol, "numerically_consistent", "falsified"], "ok" -> maxErr < tol, "maxError" -> maxErr, "samples" -> Length[finite]|>, "JSON"], "\\n" -> ""]]
    ]
  ];
];`
        const payload = await evaluateMarkedIsolated(context, code, VERIFY_MARKER)
        return verdict(payload, {
          symbolic: `identity proved symbolically (FullSimplify[lhs - rhs] == 0${assumptions === 'True' ? '' : ` under assumptions ${assumptions}`}).`,
          numeric: (value) => `max error ${value.maxError} over ${value.samples} samples.`,
          bad: (value) => `max error ${value.maxError} exceeds tolerance ${tolerance} over ${value.samples} samples.`,
          inconclusive: 'symbolic simplification and every sampled point were inconclusive.',
          note: '',
        })
      }
      if (action === 'ode') {
        const ode = String(args?.ode ?? '').trim()
        const solution = String(args?.solution ?? '').trim()
        if (ode === '' || solution === '') throw new Error('wolfram_verify ode needs `ode` and `solution`.')
        const conditions = Array.isArray(args?.conditions)
          ? args.conditions.map((item) => String(item).trim()).filter((item) => item !== '')
          : []
        const conditionList = conditions.length === 0 ? '{}' : `{${conditions.join(', ')}}`
        const conditionNote = conditions.length === 0 ? '' : `; checked ${conditions.length} initial/boundary condition(s).`
        const lo = range ? range[0] : 0
        const hi = range ? range[1] : 1
        const code = `Module[{odeExpr = ${ode}, solExpr = ${solution}, conds = ${conditionList}, ass = ${assumptions}, fun = Symbol[${wlString(fun)}], var = Symbol[${wlString(sym)}], lo = ${lo}, hi = ${hi}, n = ${samples}, tol = ${wlReal(tolerance)}, rules, residual, condResiduals, vals, finite, condValues, maxErr, symbolic},
  rules = {Derivative[k_Integer][fun][arg_] :> (D[solExpr, {var, k}] /. var -> arg), fun[arg_] :> (solExpr /. var -> arg)};
  residual = Quiet@Check[FullSimplify[odeExpr /. Equal -> Subtract /. rules, ass], $Failed];
  condResiduals = Quiet@Check[FullSimplify[# /. Equal -> Subtract /. rules, ass] & /@ conds, $Failed];
  symbolic = residual === 0 && (condResiduals === {} || (ListQ[condResiduals] && AllTrue[condResiduals, # === 0 &]));
  If[symbolic,
    Print["${VERIFY_MARKER}" <> StringReplace[ExportString[<|"status" -> "verified_symbolic", "ok" -> True, "maxError" -> 0, "conditions" -> Length[conds]|>, "JSON"], "\\n" -> ""]],
    If[condResiduals === $Failed,
      Print["${VERIFY_MARKER}" <> StringReplace[ExportString[<|"status" -> "inconclusive", "ok" -> False, "reason" -> "conditions"|>, "JSON"], "\\n" -> ""]],
      vals = Table[Quiet@Check[N[residual /. var -> (lo + (hi - lo) i/n)], Indeterminate], {i, 0, n}];
      finite = Select[vals, NumericQ[#] && NumberQ[#] &];
      condValues = Quiet@Check[N[condResiduals], {}];
      If[finite === {} || (conds =!= {} && ! AllTrue[condValues, NumericQ[#] && NumberQ[#] &]),
        Print["${VERIFY_MARKER}" <> StringReplace[ExportString[<|"status" -> "inconclusive", "ok" -> False|>, "JSON"], "\\n" -> ""]],
        maxErr = Max[Abs[finite]];
        Print["${VERIFY_MARKER}" <> StringReplace[ExportString[<|"status" -> If[maxErr < tol && AllTrue[condValues, TrueQ[Abs[#] < tol] &], "numerically_consistent", "falsified"], "ok" -> maxErr < tol && AllTrue[condValues, TrueQ[Abs[#] < tol] &], "maxError" -> maxErr, "samples" -> Length[finite], "conditions" -> Length[conds]|>, "JSON"], "\\n" -> ""]]
      ]
    ]
  ];
];`
        const payload = await evaluateMarkedIsolated(context, code, VERIFY_MARKER)
        return verdict(payload, {
          symbolic: `the solution satisfies the ODE on [${lo}, ${hi}]${assumptions === 'True' ? '' : ` under assumptions ${assumptions}`}${conditionNote}`,
          numeric: (value) => `residual ≤ ${value.maxError} over ${value.samples} points on [${lo}, ${hi}]${conditionNote}`,
          bad: (value) => `residual ${value.maxError === undefined ? 'or a condition residual' : value.maxError} exceeds tolerance ${tolerance} on [${lo}, ${hi}]${conditionNote}`,
          inconclusive: 'the residual or a condition could not be evaluated on the requested range.',
          note: `Checked in a fresh kernel on [${lo}, ${hi}].`,
        })
      }
      if (action === 'integral') {
        const integral = String(args?.integral ?? '').trim()
        const result = String(args?.result ?? '').trim()
        if (integral === '' || result === '') throw new Error('wolfram_verify integral needs `integral` and `result`.')
        const code = `Module[{integral = ${integral}, claimed = ${result}, ass = ${assumptions}, tol = ${wlReal(tolerance)}, diff, numericDiff},
  diff = TimeConstrained[Quiet@Check[FullSimplify[integral - claimed, ass], $Failed], 30, $Failed];
  If[diff === 0,
    Print["${VERIFY_MARKER}" <> StringReplace[ExportString[<|"status" -> "verified_symbolic", "ok" -> True|>, "JSON"], "\\n" -> ""]],
    numericDiff = Quiet@Check[N[Abs[integral - claimed]], Indeterminate];
    Which[
      NumberQ[numericDiff] && TrueQ[numericDiff < tol],
        Print["${VERIFY_MARKER}" <> StringReplace[ExportString[<|"status" -> "numerically_consistent", "ok" -> True, "difference" -> numericDiff|>, "JSON"], "\\n" -> ""]],
      NumberQ[numericDiff],
        Print["${VERIFY_MARKER}" <> StringReplace[ExportString[<|"status" -> "falsified", "ok" -> False, "difference" -> numericDiff|>, "JSON"], "\\n" -> ""]],
      True,
        Print["${VERIFY_MARKER}" <> StringReplace[ExportString[<|"status" -> "inconclusive", "ok" -> False|>, "JSON"], "\\n" -> ""]]
    ]
  ];
];`
        const payload = await evaluateMarkedIsolated(context, code, VERIFY_MARKER)
        return verdict(payload, {
          symbolic: `the claimed value matches the integral symbolically (difference 0${assumptions === 'True' ? '' : ` under assumptions ${assumptions}`}).`,
          numeric: (value) => `the difference is ${value.difference} (symbolic simplification did not settle it).`,
          bad: (value) => `the closed form differs from the integral (difference ${value.difference}).`,
          inconclusive: 'Mathematica could not reduce the difference to zero or evaluate it numerically; add `assumptions` for a symbolic check.',
          note: '',
        })
      }
      if (action === 'antiderivative') {
        const integrand = String(args?.integrand ?? '').trim()
        const result = String(args?.result ?? '').trim()
        if (integrand === '' || result === '') throw new Error('wolfram_verify antiderivative needs `integrand` and `result`.')
        const lo = range ? range[0] : -5
        const hi = range ? range[1] : 5
        const code = `Module[{integrand = ${integrand}, candidate = ${result}, ass = ${assumptions}, var = Symbol[${wlString(sym)}], lo = ${lo}, hi = ${hi}, n = ${samples}, tol = ${wlReal(tolerance)}, diff, values, finite, maxErr},
  diff = TimeConstrained[Quiet@Check[FullSimplify[D[candidate, var] - integrand, ass], $Failed], 30, $Failed];
  If[diff === 0,
    Print["${VERIFY_MARKER}" <> StringReplace[ExportString[<|"status" -> "verified_symbolic", "ok" -> True, "maxError" -> 0|>, "JSON"], "\\n" -> ""]],
    values = Table[Quiet@Check[N[diff /. var -> (lo + (hi - lo) i/n)], Indeterminate], {i, 0, n}];
    finite = Select[values, NumericQ[#] && NumberQ[#] &];
    If[finite === {},
      Print["${VERIFY_MARKER}" <> StringReplace[ExportString[<|"status" -> "inconclusive", "ok" -> False|>, "JSON"], "\\n" -> ""]],
      maxErr = Max[Abs[finite]];
      Print["${VERIFY_MARKER}" <> StringReplace[ExportString[<|"status" -> If[maxErr < tol, "numerically_consistent", "falsified"], "ok" -> maxErr < tol, "maxError" -> maxErr, "samples" -> Length[finite]|>, "JSON"], "\\n" -> ""]]
    ]
  ];
];`
        const payload = await evaluateMarkedIsolated(context, code, VERIFY_MARKER)
        return verdict(payload, {
          symbolic: `the derivative of the candidate matches the integrand symbolically (difference 0${assumptions === 'True' ? '' : ` under assumptions ${assumptions}`}).`,
          numeric: (value) => `derivative residual ≤ ${value.maxError} over ${value.samples} points on [${lo}, ${hi}]; a constant of integration is not checked.`,
          bad: (value) => `derivative of the candidate differs from the integrand (residual ${value.maxError}) on [${lo}, ${hi}].`,
          inconclusive: 'the derivative residual could not be simplified or sampled.',
          note: '',
        })
      }
      throw new Error(`Unknown wolfram_verify action: ${action}`)
    },
  }

  const wolframState = {
    name: 'wolfram_state',
    description: [
      'Inspect or persist the state of the persistent kernel.',
      'action=status reports Global symbol count, memory, assumptions and packages.',
      'action=symbols lists definitions matching a name pattern.',
      'action=save writes the Global context with DumpSave; action=load restores it. Both use `.dsh-wolfram/state-<timestamp>.mx` unless `path` is given.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['status', 'symbols', 'save', 'load', 'clear'] },
        path: { type: 'string', description: 'State file for save/load; defaults to .dsh-wolfram/state-<timestamp>.mx.' },
        pattern: { type: 'string', description: 'Name pattern for action=symbols (default "Global`*").' },
        limit: { type: 'number', description: 'Maximum number of names to list (default 100).' },
      },
      required: ['action'],
    },
    output: {
      schema: {
        type: 'object',
        properties: { ok: { type: 'boolean' }, summary: { type: 'string' }, path: { type: 'string' } },
      },
      render: (_args, value) => [{ type: 'text', text: String(value?.summary ?? '') }],
    },
    async execute(args, exec) {
      const context = await kernelContext(exec)
      const action = String(args?.action ?? '')
      if (action === 'status') {
        const code = `Module[{},
  Print["${STATE_MARKER}" <> StringReplace[ExportString[<|"ok" -> True,
    "symbols" -> Length[Names["Global\`*"]],
    "memoryMB" -> N[MemoryInUse[]/1048576.],
    "assumptions" -> ToString[$Assumptions, InputForm],
    "packages" -> Length[$Packages]|>, "JSON"], "\\n" -> ""]];
];`
        const payload = await evaluateMarked(context, code, STATE_MARKER)
        const assumptions = payload.assumptions === 'True' ? 'none' : String(payload.assumptions)
        return {
          ok: true,
          summary: `Global symbols: ${payload.symbols}. Memory: ${Number(payload.memoryMB).toFixed(1)} MB. Assumptions: ${assumptions}. Packages: ${payload.packages}.`,
        }
      }
      if (action === 'symbols') {
        const pattern = String(args?.pattern ?? 'Global`*')
        const limit = Math.max(1, Math.min(500, Math.floor(Number(args?.limit) || 100)))
        const code = `Module[{names = Select[Names[${wlString(pattern)}],
    StringFreeQ[#, "$"] && (ToExpression[#, InputForm, Hold] /. Hold[s_] :>
      (Length[OwnValues[s]] + Length[DownValues[s]] + Length[UpValues[s]] + Length[SubValues[s]] > 0)) &]},
  Print["${STATE_MARKER}" <> StringReplace[ExportString[<|"ok" -> True, "count" -> Length[names],
    "names" -> Take[names, UpTo[${limit}]]|>, "JSON"], "\\n" -> ""]];
];`
        const payload = await evaluateMarked(context, code, STATE_MARKER)
        return {
          ok: true,
          summary: `${payload.count} name(s) matching ${pattern}:\n${(payload.names ?? []).join('\n')}`,
        }
      }
      const file = resolveWorkspacePath(context.cwd, args?.path, join(PUBLISH_DIR, `state-${timestamp()}.mx`))
      mkdirSync(dirname(file), { recursive: true })
      const wlPath = wlString(file.replace(/\\/g, '/'))
      if (action === 'save') {
        const code = `Module[{file = ${wlPath}, ok = False, bytes = 0},
  Quiet@Check[DumpSave[file, "Global\`"]; ok = FileExistsQ[file], ok = False];
  bytes = If[ok, FileByteCount[file], 0];
  Print["${STATE_MARKER}" <> StringReplace[ExportString[<|"ok" -> ok, "path" -> file, "bytes" -> bytes|>, "JSON"], "\\n" -> ""]];
];`
        const payload = await evaluateMarked(context, code, STATE_MARKER)
        const ok = payload.ok === true
        return {
          ok,
          summary: ok
            ? `Saved the Global context to ${file} (${payload.bytes} bytes).`
            : `Could not save the kernel state to ${file}.`,
          path: file,
        }
      }
      if (action === 'load') {
        const code = `Module[{file = ${wlPath}, exists, res = $Failed},
  exists = FileExistsQ[file];
  If[exists, res = Quiet@Get[file]];
  Print["${STATE_MARKER}" <> StringReplace[ExportString[<|"ok" -> (exists && res =!= $Failed), "exists" -> exists, "path" -> file, "result" -> ToString[InputForm[res]]|>, "JSON"], "\\n" -> ""]];
];`
        const payload = await evaluateMarked(context, code, STATE_MARKER)
        const ok = payload.ok === true
        return {
          ok,
          summary: ok
            ? `Loaded kernel state from ${file}.`
            : `Could not load kernel state from ${file} (exists: ${payload.exists}, path: ${payload.path}, result: ${payload.result}).`,
          path: file,
        }
      }
      if (action === 'clear') {
        const code = `Module[{names},
  names = Select[Names["Global\`*"], StringFreeQ[#, "$"] &];
  Quiet@(ClearAll /@ names);
  Print["${STATE_MARKER}" <> StringReplace[ExportString[<|"ok" -> True, "cleared" -> Length[names]|>, "JSON"], "\\n" -> ""]];
];`
        const payload = await evaluateMarked(context, code, STATE_MARKER)
        return { ok: payload.ok === true, summary: `Cleared ${payload.cleared} Global symbol(s) (names without "$").` }
      }
      throw new Error(`Unknown wolfram_state action: ${action}`)
    },
  }

  const wolframRender = {
    name: 'wolfram_render',
    description: [
      'Render a Wolfram Language graphics expression to an image file (PNG/SVG/PDF/JPG) with publication defaults.',
      'Use it instead of hand-writing Export: it creates the target directory, sets ImageResolution and reports the file size.',
      'Example: expr="Plot[Sin[x], {x, 0, 2 Pi}]", format="png".',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        expr: { type: 'string', description: 'Graphics expression, e.g. "Plot[...]" or "Graphics[...]".' },
        format: { type: 'string', enum: ['png', 'svg', 'pdf', 'jpg'], description: 'Output format (default png).' },
        path: { type: 'string', description: 'Output path; defaults to wolfram-plots/render-<timestamp>.<format>.' },
        imageResolution: { type: 'number', description: 'ImageResolution in dpi (default 200).' },
      },
      required: ['expr'],
    },
    output: {
      schema: {
        type: 'object',
        properties: { ok: { type: 'boolean' }, summary: { type: 'string' }, path: { type: 'string' } },
      },
      render: (_args, value) => [{ type: 'text', text: String(value?.summary ?? '') }],
    },
    async execute(args, exec) {
      const context = await kernelContext(exec)
      const expr = String(args?.expr ?? '').trim()
      if (expr === '') throw new Error('wolfram_render needs `expr`.')
      const format = ['png', 'svg', 'pdf', 'jpg'].includes(String(args?.format))
        ? String(args.format)
        : 'png'
      const resolution = Number.isFinite(Number(args?.imageResolution))
        ? Math.max(48, Math.min(2400, Number(args.imageResolution)))
        : 200
      const file = resolveWorkspacePath(context.cwd, args?.path, join('wolfram-plots', `render-${timestamp()}.${format}`))
      mkdirSync(dirname(file), { recursive: true })
      const maTeXPrelude = /MaTeX\s*\[/.test(expr) ? 'Needs["MaTeX`"];' : ''
      const code = `Module[{img = ${expr}, file = ${wlString(file.replace(/\\/g, '/'))}, res = ${resolution}, ok = False, bytes = 0},
  Quiet@Check[Export[file, img, ImageResolution -> res], Null];
  bytes = If[FileExistsQ[file], FileByteCount[file], 0];
  ok = bytes > 0;
  Print["${RENDER_MARKER}" <> StringReplace[ExportString[<|"ok" -> ok, "path" -> file, "bytes" -> bytes|>, "JSON"], "\\n" -> ""]];
];`
      const payload = await evaluateMarked(context, code, RENDER_MARKER, maTeXPrelude)
      const ok = payload.ok === true
      return {
        ok,
        summary: ok
          ? `Rendered ${format.toUpperCase()} to ${file} (${payload.bytes} bytes).`
          : `Could not render ${format.toUpperCase()} to ${file}.`,
        path: file,
      }
    },
  }

  const wolframBatch = {
    name: 'wolfram_batch',
    description: [
      'Run several independent Wolfram Language snippets, each in its own kernel, and collect the results.',
      'Use it for parameter sweeps where every item is independent; `maxParallel` kernels run at once.',
      'Each item is evaluated from scratch, so definitions from wolfram_eval are not visible.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        codes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Wolfram Language snippets, one per kernel.',
        },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              title: { type: 'string' },
            },
            required: ['code'],
          },
          description: 'Richer form of `codes`: each item may carry a title.',
        },
        maxParallel: { type: 'number', description: 'Concurrent kernels (default 4).' },
        timeoutMs: { type: 'number', description: 'Per-item timeout in milliseconds (default: configured).' },
      },
    },
    output: {
      schema: {
        type: 'object',
        properties: { ok: { type: 'boolean' }, summary: { type: 'string' }, items: { type: 'integer' } },
      },
      render: (_args, value) => [{ type: 'text', text: String(value?.summary ?? '') }],
    },
    async execute(args, exec) {
      const context = await kernelContext(exec)
      const raw = Array.isArray(args?.items)
        ? args.items
        : Array.isArray(args?.codes) ? args.codes.map((code) => ({ code })) : []
      const items = raw
        .slice(0, MAX_BATCH)
        .map((item) => ({ code: String(item?.code ?? ''), title: String(item?.title ?? '') }))
        .filter((item) => item.code.trim() !== '')
      if (items.length === 0) throw new Error('wolfram_batch needs `codes` or `items` with a `code`.')
      const parallel = Math.max(1, Math.min(items.length, Math.floor(Number(args?.maxParallel) || DEFAULT_BATCH_PARALLEL)))
      const perItemTimeout = Number.isFinite(Number(args?.timeoutMs)) && Number(args.timeoutMs) > 0
        ? Number(args.timeoutMs)
        : timeoutMs
      const results = new Array(items.length)
      let cursor = 0
      const worker = async () => {
        while (cursor < items.length) {
          const index = cursor
          cursor += 1
          const item = items[index]
          const kernel = new WolframKernel({
            kernelPath: kernelInfo().path,
            kernelArgs,
            cwd: context.cwd,
            tmpDir: join(context.tmpDir, 'batch', `item-${index + 1}`),
            timeoutMs: perItemTimeout,
          })
          try {
            const response = await kernel.evaluate({
              id: `batch-${index + 1}`,
              title: item.title,
              cells: [{ type: 'input', code: item.code }],
            }, { timeoutMs: perItemTimeout })
            const document = response.document
            if (document?.error) {
              results[index] = { ok: false, summary: String(document.error) }
            } else {
              const hints = suggestFixes(response.console)
              results[index] = {
                ok: true,
                summary: describeDocument(document, { console: response.console })
                  + (hints.length === 0 ? '' : `\nSuggested fix: ${hints.join(' ')}`),
              }
            }
          } catch (error) {
            results[index] = { ok: false, summary: String(error?.message ?? error) }
          } finally {
            kernel.dispose()
          }
        }
      }
      const started = Date.now()
      await Promise.all(Array.from({ length: parallel }, worker))
      const okCount = results.filter((result) => result.ok).length
      const seconds = ((Date.now() - started) / 1000).toFixed(1)
      const lines = [`Batch: ${items.length} item(s), ${okCount} ok, ${items.length - okCount} failed in ${seconds} s (parallel ${parallel}).`]
      results.forEach((result, index) => {
        lines.push(`[${index + 1}] ${result.ok ? 'OK' : 'FAILED'}: ${truncate(result.summary, 800)}`)
      })
      return { ok: okCount === items.length, summary: lines.join('\n'), items: items.length }
    },
  }

  ctx.effect(() => ctx.tools.register(wolframEval), 'wolfram notebook: wolfram_eval tool')
  ctx.effect(() => ctx.tools.register(wolframNotebook), 'wolfram notebook: wolfram_notebook tool')
  ctx.effect(() => ctx.tools.register(wolframJob), 'wolfram notebook: wolfram_job tool')
  ctx.effect(() => ctx.tools.register(wolframVerify), 'wolfram notebook: wolfram_verify tool')
  ctx.effect(() => ctx.tools.register(wolframState), 'wolfram notebook: wolfram_state tool')
  ctx.effect(() => ctx.tools.register(wolframRender), 'wolfram notebook: wolfram_render tool')
  ctx.effect(() => ctx.tools.register(wolframBatch), 'wolfram notebook: wolfram_batch tool')

  ctx.effect(() => () => {
    for (const job of jobs.values()) {
      job.cancelled = true
      job.controller.abort()
      job.kernel.killSync()
    }
    jobs.clear()
  }, 'wolfram notebook: job kernels')

  const commands = typeof ctx.get === 'function' ? ctx.get('commands') : undefined
  if (commands !== undefined) {
    ctx.effect(() => commands.register({
      name: 'wolfram-open',
      description: 'Open a Wolfram notebook (.nb) in the Wolfram panel',
      input: { hint: '<path to .nb>' },
      handler: async ({ agent, rawInput }) => {
        try {
          const context = await commandContext(agent)
          const { sourcePath, document } = await renderNotebookFile(context, rawInput)
          const cells = Array.isArray(document?.cells) ? document.cells.length : 0
          return { kind: 'success', text: `Opened ${sourcePath} (${cells} cells) in the Wolfram panel.` }
        } catch (error) {
          return { kind: 'error', text: String(error?.message ?? error) }
        }
      },
    }), 'wolfram notebook: wolfram-open command')
  }

  ctx.effect(() => {
    const timer = setInterval(() => {
      const now = Date.now()
      for (const [key, kernel] of registry) {
        if (now - kernel.lastUsed > idleMs && kernel.waiters.size === 0) {
          registry.delete(key)
          kernel.dispose()
        }
      }
    }, 60_000)
    return () => {
      clearInterval(timer)
      for (const [key, kernel] of registry) {
        registry.delete(key)
        kernel.dispose()
      }
    }
  }, 'wolfram notebook: kernel lifecycle')
}
