import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, unlinkSync, existsSync, writeFileSync } from 'node:fs'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { apply } from '../index.js'
import { initMathWorkspace, isInsideRepository, checkEnvironment, initGitRepository, gitSnapshot } from '../scaffold.js'

/**
 * Boot the plugin against a fake Cordis context and the real local kernel.
 * `effect` runs registrations immediately and keeps their cleanups so a test
 * can tear the kernel down afterwards.
 */
function makeHarness(config = {}) {
  const tools = new Map()
  const cleanups = []
  const ctx = {
    effect(fn) {
      const cleanup = fn()
      if (typeof cleanup === 'function') cleanups.push(cleanup)
    },
    get() { return undefined },
    tools: { register(tool) { tools.set(tool.name, tool) } },
    workingDirectory: { ensure: async () => process.cwd() },
  }
  apply(ctx, config)
  return { tools, cleanups }
}

function teardown(t, cleanups) {
  t.after(() => { for (const cleanup of cleanups) cleanup() })
}

/** The per-user documentation is optional on a fresh machine; doc tests skip without it. */
function documentationAvailable() {
  const local = process.env.LOCALAPPDATA
  if (typeof local !== 'string' || local === '') return false
  return existsSync(join(local, 'Programs', 'Common', 'Wolfram Research', 'Documentation.en-us'))
}

test('kernelArgs are passed to the kernel process', async (t) => {
  const { tools, cleanups } = makeHarness({ kernelArgs: ['-pacletreadonly'], timeoutMs: 60_000 })
  teardown(t, cleanups)

  const result = await tools.get('wolfram_eval').execute(
    { code: 'MemberQ[$CommandLine, "-pacletreadonly"]', exportNotebook: false },
    {},
  )

  assert.match(result.summary, /True/)
})

test('per-call timeoutMs is honored and the timeout error carries the kernel console', async (t) => {
  const { tools, cleanups } = makeHarness({ timeoutMs: 60_000 })
  teardown(t, cleanups)

  await assert.rejects(
    () => tools.get('wolfram_eval').execute(
      { code: 'Print["HELLO_TIMEOUT"]; Pause[10]; 1', timeoutMs: 1_500, exportNotebook: false },
      {},
    ),
    (error) => {
      assert.match(error.message, /timed out/i)
      assert.match(error.message, /HELLO_TIMEOUT/)
      return true
    },
  )
})

test('common error messages come back with a suggested fix', async (t) => {
  const { tools, cleanups } = makeHarness({ timeoutMs: 60_000 })
  teardown(t, cleanups)

  const result = await tools.get('wolfram_eval').execute(
    { code: '1/0', exportNotebook: false },
    {},
  )

  assert.match(result.summary, /Suggested fix/)
})

test('status reports the bridge version and evaluation counters', async (t) => {
  const { tools, cleanups } = makeHarness({ timeoutMs: 60_000 })
  teardown(t, cleanups)

  await tools.get('wolfram_eval').execute({ code: '1 + 1', exportNotebook: false }, {})
  const status = await tools.get('wolfram_notebook').execute({ action: 'status' }, {})

  assert.match(status.summary, /Bridge: 1\.3\.3/)
  assert.match(status.summary, /Evaluations: 1/)
})

async function waitForJob(jobTool, id, timeoutMs = 30_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const result = await jobTool.execute({ action: 'result', id }, {})
    if (!/still running/.test(result.summary)) return result
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('job did not finish in time')
}

test('a submitted job runs out of process and returns its result', async (t) => {
  const { tools, cleanups } = makeHarness({ timeoutMs: 60_000 })
  teardown(t, cleanups)

  const jobTool = tools.get('wolfram_job')
  const submitted = await jobTool.execute({ action: 'submit', code: 'Total[Range[100]]' }, {})
  const id = /id="([^"]+)"/.exec(submitted.summary)[1]

  const result = await waitForJob(jobTool, id)
  assert.match(result.summary, /5050/)
})

