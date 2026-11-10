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
