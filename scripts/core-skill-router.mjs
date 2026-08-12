#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CONTRACT_PATH = path.join(ROOT, 'config', 'core-routing-contract.json')

export function loadRoutingContract(file = CONTRACT_PATH) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function matches(pattern, input) {
  return new RegExp(pattern, 'iu').test(input)
}

export function normalizeRoutingIntent(input) {
  return String(input || '')
    .replace(/(?:\bdo not\b|\bdon't\b|\bwithout\b|\bexclude(?:s|d|ing)?\b|\bthis is not a request to\b|\bthere is no\b|\bno\s+|\bnot\s+)[^.;\n]*/giu, ' ')
    .replace(/(?:\bkhông\b|\bchưa\b)[^.;\n]*/giu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

export function routeRequest(input, contract = loadRoutingContract()) {
  const text = normalizeRoutingIntent(input)
  if (!text) return null
  const routes = [...contract.routes].sort((left, right) => left.priority - right.priority)
  for (const candidate of routes) {
    const rule = candidate.match || {}
    const all = rule.all || []
    const any = rule.any || []
    const none = rule.none || []
    if (all.some(pattern => !matches(pattern, text))) continue
    if (any.length && !any.some(pattern => matches(pattern, text))) continue
    if (none.some(pattern => matches(pattern, text))) continue
    return {
      id: candidate.id,
      route: candidate.route,
      mode: candidate.mode,
      requires_brief: candidate.requires_brief,
      first_action: candidate.first_action,
    }
  }
  return null
}

export function validateRoutingContract(contract = loadRoutingContract(), root = ROOT) {
  const failures = []
  for (const item of contract.golden_cases || []) {
    const actual = routeRequest(item.input, contract)
    if (!actual) {
      failures.push(`${item.id}: no route`)
      continue
    }
    if (JSON.stringify(actual.route) !== JSON.stringify(item.expected_route)) {
      failures.push(`${item.id}: route ${JSON.stringify(actual.route)} != ${JSON.stringify(item.expected_route)}`)
    }
    if (actual.mode !== item.expected_mode) {
      failures.push(`${item.id}: mode ${actual.mode} != ${item.expected_mode}`)
    }
    if (actual.requires_brief !== item.requires_brief) {
      failures.push(`${item.id}: requires_brief ${actual.requires_brief} != ${item.requires_brief}`)
    }
  }

  for (const [relative, document] of Object.entries(contract.document_contracts || {})) {
    const target = path.join(root, relative)
    if (!fs.existsSync(target)) {
      failures.push(`${relative}: missing document`)
      continue
    }
    const content = fs.readFileSync(target, 'utf8')
    const bytes = Buffer.byteLength(content)
    if (document.max_bytes && bytes > document.max_bytes) {
      failures.push(`${relative}: ${bytes} bytes exceeds budget ${document.max_bytes}`)
    }
    for (const required of document.required || []) {
      if (!content.includes(required)) failures.push(`${relative}: missing ${JSON.stringify(required)}`)
    }
    for (const forbidden of document.forbidden || []) {
      if (content.includes(forbidden)) failures.push(`${relative}: forbidden ${JSON.stringify(forbidden)}`)
    }
  }
  return failures
}

export function runSelfTest() {
  const contract = loadRoutingContract()
  const failures = validateRoutingContract(contract)
  if (failures.length) {
    console.error('CORE ROUTING CONTRACT FAILED')
    for (const failure of failures) console.error(`- ${failure}`)
    return 1
  }
  console.log(`CORE ROUTING CONTRACT PASS: ${contract.golden_cases.length} golden cases`)
  return 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  if (args[0] === '--self-test') {
    process.exitCode = runSelfTest()
  } else if (args[0] === '--text') {
    console.log(JSON.stringify(routeRequest(args.slice(1).join(' ')), null, 2))
  } else {
    console.error('Usage: core-skill-router.mjs --self-test | --text <request>')
    process.exitCode = 2
  }
}
