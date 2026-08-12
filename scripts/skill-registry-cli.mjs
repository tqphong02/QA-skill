#!/usr/bin/env node

import path from 'node:path'
import { resolveSkillEntry, skillRepoPath, loadSkillRegistry, ROOT } from './skill-registry.mjs'

const [command, input, rootArg] = process.argv.slice(2)
const root = rootArg ? path.resolve(rootArg) : ROOT

if (command === 'path') {
  const resolved = skillRepoPath(input, root)
  if (!resolved) {
    console.error(`Unknown skill registry ID or alias: ${input || '<missing>'}`)
    process.exitCode = 1
  } else {
    console.log(resolved)
  }
} else if (command === 'id') {
  const entry = resolveSkillEntry(input, root)
  if (!entry) {
    console.error(`Unknown skill registry ID or alias: ${input || '<missing>'}`)
    process.exitCode = 1
  } else {
    console.log(entry.id)
  }
} else if (command === 'list') {
  for (const entry of loadSkillRegistry(root).skills) console.log(entry.id)
} else if (command === 'aliases') {
  const entry = resolveSkillEntry(input, root)
  if (!entry) {
    console.error(`Unknown skill registry ID or alias: ${input || '<missing>'}`)
    process.exitCode = 1
  } else {
    for (const alias of entry.legacy_aliases || []) console.log(alias)
  }
} else if (command === 'list-aliases') {
  for (const entry of loadSkillRegistry(root).skills) {
    for (const alias of entry.legacy_aliases || []) console.log(`${alias}\t${entry.id}`)
  }
} else {
  console.error('Usage: skill-registry-cli.mjs <path|id|list|aliases|list-aliases> [skill-or-alias] [repo-root]')
  process.exitCode = 2
}
