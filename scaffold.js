#!/usr/bin/env node
// Prepare a folder for Wolfram calculations: copy the workspace template
// (AGENTS.md, NOTES.md, README.md, .gitignore, tools/) and create the folders
// the instructions mention.
//
//     node scaffold.js "D:\work\my-task"
//     node scaffold.js "D:\work\my-task" --force     (overwrite template files)
//
// Also used by the `/initmath` DSH command, so the same code runs both from the
// command line and from inside a session.
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolveKernel } from './kernel-discovery.js'

const HERE = dirname(fileURLToPath(import.meta.url))
export const TEMPLATE_DIR = join(HERE, 'workspace')

/** The plugin repository itself: calculations must not be started inside it. */
export function isInsideRepository(path) {
  const target = resolve(path)
  const root = resolve(HERE)
  return target === root || target.startsWith(root + sep)
}

function listFiles(dir, base = dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...listFiles(full, base))
    else out.push(relative(base, full))
  }
  return out
}

/**
 * Copy the template into `target`. Existing files are kept unless `force`.
 * Returns { target, created, skipped } with paths relative to `target`.
 */
export function initMathWorkspace(target, options = {}) {
  const force = options.force === true
  const templateDir = options.templateDir ?? TEMPLATE_DIR
  const root = resolve(target)

  if (!existsSync(templateDir)) {
    throw new Error(`workspace template is missing: ${templateDir}`)
  }
  if (isInsideRepository(root)) {
    throw new Error(
      `${root} is the plugin repository — calculations must not live there. ` +
        'Pass a folder outside it, for example "D:\\Projects\\my-math".')
  }

  mkdirSync(root, { recursive: true })
  const created = []
  const skipped = []

  for (const rel of listFiles(templateDir)) {
    // npm drops `.gitignore` from packages, so the template ships `gitignore`.
    const name = rel.split(sep).join('/') === 'gitignore' ? '.gitignore' : rel
    const destination = join(root, name)
    if (existsSync(destination) && !force) {
      skipped.push(name)
      continue
    }
    mkdirSync(dirname(destination), { recursive: true })
    copyFileSync(join(templateDir, rel), destination)
    created.push(name)
  }

  for (const dir of ['tasks', 'data']) {
    mkdirSync(join(root, dir), { recursive: true })
  }

  return { target: root, created, skipped }
}

function firstExisting(candidates) {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate !== '' && existsSync(candidate)) return candidate
  }
  return null
}

function findOnPath(names) {
  const dirs = String(process.env.PATH ?? '').split(sep)
  for (const dir of dirs) {
    if (dir === '') continue
    for (const name of names) {
      const full = join(dir, name)
      if (existsSync(full)) return full
    }
  }
  return null
}

function findPdfConv() {
  const direct = firstExisting([process.env.DSH_PDFCONV, 'D:\\Projects\\PDFConv\\src\\convert.py'])
  if (direct !== null) return { detail: direct }
  const home = process.env.DSH_HOME && process.env.DSH_HOME.trim() !== '' ? process.env.DSH_HOME : join(homedir(), '.dsh')
  try {
    for (const profile of readdirSync(join(home, 'profiles'))) {
      const marker = join(home, 'profiles', profile, 'node_modules', 'dsh-pdfconv', 'package.json')
      if (existsSync(marker)) return { detail: `${join(dirname(marker))} (plugin)` }
    }
  } catch { /* no profiles directory: fall through */ }
  return { detail: 'convert.py not found (set DSH_PDFCONV or install dsh-pdfconv)' }
}

/**
 * What a calculation session needs on this machine. Returns [{ name, ok, detail }];
 * `detail` is the path that was found or a one-line hint on how to fix it.
 */
export function checkEnvironment() {
  const items = []

  try {
    const kernel = resolveKernel()
    items.push({ name: 'Mathematica', ok: true, detail: kernel.path })
  } catch (error) {
    items.push({ name: 'Mathematica', ok: false, detail: 'math.exe not found (install Mathematica or set WOLFRAM_KERNEL)' })
  }

  const pdfconv = findPdfConv()
  items.push({ name: 'PDFConv', ok: ! /not found/.test(pdfconv.detail), detail: pdfconv.detail })

  const python = firstExisting([process.env.DSH_PYTHON, 'C:\\Tools\\Scripts\\Python314\\python.exe'])
    ?? findOnPath(['python.exe', 'python3.exe'])
  items.push({
    name: 'Python',
    ok: python !== null,
    detail: python ?? 'python not found (set DSH_PYTHON or add it to PATH)',
  })

  const latex = firstExisting([
    'C:\\Program Files\\MiKTeX\\miktex\\bin\\x64\\pdflatex.exe',
    'C:\\Program Files\\MiKTeX\\miktex\\bin\\pdflatex.exe',
  ]) ?? findOnPath(['pdflatex.exe'])
  items.push({
    name: 'MiKTeX',
    ok: latex !== null,
    detail: latex ?? 'pdflatex not found (install MiKTeX or add it to PATH)',
  })

  items.push({ name: 'Node', ok: true, detail: process.execPath })
  return items
}