test('a running job exposes the console lines it printed', async (t) => {
  const { tools, cleanups } = makeHarness({ timeoutMs: 60_000 })
  teardown(t, cleanups)

  const jobTool = tools.get('wolfram_job')
  const submitted = await jobTool.execute(
    { action: 'submit', code: 'Do[Print["tick ", i]; Pause[0.7], {i, 4}]; 42' },
    {},
  )
  const id = /id="([^"]+)"/.exec(submitted.summary)[1]

  let sawProgress = false
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    const status = await jobTool.execute({ action: 'status', id }, {})
    if (/tick/.test(status.summary)) { sawProgress = true; break }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  assert.ok(sawProgress, 'progress lines should be visible in status')

  const result = await waitForJob(jobTool, id)
  assert.match(result.summary, /42/)
})

test('a running job can be cancelled', async (t) => {
  const { tools, cleanups } = makeHarness({ timeoutMs: 60_000 })
  teardown(t, cleanups)

  const jobTool = tools.get('wolfram_job')
  const submitted = await jobTool.execute({ action: 'submit', code: 'Pause[60]' }, {})
  const id = /id="([^"]+)"/.exec(submitted.summary)[1]

  const cancelled = await jobTool.execute({ action: 'cancel', id }, {})
  assert.match(cancelled.summary, /cancel/i)

  await new Promise((resolve) => setTimeout(resolve, 300))

  const status = await jobTool.execute({ action: 'status', id }, {})
  assert.match(status.summary, /cancel/i)
  assert.doesNotMatch(status.summary, /Error:/)

  const listed = await jobTool.execute({ action: 'list' }, {})
  assert.match(listed.summary, new RegExp(id))
})

test('jobs beyond maxRunningJobs wait in a queue', async (t) => {
  const { tools, cleanups } = makeHarness({ timeoutMs: 60_000, maxRunningJobs: 1 })
  teardown(t, cleanups)

  const jobTool = tools.get('wolfram_job')
  const first = await jobTool.execute({ action: 'submit', code: 'Pause[4]; 1' }, {})
  const firstId = /id="([^"]+)"/.exec(first.summary)[1]
  const second = await jobTool.execute({ action: 'submit', code: '2 + 2' }, {})
  const secondId = /id="([^"]+)"/.exec(second.summary)[1]

  const queued = await jobTool.execute({ action: 'status', id: secondId }, {})
  assert.match(queued.summary, /queued/)

  const firstResult = await waitForJob(jobTool, firstId)
  assert.match(firstResult.summary, /Out: 1/)

  const secondResult = await waitForJob(jobTool, secondId)
  assert.match(secondResult.summary, /Out: 4/)
})

test('wolfram_verify confirms a trigonometric identity numerically', async (t) => {
  const { tools, cleanups } = makeHarness({ timeoutMs: 60_000 })
  teardown(t, cleanups)

  const result = await tools.get('wolfram_verify').execute({
    action: 'identity',
    lhs: 'Sin[x]^2 + Cos[x]^2',
    rhs: '1',
    variables: ['x'],
    samples: 5,
  }, {})

  assert.equal(result.ok, true)
  assert.match(result.summary, /OK/)
})

test('wolfram_verify rejects a false identity', async (t) => {
  const { tools, cleanups } = makeHarness({ timeoutMs: 60_000 })
  teardown(t, cleanups)

  const result = await tools.get('wolfram_verify').execute({
    action: 'identity',
    lhs: 'x^2',
    rhs: 'x^3',
    variables: ['x'],
    samples: 5,
    tolerance: 1e-9,
  }, {})

  assert.equal(result.ok, false)
  assert.match(result.summary, /FAILED/)
})

test('wolfram_verify accepts an ODE solution', async (t) => {
  const { tools, cleanups } = makeHarness({ timeoutMs: 60_000 })
  teardown(t, cleanups)

  const result = await tools.get('wolfram_verify').execute({
    action: 'ode',
    ode: "y'[x] == y[x]",
    solution: 'Exp[x]',
    function: 'y',
    variable: 'x',
    range: [0, 1],
    samples: 5,
  }, {})

  assert.equal(result.ok, true)
  assert.match(result.summary, /OK/)
})

