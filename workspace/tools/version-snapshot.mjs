#!/usr/bin/env node
// Snapshot the current version of a task into tasks/<name>/_versions/<timestamp>/.
//
//     node tools/version-snapshot.mjs tasks/my-task
//     node tools/version-snapshot.mjs tasks/my-task --source report.md
//     node tools/version-snapshot.mjs tasks/my-task --keep 5 --force
//
// build-report.cmd calls this after a successful conversion; tools\snapshot.cmd wraps
// it for a manual snapshot before editing code.wl/report.md. Canonical files
// (report.md/.pdf/.docx, code.wl) stay where they are and keep being updated; the
// snapshot is a sorted, read-only copy.
//
// An identical snapshot is not created again ("snapshot unchanged") unless --force is
// given; --keep N (default 20, env DSH_SNAPSHOT_KEEP) removes the oldest snapshot
// directories and never touches unrelated entries in _versions/.
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { createHash } from 'node:crypto'

const SNAPSHOT_NAME = /^\d{4}_\d{2}_\d{2}-\d{2}_\d{2}_\d{2}(-\d+)?$/
const NAMED_FILES = ['TASK.md', 'report.md', 'report.tex', 'report.pdf', 'report.docx']

function usage() {
  console.log('usage: node tools/version-snapshot.mjs <task-dir> [--source <name>] [--keep <N>] [--force]')
  console.log('copies TASK.md, report.md/.tex, *.wl, report.pdf/.docx and _plots/')
  console.log('into <task-dir>/_versions/<YYYY_MM_DD-HH_MM_SS>/ (local time, sortable)')
  console.log('--keep N  keep only the newest N snapshots (default 20, env DSH_SNAPSHOT_KEEP)')
  console.log('--force   create a snapshot even when it is identical to the latest one')
}

function fail(message) {
  console.error(`[version-snapshot] ${message}`)
  process.exit(2)
}

let taskDir = ''
let source = ''
let keep = null
let force = false
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
  if (arg === '--keep') {
    i += 1
    keep = Number(argv[i])
    continue
  }
  if (arg.startsWith('--keep=')) {
    keep = Number(arg.slice('--keep='.length))
    continue
  }
  if (arg === '--force') {
    force = true
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
if (keep === null) {
  const configured = Number(process.env.DSH_SNAPSHOT_KEEP)
  keep = Number.isFinite(configured) && configured >= 1 ? Math.floor(configured) : 20
}
if (!Number.isFinite(keep) || keep < 1) fail('--keep needs a positive integer (how many snapshots to keep)')

const dir = resolve(taskDir)
if (!existsSync(dir) || !statSync(dir).isDirectory()) {
  fail(`task directory not found: ${dir}`)
}

/** Files copied when they exist; *.wl is collected separately. */
const files = NAMED_FILES.filter((name) => existsSync(join(dir, name)) && statSync(join(dir, name)).isFile())
for (const entry of readdirSync(dir, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.toLowerCase().endsWith('.wl')) files.push(entry.name)
}
const hasPlots = existsSync(join(dir, '_plots')) && statSync(join(dir, '_plots')).isDirectory()

if (files.length === 0 && !hasPlots) {
  console.log(`[version-snapshot] nothing to snapshot in ${dir} (no TASK.md, report.*, *.wl or _plots/)`)
  process.exit(0)
}

/** [relativePath, bytes] pairs for what a snapshot contains (empty _plots adds nothing). */
function collectEntries(root, names, plots) {
  const entries = []
  for (const name of names) entries.push([name, readFileSync(join(root, name))])
  if (plots) {
    const walk = (current) => {
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const full = join(current, entry.name)
        if (entry.isDirectory()) walk(full)
        else entries.push([relative(root, full).replace(/\\/g, '/'), readFileSync(full)])
      }
    }
    walk(join(root, '_plots'))
  }
  return entries
}

/** Content hash over sorted paths and bytes, so ordering inside the copy does not matter. */
function contentHash(entries) {
  const hash = createHash('sha256')
  for (const [label, bytes] of entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
    hash.update(label)
    hash.update('\0')
    hash.update(bytes)
    hash.update('\0')
  }
  return hash.digest('hex')
}

const versionsDir = join(dir, '_versions')
const snapshotDirs = () => {
  if (!existsSync(versionsDir)) return []
  return readdirSync(versionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && SNAPSHOT_NAME.test(entry.name))
    .map((entry) => entry.name)
    .sort()
}

/** Keep only the newest `keep` snapshot directories; unrelated entries are untouched. */
function applyRetention() {
  const all = snapshotDirs()
  for (const name of all.slice(0, Math.max(0, all.length - keep))) {
    rmSync(join(versionsDir, name), { recursive: true, force: true })
    console.log(`[version-snapshot] removed old snapshot: ${name}`)
  }
}

const existing = snapshotDirs()
const latest = existing.length === 0 ? null : existing[existing.length - 1]
const currentHash = contentHash(collectEntries(dir, [...files].sort(), hasPlots))
if (!force && latest !== null) {
  const latestDir = join(versionsDir, latest)
  const latestEntries = []
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) walk(full)
      else latestEntries.push([relative(latestDir, full).replace(/\\/g, '/'), readFileSync(full)])
    }
  }
  walk(latestDir)
  if (contentHash(latestEntries) === currentHash) {
    console.log(`[version-snapshot] snapshot unchanged: ${latestDir}`)
    applyRetention()
    process.exit(0)
  }
}

const pad = (value) => String(value).padStart(2, '0')
const now = new Date()
const stamp = `${now.getFullYear()}_${pad(now.getMonth() + 1)}_${pad(now.getDate())}`
  + `-${pad(now.getHours())}_${pad(now.getMinutes())}_${pad(now.getSeconds())}`

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
applyRetention()
