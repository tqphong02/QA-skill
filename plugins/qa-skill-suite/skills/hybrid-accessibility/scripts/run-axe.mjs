#!/usr/bin/env node
/**
 * @qa-skill/hybrid-accessibility — run-axe.mjs
 * Automated accessibility auditing CLI using Axe-core and Playwright
 *
 * Usage:
 *   node scripts/run-axe.mjs --url <URL> [--tags <tags>] [--output <dir>] [--json]
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SKILL_ROOT = path.resolve(__dirname, '..')
const PROJECT_ROOT = path.resolve(SKILL_ROOT, '..', '..')

export const DEFAULT_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

export function parseArgs(argv = []) {
  const options = {
    url: process.env.A11Y_URL || null,
    tags: DEFAULT_TAGS,
    output: null,
    json: false,
    help: false,
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      options.help = true
    } else if (arg === '--json') {
      options.json = true
    } else if (arg === '--url') {
      options.url = argv[++i]
    } else if (arg === '--tags') {
      const val = argv[++i]
      if (val) {
        options.tags = val.split(',').map(t => t.trim()).filter(Boolean)
      }
    } else if (arg === '--output' || arg === '-o') {
      options.output = argv[++i]
    }
  }

  return options
}

export function calculateVerdict(violations = []) {
  if (!Array.isArray(violations) || violations.length === 0) {
    return {
      verdict: 'PASS',
      hasCriticalOrSerious: false,
      summary: 'No accessibility violations detected.',
    }
  }

  const criticalCount = violations.filter(v => v.impact === 'critical').length
  const seriousCount = violations.filter(v => v.impact === 'serious').length
  const moderateCount = violations.filter(v => v.impact === 'moderate').length
  const minorCount = violations.filter(v => v.impact === 'minor').length

  const hasFailures = criticalCount > 0 || seriousCount > 0

  return {
    verdict: hasFailures ? 'FAILED' : 'WARNING',
    hasCriticalOrSerious: hasFailures,
    criticalCount,
    seriousCount,
    moderateCount,
    minorCount,
    totalViolations: violations.length,
    summary: `${violations.length} violation(s): ${criticalCount} critical, ${seriousCount} serious, ${moderateCount} moderate, ${minorCount} minor.`,
  }
}

export function formatAxeResults(rawResults = {}, targetUrl = '') {
  const violations = (rawResults.violations || []).map(v => ({
    ruleId: v.id,
    impact: v.impact || 'minor',
    description: v.description || '',
    help: v.help || '',
    helpUrl: v.helpUrl || '',
    tags: v.tags || [],
    wcagTags: (v.tags || []).filter(t => t.startsWith('wcag')),
    nodesCount: (v.nodes || []).length,
    nodes: (v.nodes || []).map(n => ({
      html: n.html,
      target: n.target,
      failureSummary: n.failureSummary,
    })),
  }))

  const passes = (rawResults.passes || []).map(p => ({
    ruleId: p.id,
    description: p.description || '',
    help: p.help || '',
    tags: p.tags || [],
  }))

  const stats = calculateVerdict(violations)

  return {
    url: targetUrl || rawResults.url || '',
    timestamp: rawResults.timestamp || new Date().toISOString(),
    verdict: stats.verdict,
    stats,
    violations,
    passesCount: passes.length,
    applicableRulesCount: violations.length + passes.length,
  }
}

export function generateMarkdownReport(reportData) {
  const { url, timestamp, verdict, stats, violations, passesCount, applicableRulesCount } = reportData

  const lines = []
  lines.push('# Accessibility Audit Report')
  lines.push('')
  lines.push(`- **Target URL:** ${url}`)
  lines.push(`- **Audit Timestamp:** ${timestamp}`)
  lines.push(`- **Verdict:** \`${verdict}\``)
  lines.push(`- **Rules Evaluated:** ${applicableRulesCount} (${passesCount} passed, ${violations.length} violations)`)
  lines.push('')
  lines.push('## Executive Summary')
  lines.push('')
  lines.push(`- **Critical Issues:** ${stats.criticalCount || 0}`)
  lines.push(`- **Serious Issues:** ${stats.seriousCount || 0}`)
  lines.push(`- **Moderate Issues:** ${stats.moderateCount || 0}`)
  lines.push(`- **Minor Issues:** ${stats.minorCount || 0}`)
  lines.push('')

  if (violations.length === 0) {
    lines.push('> [!NOTE]')
    lines.push('> All automated axe-core rules passed for the target page.')
    lines.push('')
    return lines.join('\n')
  }

  lines.push('## Violations Detail')
  lines.push('')
  lines.push('| Rule ID | Impact | WCAG Criterion | Nodes Affected | Description |')
  lines.push('|---|---|---|---|---|')

  for (const v of violations) {
    const wcag = v.wcagTags.join(', ') || 'N/A'
    const desc = v.help ? `[${v.help}](${v.helpUrl})` : v.description
    lines.push(`| \`${v.ruleId}\` | **${v.impact.toUpperCase()}** | ${wcag} | ${v.nodesCount} | ${desc} |`)
  }

  lines.push('')
  lines.push('## Recommended Remediations')
  lines.push('')
  for (const v of violations) {
    lines.push(`### Rule: \`${v.ruleId}\` (${v.impact})`)
    lines.push(`- **Description:** ${v.description}`)
    if (v.helpUrl) {
      lines.push(`- **Guidelines:** [${v.helpUrl}](${v.helpUrl})`)
    }
    if (v.nodes && v.nodes.length > 0) {
      lines.push('- **Affected Elements:**')
      for (const node of v.nodes.slice(0, 5)) {
        lines.push(`  - Selector: \`${Array.isArray(node.target) ? node.target.join(' ') : node.target}\``)
        if (node.failureSummary) {
          lines.push(`    - Fix hint: ${node.failureSummary.replace(/\n/g, ' ')}`)
        }
      }
      if (v.nodes.length > 5) {
        lines.push(`  - *(and ${v.nodes.length - 5} more elements...)*`)
      }
    }
    lines.push('')
  }

  return lines.join('\n')
}

export async function runAxeScan(options = {}) {
  const { url, tags = DEFAULT_TAGS, output } = options

  if (!url) {
    return {
      ok: false,
      status: 'BLOCKED',
      reason: 'Missing target URL. Provide --url <url> or set A11Y_URL environment variable.',
    }
  }

  let chromium, AxeBuilder
  try {
    const playwright = await import('playwright')
    chromium = playwright.chromium
    const axeModule = await import('@axe-core/playwright')
    AxeBuilder = axeModule.default || axeModule.AxeBuilder || axeModule
  } catch (err) {
    return {
      ok: false,
      status: 'runtime_missing',
      reason: `Dependencies not installed: ${err.message}. Run npm install in ../.`,
    }
  }

  let browser
  try {
    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext()
    const page = await context.newPage()

    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })

    const builder = new AxeBuilder({ page }).withTags(tags)
    const rawResults = await builder.analyze()

    const reportData = formatAxeResults(rawResults, url)
    const markdownReport = generateMarkdownReport(reportData)

    if (output) {
      fs.mkdirSync(output, { recursive: true })
      fs.writeFileSync(path.join(output, 'axe-report.json'), JSON.stringify(reportData, null, 2), 'utf8')
      fs.writeFileSync(path.join(output, 'report.md'), markdownReport, 'utf8')
    }

    return {
      ok: true,
      reportData,
      markdownReport,
    }
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}

// ---------------------------------------------------------------------------
// CLI Execution
// ---------------------------------------------------------------------------
const isMain = process.argv[1] && (
  process.argv[1] === fileURLToPath(import.meta.url) ||
  process.argv[1].endsWith('run-axe.mjs')
)

if (isMain) {
  const options = parseArgs(process.argv.slice(2))

  if (options.help) {
    console.log(`
Usage: node scripts/run-axe.mjs --url <URL> [options]

Options:
  --url <URL>       Target URL to audit (or set A11Y_URL env)
  --tags <tags>     Comma-separated WCAG tags (default: ${DEFAULT_TAGS.join(',')})
  --output <dir>    Output directory for axe-report.json and report.md
  --json            Print JSON results to stdout
  --help, -h        Show this help message
`)
    process.exit(0)
  }

  if (!options.url) {
    console.error('Error: Target URL is required. Provide --url <URL> or set A11Y_URL environment variable.')
    process.exit(2)
  }

  runAxeScan(options)
    .then(result => {
      if (!result.ok) {
        console.error(`Execution failed (${result.status}): ${result.reason}`)
        process.exit(result.status === 'runtime_missing' ? 2 : 1)
      }

      if (options.json) {
        console.log(JSON.stringify(result.reportData, null, 2))
      } else {
        console.log(result.markdownReport)
      }

      if (result.reportData.stats.hasCriticalOrSerious) {
        process.exit(1)
      }
      process.exit(0)
    })
    .catch(err => {
      console.error('Unexpected scan error:', err)
      process.exit(1)
    })
}
