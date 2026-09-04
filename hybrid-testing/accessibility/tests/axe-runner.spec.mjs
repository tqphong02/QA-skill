/**
 * @qa-skill/hybrid-accessibility — axe-runner.spec.mjs
 * Unit tests for accessibility runner, parser, categorization, and reporting logic
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseArgs,
  calculateVerdict,
  formatAxeResults,
  generateMarkdownReport,
  runAxeScan,
  DEFAULT_TAGS,
} from '../scripts/run-axe.mjs'

describe('hybrid-accessibility — argument parser', () => {
  it('parses empty args with defaults', () => {
    const opts = parseArgs([])
    assert.deepEqual(opts.tags, DEFAULT_TAGS)
    assert.equal(opts.json, false)
    assert.equal(opts.help, false)
  })

  it('parses --url, --tags, and --output flags', () => {
    const argv = [
      '--url', 'https://staging.example.com',
      '--tags', 'wcag2a,wcag2aa',
      '--output', './reports/a11y',
      '--json',
    ]
    const opts = parseArgs(argv)
    assert.equal(opts.url, 'https://staging.example.com')
    assert.deepEqual(opts.tags, ['wcag2a', 'wcag2aa'])
    assert.equal(opts.output, './reports/a11y')
    assert.equal(opts.json, true)
  })

  it('parses --help flag', () => {
    const opts = parseArgs(['-h'])
    assert.equal(opts.help, true)
  })
})

describe('hybrid-accessibility — verdict and severity calculation', () => {
  it('empty violations list produces PASS', () => {
    const result = calculateVerdict([])
    assert.equal(result.verdict, 'PASS')
    assert.equal(result.hasCriticalOrSerious, false)
    assert.match(result.summary, /No accessibility violations/)
  })

  it('critical or serious violations produce FAILED', () => {
    const violations = [
      { id: 'image-alt', impact: 'critical' },
      { id: 'color-contrast', impact: 'serious' },
    ]
    const result = calculateVerdict(violations)
    assert.equal(result.verdict, 'FAILED')
    assert.equal(result.hasCriticalOrSerious, true)
    assert.equal(result.criticalCount, 1)
    assert.equal(result.seriousCount, 1)
    assert.equal(result.totalViolations, 2)
  })

  it('only moderate or minor violations produce WARNING', () => {
    const violations = [
      { id: 'landmark-one-main', impact: 'moderate' },
      { id: 'tabindex', impact: 'minor' },
    ]
    const result = calculateVerdict(violations)
    assert.equal(result.verdict, 'WARNING')
    assert.equal(result.hasCriticalOrSerious, false)
    assert.equal(result.moderateCount, 1)
    assert.equal(result.minorCount, 1)
  })
})

describe('hybrid-accessibility — report data formatting', () => {
  const sampleRawResults = {
    url: 'https://example.com/login',
    timestamp: '2026-09-04T12:00:00.000Z',
    violations: [
      {
        id: 'color-contrast',
        impact: 'serious',
        description: 'Ensures the contrast between foreground and background colors meets WCAG 2 AA thresholds',
        help: 'Elements must meet minimum color contrast ratio thresholds',
        helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/color-contrast',
        tags: ['cat.color', 'wcag2aa', 'wcag143'],
        nodes: [
          {
            html: '<button class="btn">Submit</button>',
            target: ['button.btn'],
            failureSummary: 'Fix any of the following: Element has insufficient color contrast of 2.5:1',
          },
        ],
      },
    ],
    passes: [
      {
        id: 'document-title',
        description: 'Ensures each HTML document contains a non-empty <title> element',
        help: 'Documents must have <title> element to aid in navigation',
        tags: ['cat.text-alternatives', 'wcag2a'],
      },
    ],
  }

  it('formats raw axe results into structured report data', () => {
    const formatted = formatAxeResults(sampleRawResults)
    assert.equal(formatted.url, 'https://example.com/login')
    assert.equal(formatted.verdict, 'FAILED')
    assert.equal(formatted.passesCount, 1)
    assert.equal(formatted.violations.length, 1)

    const v = formatted.violations[0]
    assert.equal(v.ruleId, 'color-contrast')
    assert.equal(v.impact, 'serious')
    assert.deepEqual(v.wcagTags, ['wcag2aa', 'wcag143'])
    assert.equal(v.nodesCount, 1)
    assert.equal(v.nodes[0].html, '<button class="btn">Submit</button>')
  })

  it('generates markdown report with tables and recommendations', () => {
    const formatted = formatAxeResults(sampleRawResults)
    const md = generateMarkdownReport(formatted)

    assert.ok(md.includes('# Accessibility Audit Report'), 'Missing title')
    assert.ok(md.includes('https://example.com/login'), 'Missing URL')
    assert.ok(md.includes('`FAILED`'), 'Missing verdict')
    assert.ok(md.includes('`color-contrast`'), 'Missing ruleId')
    assert.ok(md.includes('wcag2aa'), 'Missing WCAG tag')
    assert.ok(md.includes('button.btn'), 'Missing node target selector')
  })

  it('generates markdown report for passing audit cleanly', () => {
    const passingRaw = {
      url: 'https://example.com/about',
      timestamp: '2026-09-04T12:00:00.000Z',
      violations: [],
      passes: [{ id: 'html-has-lang' }],
    }
    const formatted = formatAxeResults(passingRaw)
    const md = generateMarkdownReport(formatted)
    assert.ok(md.includes('`PASS`'), 'Expected PASS verdict')
    assert.ok(md.includes('All automated axe-core rules passed'), 'Missing pass summary')
  })
})

describe('hybrid-accessibility — runner execution guard', () => {
  it('returns BLOCKED when no target URL is provided without throwing', async () => {
    const res = await runAxeScan({})
    assert.equal(res.ok, false)
    assert.equal(res.status, 'BLOCKED')
    assert.match(res.reason, /Missing target URL/)
  })
})
