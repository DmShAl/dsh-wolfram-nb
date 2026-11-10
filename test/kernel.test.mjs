import { test } from 'node:test'
import assert from 'node:assert/strict'
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