function git(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true })
  return {
    ok: result.error === undefined && result.status === 0,
    stdout: String(result.stdout ?? '').trim(),
    stderr: String(result.stderr ?? '').trim(),
    error: result.error,
  }
}

export function isGitRepository(dir) {
  return existsSync(join(dir, '.git'))
}

function commitArgs(message, dir) {
  const identity = []
  if (git(['config', 'user.name'], dir).stdout === '') {
    identity.push('-c', 'user.name=DSH', '-c', 'user.email=dsh@localhost')
  }
  return [...identity, 'commit', '-q', '-m', message]
}

/** `git init` plus one commit; an existing repository is left untouched. */
export function initGitRepository(dir, message = 'initmath: workspace template') {
  if (isGitRepository(dir)) return { ok: true, created: false, detail: 'already a git repository' }
  const init = git(['init', '-q'], dir)
  if (!init.ok) return { ok: false, created: false, detail: init.error?.message ?? init.stderr ?? 'git init failed' }
  git(['config', 'core.autocrlf', 'false'], dir)
  git(['add', '-A'], dir)
  const commit = git(commitArgs(message, dir), dir)
  if (!commit.ok) {
    return { ok: false, created: true, detail: `repository created, but the first commit failed: ${commit.stderr || commit.stdout}` }
  }
  const head = git(['rev-parse', '--short', 'HEAD'], dir)
  return { ok: true, created: true, detail: `initialized (commit ${head.stdout || '?'})` }
}

/** Stage everything and commit it; the safety net for a session's files. */
export function gitSnapshot(dir, message = 'snapshot') {
  if (!isGitRepository(dir)) return { ok: false, detail: 'not a git repository — run /initmath first' }
  const add = git(['add', '-A'], dir)
  if (!add.ok) return { ok: false, detail: add.stderr || 'git add failed' }
  const status = git(['status', '--porcelain'], dir)
  if (status.stdout === '') return { ok: true, commit: null, detail: 'nothing to commit' }
  const files = status.stdout.split(/\r?\n/).filter((line) => line.trim() !== '').length
  const commit = git(commitArgs(message, dir), dir)
  if (!commit.ok) return { ok: false, detail: commit.stderr || commit.stdout || 'git commit failed' }
  const head = git(['rev-parse', '--short', 'HEAD'], dir)
  return { ok: true, commit: head.stdout, detail: `committed ${files} file(s) as ${head.stdout}` }
}

function formatEnvironment(items) {  const found = items.filter((item) => item.ok).length
  const width = Math.max(...items.map((item) => item.name.length))
  const lines = [`Environment ${found}/${items.length} OK`]
  for (const item of items) {
    lines.push(`  ${item.ok ? 'OK  ' : 'MISS'}  ${item.name.padEnd(width)}  ${item.detail}`)
  }
  const missing = items.filter((item) => !item.ok).map((item) => item.name)
  if (missing.length > 0) lines.push(`Missing: ${missing.join(', ')}`)
  return lines
}

export { formatEnvironment }

function main(argv) {
  const args = argv.slice(2)
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    console.log('usage: node scaffold.js <target-folder> [--force] [--no-git]')
    console.log('copies the calculation workspace (AGENTS.md, NOTES.md, tools/) into <target-folder>')
    console.log('and initializes a local git repository unless --no-git is given')
    return args.length === 0 ? 2 : 0
  }
  const force = args.includes('--force')
  const noGit = args.includes('--no-git')
  const target = args.find((arg) => !arg.startsWith('--'))
  try {
    const result = initMathWorkspace(target, { force })
    console.log(`[init-math] prepared ${result.target}`)
    console.log(`  created: ${result.created.length === 0 ? '(nothing)' : result.created.join(', ')}`)
    if (result.skipped.length > 0) {
      console.log(`  kept   : ${result.skipped.join(', ')} (use --force to replace)`)
    }
    if (!noGit) {
      const snapshot = initGitRepository(result.target)
      console.log(`  git    : ${snapshot.detail}`)
    }
    console.log('')
    for (const line of formatEnvironment(checkEnvironment())) console.log(line)
    console.log('')
    console.log('next: node tools/new-task.mjs <task-name>')
    return 0
  } catch (error) {
    console.error(`[init-math] ${error.message}`)
    return 1
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exit(main(process.argv))
}