test('wolfram_verify checks a definite integral against its closed form', async (t) => {
  const { tools, cleanups } = makeHarness({ timeoutMs: 60_000 })
  teardown(t, cleanups)

  const result = await tools.get('wolfram_verify').execute({
    action: 'integral',
    integral: 'Integrate[Exp[-x^2], {x, 0, 1}]',
    result: 'Sqrt[Pi]/2 Erf[1]',
    tolerance: 1e-9,
  }, {})

  assert.equal(result.ok, true)
  assert.match(result.summary, /OK/)
})

test('wolfram_state saves and restores global definitions', async (t) => {
  const { tools, cleanups } = makeHarness({ timeoutMs: 60_000 })
  teardown(t, cleanups)

  const stateTool = tools.get('wolfram_state')
  await tools.get('wolfram_eval').execute(
    { code: 'savedSymbol = 42', exportNotebook: false },
    {},
  )
  const saved = await stateTool.execute({ action: 'save', path: '.dsh-wolfram/state-test.mx' }, {})
  assert.equal(saved.ok, true)

  await tools.get('wolfram_notebook').execute({ action: 'reset' }, {})
  const loaded = await stateTool.execute({ action: 'load', path: '.dsh-wolfram/state-test.mx' }, {})
  assert.equal(loaded.ok, true)

  const check = await tools.get('wolfram_eval').execute(
    { code: 'savedSymbol', exportNotebook: false },
    {},
  )
  assert.match(check.summary, /42/)
})

test('wolfram_state reports global symbols and memory', async (t) => {
  const { tools, cleanups } = makeHarness({ timeoutMs: 60_000 })
  teardown(t, cleanups)

  const status = await tools.get('wolfram_state').execute({ action: 'status' }, {})
  assert.equal(status.ok, true)
  assert.match(status.summary, /Global symbols/)
  assert.match(status.summary, /Memory/)
})

test('wolfram_render exports a plot to PNG', async (t) => {
  const { tools, cleanups } = makeHarness({ timeoutMs: 60_000 })
  teardown(t, cleanups)

  const result = await tools.get('wolfram_render').execute({
    expr: 'Plot[Sin[x], {x, 0, 2 Pi}]',
    format: 'png',
    path: 'wolfram-plots/render-test.png',
  }, {})
  assert.equal(result.ok, true)

  const bytes = readFileSync('wolfram-plots/render-test.png')
  assert.equal(bytes[0], 0x89)
  assert.equal(bytes.toString('ascii', 1, 4), 'PNG')
  unlinkSync('wolfram-plots/render-test.png')
})

test('an unevaluated symbolic result gets an inert-result hint', async (t) => {
  const { tools, cleanups } = makeHarness({ timeoutMs: 60_000 })
  teardown(t, cleanups)

  const result = await tools.get('wolfram_eval').execute(
    { code: 'Solve[Cos[x] == x, x]', exportNotebook: false },
    {},
  )

  assert.match(result.summary, /unevaluated/i)
  assert.match(result.summary, /Reduce/)
})

test('a solved symbolic result does not get an inert-result hint', async (t) => {
  const { tools, cleanups } = makeHarness({ timeoutMs: 60_000 })
  teardown(t, cleanups)

  const result = await tools.get('wolfram_eval').execute(
    { code: "DSolve[y'[x] == y[x], y[x], x]", exportNotebook: false },
    {},
  )

  assert.doesNotMatch(result.summary, /unevaluated/i)
})

test('wolfram_batch evaluates several codes in parallel kernels', async (t) => {
  const { tools, cleanups } = makeHarness({ timeoutMs: 60_000 })
  teardown(t, cleanups)

  const result = await tools.get('wolfram_batch').execute({
    codes: ['1 + 1', '2 + 2'],
    maxParallel: 2,
  }, {})

  assert.equal(result.ok, true)
  assert.match(result.summary, /Out: 2/)
  assert.match(result.summary, /Out: 4/)
})

