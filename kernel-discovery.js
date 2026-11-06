/**
 * Locate a local Wolfram Language kernel (`math.exe`) for the plugin.
 *
 * Discovery order, most explicit first:
 *   1. plugin config `kernel` (a file or an installation directory)
 *   2. `WOLFRAM_KERNEL` / `MATHEMATICA_KERNEL` environment variables
 *   3. Wolfram's own Windows registry records (`Installations\<id>`)
 *   4. the standard `Program Files\Wolfram Research\<product>\<version>` layout
 *   5. `math`/`MathKernel` found on PATH
 *
 * The kernel host must be a REPL-capable executable (`math.exe` / `MathKernel.exe`
 * read expressions from stdin); the GUI executables (`WolframNB.exe`,
 * `wolfram.exe`, `WolframKernel.exe`) are only used to locate the install
 * directory, never launched directly.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve as resolvePath } from 'node:path'

/** Executables that answer the stdin REPL protocol this bridge speaks. */
const KERNEL_EXECUTABLES = ['math.exe', 'MathKernel.exe']
/** POSIX names, used only where the platform provides them. */
const POSIX_EXECUTABLES = ['math', 'MathKernel']
/** Installer folders that hold one version directory each. */
const PRODUCT_FOLDERS = ['Wolfram', 'Mathematica', 'Wolfram Engine', 'Wolfram Player']

function isWindows() {
  return process.platform === 'win32'
}

