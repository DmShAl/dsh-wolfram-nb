#!/usr/bin/env node
// Snapshot the current version of a task into tasks/<name>/_versions/<timestamp>/.
//
//     node tools/version-snapshot.mjs tasks/my-task
//     node tools/version-snapshot.mjs tasks/my-task --source report.md
//
// build-report.cmd calls this after a successful conversion; tools\snapshot.cmd wraps
// it for a manual snapshot before editing code.wl/report.md. Canonical files
// (report.md/.pdf/.docx, code.wl) stay where they are and keep being updated; the
// snapshot is a sorted, read-only copy. Nothing outside the task directory is touched.
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

function usage() {
  console.log('usage: node tools/version-snapshot.mjs <task-dir> [--source <name>]')
  console.log('copies TASK.md, report.md/.tex, *.wl, report.pdf/.docx and _plots/')
  console.log('into <task-dir>/_versions/<YYYY_MM_DD-HH_MM_SS>/ (local time, sortable)')
}

function fail(message) {
  console.error(`[version-snapshot] ${message}`)
  process.exit(2)
}

let taskDir = ''
let source = ''
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i]
  if (arg === '--help' || arg === '-h') {
    usage()
    process.exit(0)
  }
  if (arg === '--source') {
    i += 1
    source = String(argv[i] ?? '').trim()
    if (source === '') fail('--source needs a value')
    continue
  }
  if (arg.startsWith('--source=')) {
    source = arg.slice('--source='.length).trim()
    if (source === '') fail('--source needs a value')
    continue
  }
  if (arg.startsWith('-')) fail(`unknown option "${arg}"; see --help`)
  if (taskDir !== '') fail(`unexpected argument "${arg}"; the task directory goes first`)
  taskDir = arg.trim()
}
if (taskDir === '') {
  usage()
  process.exit(2)
}

const dir = resolve(taskDir)
if (!existsSync(dir) || !statSync(dir).isDirectory()) {
  fail(`task directory not found: ${dir}`)
}

/** Files copied when they exist; *.wl is collected separately. */
const NAMED_FILES = ['TASK.md', 'report.md', 'report.tex', 'report.pdf', 'report.docx']
const files = NAMED_FILES.filter((name) => existsSync(join(dir, name)) && statSync(join(dir, name)).isFile())
for (const entry of readdirSync(dir, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.toLowerCase().endsWith('.wl')) files.push(entry.name)
}
const hasPlots = existsSync(join(dir, '_plots')) && statSync(join(dir, '_plots')).isDirectory()

if (files.length === 0 && !hasPlots) {
  console.log(`[version-snapshot] nothing to snapshot in ${dir} (no TASK.md, report.*, *.wl or _plots/)`)
  process.exit(0)
}

const pad = (value) => String(value).padStart(2, '0')
const now = new Date()
const stamp = `${now.getFullYear()}_${pad(now.getMonth() + 1)}_${pad(now.getDate())}`
  + `-${pad(now.getHours())}_${pad(now.getMinutes())}_${pad(now.getSeconds())}`

const versionsDir = join(dir, '_versions')
let target = join(versionsDir, stamp)
// Two snapshots inside one second must not overwrite each other.
for (let n = 2; existsSync(target); n += 1) target = join(versionsDir, `${stamp}-${n}`)
mkdirSync(target, { recursive: true })

for (const name of files) copyFileSync(join(dir, name), join(target, name))
if (hasPlots) cpSync(join(dir, '_plots'), join(target, '_plots'), { recursive: true })

const copied = [...files]
if (hasPlots) copied.push('_plots/')
console.log(`[version-snapshot] ${target}`)
console.log(`  files: ${copied.join(', ')}${source === '' ? '' : ` (source: ${source})`}`)
