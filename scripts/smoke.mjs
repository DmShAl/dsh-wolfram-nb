#!/usr/bin/env node
// End-to-end smoke test of an installed build: boots the plugin the same way a
// session does and walks every tool once. Run it after `build-tgz.bat install`
// and a DSH restart:
//
//     node scripts/smoke.mjs
//     node scripts/smoke.mjs --with-alpha    (adds the Wolfram|Alpha call)
//
// Exit code 0 when all steps pass, 1 otherwise. It uses the repository copy of
// the plugin, not the profile copy, so it validates the code you just built.
import { existsSync, rmSync } from 'node:fs'
import { apply } from '../index.js'

const withAlpha = process.argv.includes('--with-alpha')
const results = []

function makeHarness() {
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
  apply(ctx, { timeoutMs: 120_000 })
  return { tools, cleanups }
}

async function step(name, fn, options = {}) {
  const started = Date.now()
  try {
    const detail = await fn()
    results.push({ name, ok: true, detail: detail ?? '', ms: Date.now() - started })
  } catch (error) {
    const ok = options.required === false
    results.push({ name, ok, detail: error?.message ?? String(error), ms: Date.now() - started })
  }
}

function need(value, message) {
  if (!value) throw new Error(message)
}

const { tools, cleanups } = makeHarness()
const call = (name, args) => tools.get(name).execute(args, {})

const notebookPath = '.dsh-wolfram/smoke.nb'
const imagePath = '.dsh-wolfram/smoke.png'
let createdNotebook = ''

try {
  await step('wolfram_eval 1+1', async () => {
    const result = await call('wolfram_eval', { code: '1 + 1' })
    need(/2/.test(result.summary), `unexpected summary: ${result.summary.slice(0, 80)}`)
    return 'summary has 2'
  })

  await step('wolfram_eval ClearAll["Global`*"]', async () => {
    const result = await call('wolfram_eval', { code: 'ClearAll["Global`*"]; 6*7' })
    need(/42/.test(result.summary), `unexpected summary: ${result.summary.slice(0, 80)}`)
    return '42 after a global clear'
  })

  await step('no .nb file unless requested', async () => {
    const result = await call('wolfram_eval', { code: '2 + 2' })
    need(result.notebookPath === '', `notebookPath=${result.notebookPath}`)
    return 'nothing written'
  })

  await step('wolfram_eval exportNotebook: true', async () => {
    const result = await call('wolfram_eval', { code: '3 + 3', exportNotebook: true, title: 'smoke' })
    need(result.notebookPath !== '', 'no notebookPath returned')
    need(existsSync(result.notebookPath), `file missing: ${result.notebookPath}`)
    createdNotebook = result.notebookPath
    return createdNotebook.split(/[\\/]/).pop()
  })

  await step('wolfram_render PNG', async () => {
    const result = await call('wolfram_render', {
      expr: 'Plot[Sin[x], {x, 0, 2 Pi}]',
      path: imagePath,
    })
    need(result.ok === true, result.summary)
    need(existsSync(imagePath), `file missing: ${imagePath}`)
    return 'written'
  })

  await step('wolfram_render GraphicsRow', async () => {
    const result = await call('wolfram_render', {
      expr: 'GraphicsRow[{Plot[x, {x, 0, 1}, ImageSize -> 150], Plot[x^2, {x, 0, 1}, ImageSize -> 150]}]',
      path: imagePath,
    })
    need(result.ok === true, result.summary)
    return 'multi-panel ok'
  })

  await step('wolfram_state status', async () => {
    const result = await call('wolfram_state', { action: 'status' })
    need(/Global symbols/.test(result.summary), result.summary.slice(0, 80))
    return result.summary.slice(0, 40)
  })

  await step('wolfram_verify identity', async () => {
    const result = await call('wolfram_verify', {
      action: 'identity',
      lhs: 'Sin[x]^2 + Cos[x]^2',
      rhs: '1',
      variables: ['x'],
    })
    need(result.ok === true, `status=${result.status}`)
    return result.status
  })

  await step('wolfram_batch', async () => {
    const result = await call('wolfram_batch', { codes: ['1 + 1', 'Prime[10]'], maxParallel: 2 })
    need(/2 ok, 0 failed/.test(result.summary), result.summary.slice(0, 80))
    return '2/2 items'
  })

  await step('wolfram_job submit + result', async () => {
    const submitted = await call('wolfram_job', { action: 'submit', code: 'Total[Range[10]]' })
    const id = /id="([^"]+)"/.exec(submitted.summary)?.[1]
    need(id, `no job id in: ${submitted.summary}`)
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const result = await call('wolfram_job', { action: 'result', id })
      if (!/still running/.test(result.summary)) {
        need(/55/.test(result.summary), result.summary.slice(0, 80))
        return '55'
      }
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    throw new Error('job did not finish in 30 s')
  })

  await step('wolfram_notebook open', async () => {
    need(createdNotebook !== '', 'no notebook file was created earlier')
    const result = await call('wolfram_notebook', { action: 'open', path: createdNotebook })
    need(result.ok !== false, result.summary)
    return 'rendered'
  })

  if (withAlpha) {
    await step('wolfram_alpha', async () => {
      const result = await call('wolfram_alpha', { query: 'integrate x^2 dx', steps: false })
      need(/x\^3|3/.test(result.summary), result.summary.slice(0, 80))
      return 'answered'
    })
  }
} finally {
  for (const cleanup of cleanups) cleanup()
  for (const path of [createdNotebook, imagePath, notebookPath]) {
    try { rmSync(path, { force: true }) } catch { /* ignore */ }
  }
}

const width = Math.max(...results.map((entry) => entry.name.length))
for (const entry of results) {
  console.log(`${entry.ok ? 'PASS' : 'FAIL'}  ${entry.name.padEnd(width)}  ${String(entry.ms).padStart(5)} ms  ${entry.detail}`)
}
const failed = results.filter((entry) => !entry.ok)
console.log(`\n${results.length - failed.length}/${results.length} steps passed`)
process.exit(failed.length === 0 ? 0 : 1)
