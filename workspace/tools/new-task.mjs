#!/usr/bin/env node
// Scaffold a task directory next to this hub:
//
//     node tools/new-task.mjs bathtub-vortex
//     node tools/new-task.mjs bathtub-vortex --title "Ванна с воронкой"
//
// Creates tasks/<name>/ with TASK.md (from task-template.md), report.md (from
// report-template.md), code.wl (the Wolfram Language source that produced the
// results), _plots/ and _work/. Refuses to touch an existing directory, so it is
// safe to re-run.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const hub = resolve(here, '..')
const taskTemplate = join(here, 'task-template.md')
const reportTemplate = join(here, 'report-template.md')

function usage() {
  console.log('usage: node tools/new-task.mjs <task-name> [--title "Человеческое название"]')
  console.log('creates tasks/<task-name>/ with TASK.md, report.md, code.wl, _plots/ and _work/')
  console.log('--title  heading for TASK.md and report.md (default: the task-name)')
  console.log('example: node tools/new-task.mjs lognormal-cos --title "Логнормальная величина × косинус"')
}

function fail(message) {
  console.error(`[new-task] ${message}`)
  process.exit(2)
}

let name = ''
let title = ''
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i]
  if (arg === '--help' || arg === '-h') {
    usage()
    process.exit(0)
  }
  if (arg === '--title') {
    i += 1
    title = String(argv[i] ?? '').trim()
    if (title === '') fail('--title needs a value: --title "Человеческое название"')
    continue
  }
  if (arg.startsWith('--title=')) {
    title = arg.slice('--title='.length).trim()
    if (title === '') fail('--title needs a value: --title "Человеческое название"')
    continue
  }
  if (arg.startsWith('-')) fail(`unknown option "${arg}"; see --help`)
  if (name !== '') fail(`unexpected argument "${arg}"; the task name goes first`)
  name = arg.trim()
}

if (name === '') {
  usage()
  process.exit(2)
}
if (!/^[\w.-]+$/.test(name)) {
  fail(`"${name}" is not a safe directory name (letters, digits, . _ - only)`)
}
if (title === '') title = name

const dir = join(hub, 'tasks', name)
if (existsSync(dir)) {
  console.error(`[new-task] ${dir} already exists; nothing changed`)
  process.exit(3)
}

mkdirSync(join(dir, '_plots'), { recursive: true })
mkdirSync(join(dir, '_work'), { recursive: true })

const created = []
const write = (file, text) => {
  writeFileSync(file, text, 'utf8')
  created.push(file.slice(dir.length + 1))
}

const task = readFileSync(taskTemplate, 'utf8').replace('# <Название задачи>', `# ${title}`)
write(join(dir, 'TASK.md'), task)

const report = readFileSync(reportTemplate, 'utf8').replace('# Название отчёта', `# ${title}`)
write(join(dir, 'report.md'), report)

const today = new Date().toISOString().slice(0, 10)
const codeWl = [
  `(* ${title} — Wolfram Language source for this task (${today}).`,
  '   Keep every computation that the report relies on here, so the numbers and',
  '   figures can be reproduced: run it with',
  `       wolfram_eval { code: "Get[\\"${join(dir, 'code.wl').replace(/\\/g, '\\\\')}\\"]" }`,
  '   or open the file in Mathematica. Sections follow report.md. *)',
  '',
  '(* 0. подготовка: Needs, параметры *)',
  '(* Пакеты — отдельной ячейкой/строкой в начале. taskDir работает и при Get["code.wl"],',
  '   и в интерактивной сессии: при загрузке файла берётся его каталог, иначе Directory[]. *)',
  'taskDir = With[{loaded = Quiet@Check[$InputFileName, ""]},',
  '  If[StringQ[loaded] && loaded =!= "", DirectoryName[loaded], Directory[]]];',
  'plotsDir = FileNameJoin[{taskDir, "_plots"}];',
  'If[! DirectoryQ[plotsDir], CreateDirectory[plotsDir]];',
  '',
  '(* 1. параметры *)',
  '(* params = <|"a" -> 1, "n" -> 10|>; *)',
  '',
  '(* 2. символьное решение *)',
  '(* sol = Assuming[a > 0, Integrate[Exp[-a x^2], {x, 0, Infinity}]] *)',
  '',
  '(* 3. численная проверка *)',
  '(* NIntegrate[Exp[-x^2], {x, 0, Infinity}]  — сравнить с sol /. a -> 1 *)',
  '',
  '(* 4. рисунки: Export в _plots/ *)',
  '(* fig1 = Plot[Sin[x], {x, 0, 2 Pi}, Frame -> True, PlotLabel -> "Пример"];',
  '   Export[FileNameJoin[{plotsDir, "fig1.png"}], fig1, ImageResolution -> 200]; *)',
  '',
  '(* 5. итог: Print[...] *)',
  'Print["Готово: ", taskDir];',
  '',
].join('\n')
write(join(dir, 'code.wl'), codeWl)

console.log(`[new-task] ${dir}`)
console.log(`  title     — ${title}`)
for (const file of created) console.log(`  created   — ${file}`)
console.log('  _plots/   — final figures referenced by report.md')
console.log('  _work/    — scratch files (git-ignored)')
console.log('')
console.log(`next: fill in TASK.md, then code.wl, then`)
console.log(`      tools\\build-report.cmd tasks\\${name}\\report.md`)
console.log(`      tools\\check-report.cmd tasks\\${name}\\report.pdf`)