test('wolfram_render loads MaTeX automatically when the expression uses it', async (t) => {
  const { tools, cleanups } = makeHarness({ timeoutMs: 60_000 })
  teardown(t, cleanups)

  const probe = await tools.get('wolfram_eval').execute(
    { code: 'FindFile["MaTeX`"] =!= $Failed', exportNotebook: false },
    {},
  )
  if (!/True/.test(probe.summary)) {
    t.skip('MaTeX is not installed')
    return
  }

  const result = await tools.get('wolfram_render').execute({
    expr: 'Plot[Sin[x], {x, 0, 2 Pi}, Frame -> True, FrameLabel -> {MaTeX["x"], MaTeX["\\\\sin x"]}]',
    format: 'png',
    path: 'wolfram-plots/render-matex-test.png',
  }, {})
  assert.equal(result.ok, true)

  const bytes = readFileSync('wolfram-plots/render-matex-test.png')
  assert.equal(bytes.toString('ascii', 1, 4), 'PNG')
  unlinkSync('wolfram-plots/render-matex-test.png')

  const leftovers = await tools.get('wolfram_eval').execute(
    { code: 'MemberQ[Names["Global`*"], "MaTeX"]', exportNotebook: false },
    {},
  )
  assert.match(leftovers.summary, /False/)
})

test('wolfram_state symbols hides temporary and undefined symbols', async (t) => {
  const { tools, cleanups } = makeHarness({ timeoutMs: 60_000 })
  teardown(t, cleanups)

  await tools.get('wolfram_eval').execute(
    { code: 'keptSymbol = 7; scratch$42 = 1; undefinedLeftover;', exportNotebook: false },
    {},
  )

  const result = await tools.get('wolfram_state').execute({ action: 'symbols', limit: 200 }, {})
  assert.match(result.summary, /keptSymbol/)
  assert.doesNotMatch(result.summary, /scratch\$42/)
  assert.doesNotMatch(result.summary, /undefinedLeftover/)
})

test('wolfram_state clear drops the global definitions', async (t) => {
  const { tools, cleanups } = makeHarness({ timeoutMs: 60_000 })
  teardown(t, cleanups)

  await tools.get('wolfram_eval').execute(
    { code: 'clearMe = 5', exportNotebook: false },
    {},
  )
  const cleared = await tools.get('wolfram_state').execute({ action: 'clear' }, {})
  assert.equal(cleared.ok, true)

  const check = await tools.get('wolfram_eval').execute(
    { code: 'clearMe', exportNotebook: false },
    {},
  )
  assert.match(check.summary, /Out: clearMe/)
})

test('wolfram_verify proves an identity symbolically with assumptions', async (t) => {
  const { tools, cleanups } = makeHarness({ timeoutMs: 60_000 })
  teardown(t, cleanups)

  const result = await tools.get('wolfram_verify').execute({
    action: 'identity',
    lhs: 'Sqrt[x^2]',
    rhs: 'x',
    variables: ['x'],
    assumptions: 'x >= 0',
  }, {})

  assert.equal(result.ok, true)
  assert.match(result.summary, /symbolic/i)
})

test('wolfram_verify still rejects an identity that only holds under assumptions', async (t) => {
  const { tools, cleanups } = makeHarness({ timeoutMs: 60_000 })
  teardown(t, cleanups)

  const result = await tools.get('wolfram_verify').execute({
    action: 'identity',
    lhs: 'Sqrt[x^2]',
    rhs: 'x',
    variables: ['x'],
    samples: 20,
  }, {})

  assert.equal(result.ok, false)
  assert.match(result.summary, /FAILED/)
})

