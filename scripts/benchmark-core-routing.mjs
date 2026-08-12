#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'

import { loadRoutingContract, routeRequest } from './core-skill-router.mjs'
import { loadSkillRegistry } from './skill-registry.mjs'
import { resolveInvocationRoot } from './invocation-paths.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const INVOCATION_ROOT = resolveInvocationRoot()
const HOST_DOCUMENTS = {
  codex: 'AGENTS.md',
  gemini: 'GEMINI.md',
  copilot: '.github/copilot-instructions.md',
  cursor: '.cursor/rules/dynamic-web-exploratory.mdc',
  windsurf: '.windsurf/rules/dynamic-web-exploratory.md',
}

function parseArgs(argv) {
  const args = {
    dataset: path.join(ROOT, 'config', 'core-routing-holdout-v6.json'),
    regressionDatasets: [
      path.join(ROOT, 'config', 'core-routing-holdout.json'),
      path.join(ROOT, 'config', 'core-routing-holdout-v2.json'),
      path.join(ROOT, 'config', 'core-routing-holdout-v3.json'),
      path.join(ROOT, 'config', 'core-routing-holdout-v4.json'),
      path.join(ROOT, 'config', 'core-routing-holdout-v5.json'),
    ],
    output: path.resolve(INVOCATION_ROOT, 'evidence', 'ai-eval', 'core-routing-latest.json'),
    host: 'codex',
    iterations: 200,
    minPassRate: 1,
    maxP95RouterMs: 1,
    maxP95InstructionTokens: 30000,
    certification: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    const next = () => argv[++index]
    if (value === '--dataset') args.dataset = path.resolve(INVOCATION_ROOT, next())
    else if (value === '--regression-dataset') args.regressionDatasets.push(path.resolve(INVOCATION_ROOT, next()))
    else if (value === '--output') args.output = path.resolve(INVOCATION_ROOT, next())
    else if (value === '--host') args.host = next()
    else if (value === '--iterations') args.iterations = Number(next())
    else if (value === '--min-pass-rate') args.minPassRate = Number(next())
    else if (value === '--max-p95-router-ms') args.maxP95RouterMs = Number(next())
    else if (value === '--max-p95-instruction-tokens') args.maxP95InstructionTokens = Number(next())
    else if (value === '--certification') args.certification = true
    else if (value === '--help' || value === '-h') {
      console.log('Usage: benchmark-core-routing.mjs [--certification] [--dataset <holdout.json>] [--regression-dataset <json>]... [--output <json>] [--host codex|gemini|copilot|cursor|windsurf] [--iterations <n>]')
      process.exit(0)
    } else throw new Error(`Unknown argument: ${value}`)
  }
  if (!HOST_DOCUMENTS[args.host]) throw new Error(`Unsupported host: ${args.host}`)
  if (!Number.isInteger(args.iterations) || args.iterations < 1) throw new Error('--iterations must be a positive integer')
  for (const [name, value] of Object.entries({ minPassRate: args.minPassRate, maxP95RouterMs: args.maxP95RouterMs, maxP95InstructionTokens: args.maxP95InstructionTokens })) {
    if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a non-negative number`)
  }
  if (args.minPassRate > 1) throw new Error('--min-pass-rate must be between 0 and 1')
  return args
}

function percentile(values, ratio) {
  if (!values.length) return null
  const ordered = [...values].sort((left, right) => left - right)
  const rank = (ordered.length - 1) * ratio
  const low = Math.floor(rank)
  const high = Math.ceil(rank)
  if (low === high) return ordered[low]
  return ordered[low] + (ordered[high] - ordered[low]) * (rank - low)
}

function tokenEstimateFromBytes(bytes) {
  return Math.ceil(bytes / 4)
}

function skillMetadataBytes(skillFile) {
  const text = fs.readFileSync(skillFile, 'utf8')
  const frontmatter = text.match(/^---\n([\s\S]*?)\n---/u)?.[1] || ''
  const lines = frontmatter.split('\n').filter(line => /^(name|description):/.test(line))
  return Buffer.byteLength(lines.join('\n'))
}

function validateDataset(dataset) {
  if (!dataset || typeof dataset !== 'object') throw new Error('Dataset must be a JSON object')
  if (!String(dataset.version || '').trim()) throw new Error('Dataset requires version')
  if (!Array.isArray(dataset.cases) || !dataset.cases.length) throw new Error('Dataset requires non-empty cases')
  const seen = new Set()
  for (const item of dataset.cases) {
    if (!item.id || seen.has(item.id)) throw new Error(`Dataset case ID is missing or duplicated: ${item.id}`)
    seen.add(item.id)
    if (!String(item.input || '').trim()) throw new Error(`${item.id}: input is required`)
    if (!Array.isArray(item.expected_route) || !item.expected_route.length) throw new Error(`${item.id}: expected_route is required`)
    if (!item.expected_mode || typeof item.requires_brief !== 'boolean') throw new Error(`${item.id}: expected_mode and requires_brief are required`)
  }
}

function instructionBudget(caseResult, hostDocument, registryById) {
  const files = [hostDocument]
  for (const skillId of [...new Set(caseResult.actual?.route || [])]) {
    const entry = registryById.get(skillId)
    if (entry) files.push(path.join(ROOT, entry.path, 'SKILL.md'))
  }
  const bytes = files.reduce((total, file) => total + fs.statSync(file).size, 0)
  return {
    files: files.map(file => path.relative(ROOT, file)),
    bytes,
    estimated_tokens_utf8_div4: tokenEstimateFromBytes(bytes),
  }
}

function routeCase(item, contract) {
  const actual = routeRequest(item.input, contract)
  const assertions = {
    route: JSON.stringify(actual?.route || null) === JSON.stringify(item.expected_route),
    mode: actual?.mode === item.expected_mode,
    requires_brief: actual?.requires_brief === item.requires_brief,
  }
  return {
    id: item.id,
    split: item.split || 'holdout',
    tags: item.tags || [],
    critical: item.critical === true,
    input: item.input,
    expected: {
      route: item.expected_route,
      mode: item.expected_mode,
      requires_brief: item.requires_brief,
    },
    actual,
    assertions,
    passed: Object.values(assertions).every(Boolean),
    provider_usage: item.provider_usage || null,
  }
}

function summarizeCases(results) {
  const groups = {}
  for (const result of results) {
    groups[result.split] ||= []
    groups[result.split].push(result)
  }
  return Object.fromEntries(Object.entries(groups).map(([split, cases]) => {
    const passed = cases.filter(item => item.passed).length
    return [split, { cases: cases.length, passed, pass_rate: passed / cases.length }]
  }))
}

function providerSummary(results) {
  const measured = results.map(item => item.provider_usage).filter(Boolean)
  if (!measured.length) return { status: 'NOT_MEASURED', note: 'Provide provider_usage per case from host-reported telemetry; deterministic estimates are kept separate' }
  const input = measured.map(item => Number(item.input_tokens)).filter(Number.isFinite)
  const output = measured.map(item => Number(item.output_tokens)).filter(Number.isFinite)
  const total = measured.map(item => Number(item.total_tokens)).filter(Number.isFinite)
  const latency = measured.map(item => Number(item.latency_ms)).filter(Number.isFinite)
  return {
    status: measured.length === results.length ? 'COMPLETE' : 'PARTIAL',
    measured_cases: measured.length,
    p50_input_tokens: percentile(input, 0.5),
    p95_input_tokens: percentile(input, 0.95),
    p50_output_tokens: percentile(output, 0.5),
    p95_output_tokens: percentile(output, 0.95),
    p50_total_tokens: percentile(total, 0.5),
    p95_total_tokens: percentile(total, 0.95),
    p50_latency_ms: percentile(latency, 0.5),
    p95_latency_ms: percentile(latency, 0.95),
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const contract = loadRoutingContract()
  const holdout = JSON.parse(fs.readFileSync(options.dataset, 'utf8'))
  const regressions = options.regressionDatasets.map(file => JSON.parse(fs.readFileSync(file, 'utf8')))
  validateDataset(holdout)
  for (const regression of regressions) validateDataset(regression)
  const developmentCases = contract.golden_cases.map(item => ({ ...item, split: 'development', tags: ['contract-regression'], critical: true }))
  const regressionCases = regressions.flatMap(regression => regression.cases.map(item => ({ ...item, split: `independent-v${regression.version}-regression` })))
  const holdoutCases = options.certification ? holdout.cases.map(item => ({ ...item, split: 'holdout' })) : []
  const allCases = [...developmentCases, ...regressionCases, ...holdoutCases]
  const duplicateIds = allCases.map(item => item.id).filter((id, index, values) => values.indexOf(id) !== index)
  if (duplicateIds.length) throw new Error(`Duplicate IDs across development and holdout: ${[...new Set(duplicateIds)].join(', ')}`)

  const results = allCases.map(item => routeCase(item, contract))
  const hostDocument = path.join(ROOT, HOST_DOCUMENTS[options.host])
  const registry = loadSkillRegistry(ROOT)
  const registryById = new Map(registry.skills.map(entry => [entry.id, entry]))
  for (const result of results) result.instruction_budget = instructionBudget(result, hostDocument, registryById)

  for (let index = 0; index < 1000; index += 1) routeRequest(allCases[index % allCases.length].input, contract)
  const routeTimings = []
  for (let iteration = 0; iteration < options.iterations; iteration += 1) {
    for (const item of allCases) {
      const started = performance.now()
      routeRequest(item.input, contract)
      routeTimings.push(performance.now() - started)
    }
  }

  const instructionTokens = results.map(item => item.instruction_budget.estimated_tokens_utf8_div4)
  const passedCases = results.filter(item => item.passed).length
  const passRate = passedCases / results.length
  const criticalFailures = results.filter(item => item.critical && !item.passed).map(item => item.id)
  const coveredSkills = new Set(results.flatMap(item => item.expected.route))
  const missingSkillIds = registry.skills.map(item => item.id).filter(id => !coveredSkills.has(id))
  const metadataBytes = registry.skills.reduce((total, entry) => total + skillMetadataBytes(path.join(ROOT, entry.path, 'SKILL.md')), 0)
  const routerP95 = percentile(routeTimings, 0.95)
  const instructionP95 = percentile(instructionTokens, 0.95)
  const gates = {
    pass_rate: passRate >= options.minPassRate,
    critical_cases: criticalFailures.length === 0,
    all_public_skills_covered: missingSkillIds.length === 0,
    p95_router_latency: routerP95 <= options.maxP95RouterMs,
    p95_instruction_token_proxy: instructionP95 <= options.maxP95InstructionTokens,
  }
  const report = {
    schema_version: '1.0',
    dataset_version: holdout.version,
    regression_dataset_versions: regressions.map(item => item.version),
    routing_contract_version: contract.version,
    generated_at: new Date().toISOString(),
    host: options.host,
    run_kind: options.certification ? 'one_shot_certification' : 'deterministic_regression',
    thresholds: {
      min_pass_rate: options.minPassRate,
      max_p95_router_ms: options.maxP95RouterMs,
      max_p95_instruction_tokens_utf8_div4: options.maxP95InstructionTokens,
    },
    summary: {
      passed: Object.values(gates).every(Boolean),
      cases: results.length,
      passed_cases: passedCases,
      pass_rate: passRate,
      critical_failure_ids: criticalFailures,
      failed_case_ids: results.filter(item => !item.passed).map(item => item.id),
      splits: summarizeCases(results),
      certification: options.certification
        ? (results.filter(item => item.split === 'holdout').every(item => item.passed) ? 'CERTIFIED' : 'NOT_CERTIFIED')
        : 'NOT_RUN',
    },
    coverage: {
      public_skills: registry.skills.length,
      covered_skill_ids: [...coveredSkills].sort(),
      missing_skill_ids: missingSkillIds,
      tags: [...new Set(results.flatMap(item => item.tags))].sort(),
    },
    performance: {
      samples: routeTimings.length,
      router_latency_ms: {
        p50: percentile(routeTimings, 0.5),
        p95: routerP95,
        max: Math.max(...routeTimings),
      },
      instruction_token_proxy_utf8_div4: {
        p50: percentile(instructionTokens, 0.5),
        p95: instructionP95,
        max: Math.max(...instructionTokens),
        note: 'Host router plus selected SKILL.md bytes divided by four; conditional references and provider tokenization are excluded',
      },
      catalog_metadata_proxy_utf8_div4: tokenEstimateFromBytes(metadataBytes),
      provider_reported: providerSummary(results),
    },
    gates,
    results,
  }
  fs.mkdirSync(path.dirname(options.output), { recursive: true })
  fs.writeFileSync(options.output, `${JSON.stringify(report, null, 2)}\n`)
  console.log(`CORE ROUTING BENCHMARK ${report.summary.passed ? 'PASS' : 'FAIL'}`)
  const holdoutText = report.summary.splits.holdout
    ? `${report.summary.splits.holdout.passed}/${report.summary.splits.holdout.cases}`
    : 'not-run'
  console.log(`Cases: ${passedCases}/${results.length}; holdout=${holdoutText}`)
  console.log(`Certification: ${report.summary.certification}`)
  console.log(`Coverage: ${coveredSkills.size}/${registry.skills.length} public skills`)
  console.log(`Router latency p95: ${routerP95.toFixed(4)}ms`)
  console.log(`Instruction token proxy p95: ${Math.round(instructionP95)}`)
  console.log(`Provider usage: ${report.performance.provider_reported.status}`)
  console.log(`Report: ${options.output}`)
  if (!report.summary.passed) process.exitCode = 1
}

try {
  main()
} catch (error) {
  console.error(`CORE ROUTING BENCHMARK ERROR: ${error.message}`)
  process.exitCode = 2
}
