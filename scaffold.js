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
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

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

function main(argv) {
  const args = argv.slice(2)
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    console.log('usage: node scaffold.js <target-folder> [--force]')
    console.log('copies the calculation workspace (AGENTS.md, NOTES.md, tools/) into <target-folder>')
    return args.length === 0 ? 2 : 0
  }
  const force = args.includes('--force')
  const target = args.find((arg) => !arg.startsWith('--'))
  try {
    const result = initMathWorkspace(target, { force })
    console.log(`[init-math] prepared ${result.target}`)
    console.log(`  created: ${result.created.length === 0 ? '(nothing)' : result.created.join(', ')}`)
    if (result.skipped.length > 0) {
      console.log(`  kept   : ${result.skipped.join(', ')} (use --force to replace)`)
    }
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