test('a job that produces graphics publishes them to the panel', async (t) => {
  const { tools, cleanups } = makeHarness({ timeoutMs: 60_000 })
  teardown(t, cleanups)

  const jobTool = tools.get('wolfram_job')
  const submitted = await jobTool.execute(
    { action: 'submit', code: 'Plot[Sin[x], {x, 0, 2 Pi}]' },
    {},
  )
  const id = /id="([^"]+)"/.exec(submitted.summary)[1]

  const result = await waitForJob(jobTool, id)
  assert.match(result.summary, /panel/i)

  const latest = JSON.parse(readFileSync('.dsh-wolfram/latest.json', 'utf8'))
  assert.ok(latest.cells.some((cell) => cell.kind === 'graphics' || cell.kind === 'image'))
})

test('wolfram_verify checks an ODE solution against its initial condition', async (t) => {
  const { tools, cleanups } = makeHarness({ timeoutMs: 60_000 })
  teardown(t, cleanups)

  const result = await tools.get('wolfram_verify').execute({
    action: 'ode',
    ode: "y'[x] == y[x]",
    solution: 'Exp[x]',
    conditions: ['y[0] == 1'],
    range: [0, 1],
  }, {})

  assert.equal(result.ok, true)
  assert.equal(result.status, 'verified_symbolic')
  assert.match(result.summary, /condition/i)
})

test('wolfram_verify rejects an ODE solution that fails its initial condition', async (t) => {
  const { tools, cleanups } = makeHarness({ timeoutMs: 60_000 })
  teardown(t, cleanups)

  const result = await tools.get('wolfram_verify').execute({
    action: 'ode',
    ode: "y'[x] == y[x]",
    solution: 'Exp[x]',
    conditions: ['y[0] == 2'],
    range: [0, 1],
  }, {})

  assert.equal(result.ok, false)
  assert.equal(result.status, 'falsified')
  assert.match(result.summary, /condition/i)
})

test('wolfram_verify proves an integral with a symbolic parameter under assumptions', async (t) => {
  const { tools, cleanups } = makeHarness({ timeoutMs: 60_000 })
  teardown(t, cleanups)

  const result = await tools.get('wolfram_verify').execute({
    action: 'integral',
    integral: 'Integrate[Exp[-a x^2], {x, 0, Infinity}]',
    result: 'Sqrt[Pi]/(2 Sqrt[a])',
    assumptions: 'a > 0',
  }, {})

  assert.equal(result.ok, true)
  assert.equal(result.status, 'verified_symbolic')
  assert.match(result.summary, /symbolic/i)
})

test('wolfram_verify reports an inconclusive integral instead of a false failure', async (t) => {
  const { tools, cleanups } = makeHarness({ timeoutMs: 60_000 })
  teardown(t, cleanups)

  const result = await tools.get('wolfram_verify').execute({
    action: 'integral',
    integral: 'Integrate[Exp[-a x^2], {x, 0, Infinity}]',
    result: 'Sqrt[Pi]/(2 Sqrt[a])',
  }, {})

  assert.equal(result.ok, false)
  assert.equal(result.status, 'inconclusive')
  assert.match(result.summary, /inconclusive/i)
})

test('wolfram_verify checks a claimed antiderivative', async (t) => {
  const { tools, cleanups } = makeHarness({ timeoutMs: 60_000 })
  teardown(t, cleanups)

  const result = await tools.get('wolfram_verify').execute({
    action: 'antiderivative',
    integrand: 'Sin[x]',
    result: '-Cos[x]',
  }, {})

  assert.equal(result.ok, true)
  assert.equal(result.status, 'verified_symbolic')
})

test('wolfram_verify ignores session definitions that would fake a pass', async (t) => {
  const { tools, cleanups } = makeHarness({ timeoutMs: 60_000 })
  teardown(t, cleanups)

  // With y defined in the persistent kernel, the old check substituted into an
  // already-evaluated expression and accepted x^2 as a solution of y' = y.
  await tools.get('wolfram_eval').execute({ code: 'y[x_] := Exp[x]', exportNotebook: false }, {})
  const result = await tools.get('wolfram_verify').execute({
    action: 'ode',
    ode: "y'[x] == y[x]",
    solution: 'x^2',
    range: [0, 1],
  }, {})

  assert.equal(result.ok, false)
  assert.equal(result.status, 'falsified')
})