function fileExists(path) {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

function directoryExists(path) {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

function listDirectories(path) {
  try {
    return readdirSync(path, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
  } catch {
    return []
  }
}

/** Numeric sort key for an install folder or version string (`15.0.1` → 150001). */
function versionKey(value) {
  const parts = String(value ?? '').match(/\d+/g)
  if (parts === null) return 0
  return parts.slice(0, 3).reduce((total, part, index) => total + Number(part) * (10 ** ((2 - index) * 3)), 0)
}

function kernelIn(directory) {
  if (typeof directory !== 'string' || directory === '') return undefined
  for (const name of isWindows() ? KERNEL_EXECUTABLES : POSIX_EXECUTABLES) {
    const candidate = join(directory, name)
    if (fileExists(candidate)) return candidate
  }
  return undefined
}

/**
 * Resolve a configured value that may be the executable itself,
 * a kernel directory, or a product folder holding version directories.
 */
function fromConfigured(value) {
  const path = String(value).trim()
  if (path === '') return undefined
  const absolute = isAbsolute(path) ? path : resolvePath(path)
  if (fileExists(absolute)) {
    const name = basename(absolute).toLowerCase()
    if (KERNEL_EXECUTABLES.some(kernel => kernel.toLowerCase() === name)
      || POSIX_EXECUTABLES.some(kernel => kernel.toLowerCase() === name)) {
      return absolute
    }
    return undefined
  }
  if (!directoryExists(absolute)) return undefined
  const direct = kernelIn(absolute)
  if (direct !== undefined) return direct
  const versions = listDirectories(absolute).sort((left, right) => versionKey(right) - versionKey(left))
  for (const version of versions) {
    const found = kernelIn(join(absolute, version))
    if (found !== undefined) return found
  }
  return undefined
}

/**
 * Wolfram writes one `Installations\<id>` key per installed product with
 * `ExecutablePath` (the GUI binary) and `ProductVersion`. The kernel binary sits
 * next to it, so each record yields one candidate directory.
 */
function registryInstallations() {
  if (!isWindows()) return []
  const records = []
  for (const key of [
    'HKLM\\SOFTWARE\\Wolfram Research\\Installations',
    'HKCU\\SOFTWARE\\Wolfram Research\\Installations',
  ]) {
    let stdout = ''
    try {
      const result = spawnSync('reg.exe', ['query', key, '/s'], {
        encoding: 'utf8',
        timeout: 5000,
        windowsHide: true,
      })
      if (result.status !== 0 || typeof result.stdout !== 'string') continue
      stdout = result.stdout
    } catch {
      continue
    }
    let current
    for (const line of stdout.split(/\r?\n/)) {
      if (line.trim() === '') continue
      if (!/^\s/.test(line)) {
        current = {}
        records.push(current)
        continue
      }
      const match = /^\s+(ExecutablePath|InstallationDirectory|InstallLocation|ProductVersion)\s+REG_\w+\s+(.+?)\s*$/.exec(line)
      if (match === null || current === undefined) continue
      current[match[1]] = match[2]
    }
  }
  const seen = new Set()
  const candidates = []
  for (const record of records) {
    const target = record.ExecutablePath ?? record.InstallationDirectory ?? record.InstallLocation
    if (typeof target !== 'string' || target === '') continue
    const directory = record.ExecutablePath !== undefined ? dirname(target) : target
    const normalized = directory.toLowerCase()
    if (seen.has(normalized)) continue
    seen.add(normalized)
    candidates.push({ directory, version: record.ProductVersion ?? '' })
  }
  return candidates.sort((left, right) => versionKey(right.version) - versionKey(left.version))
}

/** The classic installer layout, for installs the registry does not describe. */
export function standardInstallations() {
  const roots = []
  for (const name of ['ProgramFiles', 'ProgramW6432', 'ProgramFiles(x86)']) {
    const value = process.env[name]
    if (typeof value === 'string' && value !== '' && !roots.includes(value)) roots.push(value)
  }
  const candidates = []
  for (const root of roots) {
    for (const product of PRODUCT_FOLDERS) {
      const versions = listDirectories(join(root, 'Wolfram Research', product))
        .sort((left, right) => versionKey(right) - versionKey(left))
      for (const version of versions) {
        candidates.push(join(root, 'Wolfram Research', product, version))
      }
    }
  }
  return candidates
}

/** A `math` executable already on PATH (Wolfram Engine installations often add one). */
function pathInstallation() {
  const command = isWindows() ? 'where.exe' : 'which'
  const arguments_ = isWindows() ? ['math.exe'] : ['math']
  try {
    const result = spawnSync(command, arguments_, {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true,
    })
    if (result.status !== 0 || typeof result.stdout !== 'string') return []
    return result.stdout.split(/\r?\n/).map(line => line.trim()).filter(line => line !== '')
  } catch {
    return []
  }
}

/**
 * Resolve the kernel executable.
 * @param {{ configured?: string, extraTried?: string[] }} [options]
 * @returns {{ path: string, source: string }}
 * @throws an Error that lists every location tried.
 */
export function resolveKernel(options = {}) {
  const tried = []
  const record = (source, value) => {
    tried.push(`${source}: ${value}`)
    return value
  }

  if (typeof options.configured === 'string' && options.configured.trim() !== '') {
    const configured = record('config.kernel', options.configured)
    const found = fromConfigured(configured)
    if (found === undefined) {
      throw new Error(
        `The configured Wolfram kernel "${configured}" is not a math.exe, a kernel directory, or a product folder. `
        + 'Point config.kernel at the math.exe itself (for example '
        + '"C:\\Program Files\\Wolfram Research\\Wolfram\\15.0\\math.exe").',
      )
    }
    return { path: found, source: 'config' }
  }

  for (const name of ['WOLFRAM_KERNEL', 'MATHEMATICA_KERNEL']) {
    const value = process.env[name]
    if (typeof value !== 'string' || value.trim() === '') continue
    record(name, value)
    const found = fromConfigured(value)
    if (found !== undefined) return { path: found, source: name }
  }

  for (const installation of registryInstallations()) {
    const found = kernelIn(record('registry', installation.directory))
    if (found !== undefined) return { path: found, source: 'registry' }
  }

  for (const directory of standardInstallations()) {
    const found = kernelIn(record('standard location', directory))
    if (found !== undefined) return { path: found, source: 'standard location' }
  }

  for (const candidate of pathInstallation()) {
    if (fileExists(record('PATH', candidate))) return { path: candidate, source: 'PATH' }
  }

  const shown = tried.slice(0, 10).join('\n  ')
  throw new Error(
    'No Wolfram kernel (math.exe) was found. Install Mathematica or Wolfram Engine, '
    + 'set WOLFRAM_KERNEL to the math.exe path, or set config.kernel in the plugin row. '
    + (shown === '' ? '' : `Tried:\n  ${shown}`),
  )
}
