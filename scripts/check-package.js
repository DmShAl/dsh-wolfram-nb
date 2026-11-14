#!/usr/bin/env node
// Guard for build-tgz.bat: dsh refuses a packed plugin whose package.json is
// not clean UTF-8 JSON. PowerShell's `Set-Content -Encoding utf8` writes a BOM,
// which used to surface only after the profile had already been touched.
import { readFileSync } from 'node:fs'

const path = 'package.json'
const bytes = readFileSync(path)

if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
  console.error('[build-tgz] package.json starts with a UTF-8 BOM; rewrite it without one')
  process.exit(1)
}

try {
  JSON.parse(bytes.toString('utf8'))
} catch (error) {
  console.error(`[build-tgz] package.json is not valid JSON: ${error.message}`)
  process.exit(1)
}

console.log('[build-tgz] package.json: clean UTF-8 JSON')