test('wolfram_alpha is registered', (t) => {
  const { tools, cleanups } = makeHarness()
  t.after(() => { for (const cleanup of cleanups) cleanup() })
  assert.ok(tools.has('wolfram_alpha'))
})

test('checkEnvironment reports the components a calculation needs', (t) => {
  const items = checkEnvironment()
  const names = items.map((item) => item.name)
  for (const expected of ['Mathematica', 'PDFConv', 'Python', 'MiKTeX', 'Git', 'Node']) {
    assert.ok(names.includes(expected), `missing component ${expected}`)
  }
  for (const item of items) {
    assert.equal(typeof item.ok, 'boolean')
    assert.equal(typeof item.detail, 'string')
    assert.ok(item.detail.length > 0)
  }
  // Node runs the plugin, so it is always found; the kernel was found by the tests above.
  assert.equal(items.find((item) => item.name === 'Node').ok, true)
  assert.equal(items.find((item) => item.name === 'Mathematica').ok, true)
})

test('wolfram_doc reads the local reference page', async (t) => {
  const { tools, cleanups } = makeHarness({ timeoutMs: 120_000 })
  teardown(t, cleanups)

  const result = await tools.get('wolfram_doc').execute({ symbol: 'Plot', maxChars: 800 }, {})
  if (result.ok !== true) {
    t.skip('local Mathematica documentation is not installed')
    return
  }
  assert.match(result.summary, /Plot/)
  assert.match(result.summary, /wrapper|Themes|scaling/i)
})

test('wolfram_check reports a lint finding and passes clean code', async (t) => {
  const { tools, cleanups } = makeHarness({ timeoutMs: 120_000 })
  teardown(t, cleanups)

  const bad = await tools.get('wolfram_check').execute(
    { code: 'l = {}; Do[AppendTo[l, i], {i, 10}]' },
    {},
  )
  assert.match(bad.summary, /issue\(s\)/)
  assert.match(bad.summary, /line 1/)
  assert.equal(bad.ok, false)

  const good = await tools.get('wolfram_check').execute(
    { code: 'Plot[Sin[x], {x, 0, 2 Pi}]' },
    {},
  )
  assert.match(good.summary, /no issues/)
  assert.equal(good.ok, true)
})

test('wolfram_help answers with usage text, syntax and real options', async (t) => {
  const { tools, cleanups } = makeHarness({ timeoutMs: 120_000 })
  teardown(t, cleanups)

  const result = await tools.get('wolfram_help').execute({ query: 'FindRoot', limit: 1 }, {})
  assert.match(result.summary, /FindRoot/)
  assert.match(result.summary, /searches for a numerical root/)
  assert.match(result.summary, /ArgumentsPattern/)
  assert.match(result.summary, /WorkingPrecision/)
  assert.match(result.summary, /MaxIterations/)
})

test('wolfram_ready reports the workspace, git and environment state', async (t) => {
  const { tools, cleanups } = makeHarness({ timeoutMs: 60_000 })
  teardown(t, cleanups)

  const result = await tools.get('wolfram_ready').execute({}, {})
  assert.match(result.summary, /Workspace:/)
  assert.match(result.summary, /Environment: \d+\/\d+ OK/)
  assert.match(result.summary, /Git:/)
  assert.equal(typeof result.ok, 'boolean')
})

test('initmath initializes a git repository and can snapshot the work', (t) => {
  if (spawnSync('git', ['--version'], { encoding: 'utf8' }).status !== 0) {
    t.skip('git is not installed on this machine')
    return
  }
  const dir = join(mkdtempSync(join(tmpdir(), 'math-git-')), 'work')
  t.after(() => { rmSync(dir, { recursive: true, force: true }) })

  initMathWorkspace(dir)
  const init = initGitRepository(dir)
  assert.equal(init.ok, true)
  assert.match(init.detail, /initialized/)
  assert.equal(existsSync(join(dir, '.git')), true)

  // A second run on the same folder must not re-initialize it.
  assert.match(initGitRepository(dir).detail, /already/)

  writeFileSync(join(dir, 'result.txt'), 'answer\n', 'utf8')
  const snapshot = gitSnapshot(dir, 'test snapshot')
  assert.equal(snapshot.ok, true)
  assert.match(snapshot.detail, /committed 1 file/)
  assert.match(gitSnapshot(dir, 'again').detail, /nothing to commit/)
})

