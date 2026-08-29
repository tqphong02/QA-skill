#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadSkillRegistry } from './skill-registry.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CONTRACT_PATH = path.join(ROOT, 'config', 'local-run-contract.md')
const START = '<!-- qa-runs-contract:start -->'
const END = '<!-- qa-runs-contract:end -->'
const CHECK_ONLY = process.argv.includes('--check')

function frontmatterEnd(text, file) {
  if (!text.startsWith('---\n')) throw new Error(`${file} does not start with YAML frontmatter`)
  const closing = text.indexOf('\n---', 4)
  if (closing === -1) throw new Error(`${file} has unclosed YAML frontmatter`)
  return closing + 4
}

function expectedText(source, contract, file) {
  const start = source.indexOf(START)
  const end = source.indexOf(END)
  if ((start === -1) !== (end === -1)) throw new Error(`${file} has an incomplete local run contract marker`)
  if (start !== -1) {
    if (end < start) throw new Error(`${file} has reversed local run contract markers`)
    return `${source.slice(0, start)}${contract}${source.slice(end + END.length)}`
  }
  const insertAt = frontmatterEnd(source, file)
  return `${source.slice(0, insertAt)}\n\n${contract}\n${source.slice(insertAt).replace(/^\n+/, '')}`
}

function main() {
  const contract = fs.readFileSync(CONTRACT_PATH, 'utf8').trim()
  const registry = loadSkillRegistry(ROOT)
  const stale = []
  for (const entry of registry.skills) {
    const file = path.join(ROOT, entry.path, 'SKILL.md')
    const source = fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n')
    const expected = expectedText(source, contract, file)
    if (source === expected) continue
    if (CHECK_ONLY) stale.push(entry.id)
    else fs.writeFileSync(file, expected, 'utf8')
  }
  if (stale.length) {
    console.error(`ERROR: local run contract is stale in ${stale.join(', ')}`)
    process.exitCode = 1
    return
  }
  console.log(`${CHECK_ONLY ? 'PASS' : 'Synced'}: local run contract in ${registry.skills.length} skills`)
}

try {
  main()
} catch (error) {
  console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
