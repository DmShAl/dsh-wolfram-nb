#!/usr/bin/env node
// Scaffold a task directory next to this hub:
//
//     node tools/new-task.mjs bathtub-vortex
//
// Creates tasks/<name>/ with TASK.md (from task-template.md, title substituted),
// code.wl (the Wolfram Language source that produced the results), _plots/ and
// _work/. Refuses to touch an existing directory, so it is safe to re-run.
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const hub = resolve(here, '..')
const template = join(here, 'task-template.md')

const name = (process.argv[2] ?? '').trim()
if (name === '' || name === '--help' || name === '-h') {
  console.log('usage: node tools/new-task.mjs <task-name>')
  console.log('creates tasks/<task-name>/ with TASK.md, code.wl, _plots/ and _work/')
  process.exit(name === '' ? 2 : 0)
}
if (!/^[\w.-]+$/.test(name)) {
  console.error(`[new-task] "${name}" is not a safe directory name (letters, digits, . _ - only)`)
  process.exit(2)
}

const dir = join(hub, 'tasks', name)
if (existsSync(dir)) {
  console.error(`[new-task] ${dir} already exists; nothing changed`)
  process.exit(3)
}

mkdirSync(join(dir, '_plots'), { recursive: true })
mkdirSync(join(dir, '_work'), { recursive: true })

const task = readFileSync(template, 'utf8').replace('# <Название задачи>', `# ${name}`)
writeFileSync(join(dir, 'TASK.md'), task, 'utf8')

const today = new Date().toISOString().slice(0, 10)
writeFileSync(join(dir, 'code.wl'), [
  `(* ${name} — Wolfram Language source for this task.`,
  '   Keep every computation that the report relies on here, so the numbers and',
  '   figures can be reproduced: open in Mathematica, or run with',
  '       wolfram_eval  { cells: [{ type: "input", code: Get["' + join(dir, 'code.wl').replace(/\\/g, '\\\\') + '"] }] }',
  '   Sections follow report.md. *)',
  '',
  '(* --- 1. parameters --- *)',
  '',
  '(* --- 2. computation --- *)',
  '',
  '(* --- 3. figures (_plots/) --- *)',
  '',
].join('\n'), 'utf8')

console.log(`[new-task] ${dir}`)
console.log('  TASK.md   — fill in the statement and the log')
console.log('  code.wl   — put the Wolfram Language source here')
console.log('  _plots/   — final figures referenced by report.md')
console.log('  _work/    — scratch files (git-ignored)')
console.log('')
console.log(`next: write tasks/${name}/report.md, then`)
console.log(`      pdfconv_convert { files: ["tasks/${name}/report.md"] }`)
console.log(`      tools\\pdfcheck.cmd tasks\\${name}\\report.pdf --pages 1 --out tasks\\${name}\\_work`)