test('initmath scaffolds a folder outside the repository', (t) => {
  const dir = join(mkdtempSync(join(tmpdir(), 'math-init-')), 'work')
  t.after(() => { rmSync(dir, { recursive: true, force: true }) })

  const result = initMathWorkspace(dir)
  assert.ok(result.created.includes('AGENTS.md'))
  assert.ok(result.created.includes('.gitignore'))
  assert.ok(existsSync(join(dir, 'tools', 'new-task.mjs')))
  assert.ok(existsSync(join(dir, 'NOTES.md')))

  // A second run must not clobber files that already exist.
  const again = initMathWorkspace(dir)
  assert.equal(again.created.length, 0)
  assert.equal(again.skipped.length, result.created.length)

  // The plugin repository is refused: calculations belong outside it.
  const root = resolve(import.meta.dirname, '..')
  assert.equal(isInsideRepository(root), true)
  assert.throws(() => initMathWorkspace(join(root, 'some-task')), /plugin repository/)
})

test('a cell that exits the kernel is reported and the next call recovers', async (t) => {
  const { tools, cleanups } = makeHarness({ timeoutMs: 60_000 })
  teardown(t, cleanups)

  await assert.rejects(
    () => tools.get('wolfram_eval').execute({ code: 'Exit[0]', exportNotebook: false }, {}),
    (error) => {
      assert.match(error.message, /kernel exited/i)
      return true
    },
  )

  const after = await tools.get('wolfram_eval').execute({ code: '2 + 2', exportNotebook: false }, {})
  assert.equal(after.ok, true)
  assert.match(after.summary, /4/)
})

test('a large result falls back to plain text instead of blocking on typesetting', async (t) => {
  const { tools, cleanups } = makeHarness({ timeoutMs: 60_000 })
  teardown(t, cleanups)

  // MathML/TeX export of a 100k-element list used to run for minutes and ignore
  // Abort, so the whole call timed out; the size budget now skips typesetting.
  const started = Date.now()
  const result = await tools.get('wolfram_eval').execute({ code: 'Range[10^5]; "done"' }, {})
  assert.equal(result.ok, true)
  assert.ok(Date.now() - started < 30_000, 'large result must not block on typesetting')

  const big = await tools.get('wolfram_eval').execute({ code: 'Range[10^5]' }, {})
  assert.equal(big.ok, true)
  assert.ok(Date.now() - started < 40_000, 'a big value must come back as text')
})

test('a deeply nested result does not block on MathML conversion', async (t) => {
  const { tools, cleanups } = makeHarness({ timeoutMs: 60_000 })
  teardown(t, cleanups)

  // 401 leaves pass the leaf budget but depth 400 made MathML run for minutes.
  const started = Date.now()
  const result = await tools.get('wolfram_eval').execute({ code: 'Nest[List, 1, 400]' }, {})
  assert.equal(result.ok, true)
  assert.ok(Date.now() - started < 30_000, 'deep nesting must not be typeset')
})

test('console output reads like a notebook, without InputForm quotes', async (t) => {
  const { tools, cleanups } = makeHarness({ timeoutMs: 60_000 })
  teardown(t, cleanups)

  const result = await tools.get('wolfram_eval').execute(
    { code: 'Print["x = ", 5]', exportNotebook: false },
    {},
  )
  assert.match(result.summary, /x = 5/)
})

