import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, unlinkSync } from 'node:fs'
import { apply } from '../index.js'

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

  assert.match(status.summary, /Bridge: 1\.3\.0/)
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