test('a cell that clears the Global context still returns its result', async (t) => {
  const { tools, cleanups } = makeHarness({ timeoutMs: 60_000 })
  teardown(t, cleanups)

  // ClearAll["Global`*"] used to wipe the Module variables of the bridge frame
  // that was still running, so the document became unexportable and the whole
  // call failed with "could not be serialized as JSON".
  const result = await tools.get('wolfram_eval').execute(
    { code: 'ClearAll["Global`*"]; 6*7', exportNotebook: false },
    {},
  )
  assert.equal(result.ok, true)
  assert.match(result.summary, /42/)

  const after = await tools.get('wolfram_eval').execute(
    { code: 'kept = 5; kept + 1', exportNotebook: false },
    {},
  )
  assert.equal(after.ok, true)
  assert.match(after.summary, /6/)
})

test('a .nb file is written only when exportNotebook is true', async (t) => {
  const { tools, cleanups } = makeHarness({ timeoutMs: 60_000 })
  teardown(t, cleanups)

  const plain = await tools.get('wolfram_eval').execute({ code: '2 + 2' }, {})
  assert.equal(plain.ok, true)
  assert.equal(plain.notebookPath, '')

  const saved = await tools.get('wolfram_eval').execute({ code: '2 + 2', exportNotebook: true }, {})
  assert.notEqual(saved.notebookPath, '')
  assert.equal(existsSync(saved.notebookPath), true)
  unlinkSync(saved.notebookPath)
})

test('usage text keeps the operators the kernel stores as private-use characters', async (t) => {
  const { tools, cleanups } = makeHarness({ timeoutMs: 60_000 })
  teardown(t, cleanups)

  // Mathematica 15 moved \[Rule] to U+F522 and \[Equal] to U+F431, so a
  // "drop every non-ASCII character" transliteration turned pos_1->v_1 into
  // pos_1v_1. The flattener now resolves characters by name instead.
  const result = await tools.get('wolfram_help').execute({ query: 'SparseArray' }, {})
  assert.match(result.summary, /pos_1->v_1/)

  // UnderoverscriptBox carries an option (LimitsPositioning) after its three
  // positional arguments; matching exactly three dropped the whole island.
  const sum = await tools.get('wolfram_help').execute({ query: 'Sum' }, {})
  assert.match(sum.summary, /evaluates the sum/)
  assert.doesNotMatch(sum.summary, /usage: degraded/)

  // Table has no usage message in the kernel at all, which is not degradation.
  const table = await tools.get('wolfram_help').execute({ query: 'Table' }, {})
  assert.doesNotMatch(table.summary, /usage: degraded/)
})

test('reference-page details keep the operators and the cells', async (t) => {
  if (!documentationAvailable()) return t.skip('documentation is not installed')

  const { tools, cleanups } = makeHarness({ timeoutMs: 120_000 })
  teardown(t, cleanups)

  const result = await tools.get('wolfram_doc').execute({ symbol: 'DSolve', maxChars: 6000 }, {})
  assert.match(result.summary, /u->f/)
  assert.match(result.summary, /u\[x_1\]==a/)
  assert.doesNotMatch(result.summary, /could not be flattened/)

  // The flattened page text is cached per symbol, so a second call is served
  // from the cache and must return the same text, only sliced to maxChars.
  const bodyOf = (summary) => summary.slice(summary.indexOf('\n') + 1)
  const again = await tools.get('wolfram_doc').execute({ symbol: 'DSolve', maxChars: 400 }, {})
  assert.equal(again.ok, true)
  assert.equal(bodyOf(again.summary), bodyOf(result.summary).slice(0, 400))
})

test('a documentation root that only has the symbol section still resolves', async (t) => {
  if (!documentationAvailable()) return t.skip('documentation is not installed')
  const { tools, cleanups } = makeHarness({ timeoutMs: 60_000 })
  teardown(t, cleanups)

  // Formats live outside ReferencePages/Symbols; the lookup keeps walking the
  // other sections instead of reporting "no reference page".
  const result = await tools.get('wolfram_doc').execute({ symbol: 'CSV' }, {})
  assert.equal(result.ok, true)
  assert.match(result.summary, /CSV/)
})



