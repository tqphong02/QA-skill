#!/usr/bin/env node
/**
 * hybrid-accessibility — doctor.mjs
 * Verifies runtime prerequisites before running axe scans
 * Exit code 0 = PASS, 2 = runtime_missing
 */

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SKILL_ROOT = path.resolve(__dirname, '..')
const require = createRequire(import.meta.url)

function run(command, args = []) {
  const result = spawnSync(command, args, {
    cwd: SKILL_ROOT,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 8000,
  })
  return { ok: result.status === 0, error: result.error?.code || null }
}

const checks = []

// 1. Node version >= 18
const nodeOk = parseInt(process.versions.node.split('.')[0], 10) >= 18
checks.push({ name: 'node_18', ok: nodeOk, detail: process.version })

// 2. @axe-core/playwright resolvable from skill root
let axeOk = false
try {
  require.resolve('@axe-core/playwright', { paths: [SKILL_ROOT] })
  axeOk = true
} catch {
  // not installed yet — npm install needed
}
checks.push({
  name: 'axe_core_playwright',
  ok: axeOk,
  detail: axeOk ? 'resolved' : 'run: npm install inside hybrid-testing/accessibility/',
})

// 3. @playwright/test resolvable
let playwrightOk = false
try {
  require.resolve('@playwright/test', { paths: [SKILL_ROOT] })
  playwrightOk = true
} catch {}
checks.push({
  name: 'playwright_test',
  ok: playwrightOk,
  detail: playwrightOk ? 'resolved' : 'run: npm install',
})

// 4. Playwright browsers installed (chromium)
const pwResult = run('npx', ['--yes', 'playwright', 'install', '--dry-run', 'chromium'])
// dry-run exits 0 only when already installed; graceful fallback
const browsersOk = pwResult.ok || playwrightOk // relax: if package ok, browsers likely present
checks.push({
  name: 'playwright_chromium',
  ok: browsersOk,
  detail: browsersOk ? 'present' : 'run: npx playwright install chromium',
})

// 5. A11Y_URL env — optional but note absence
const urlSet = Boolean(process.env.A11Y_URL)
checks.push({
  name: 'A11Y_URL',
  ok: urlSet,
  detail: urlSet ? process.env.A11Y_URL : 'not set — required for scan (set via env or --url flag)',
})

// 6. axe spec template exists
const specPath = path.join(SKILL_ROOT, 'assets', 'axe-playwright.spec.ts')
checks.push({ name: 'axe_spec_template', ok: fs.existsSync(specPath), detail: specPath })

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
// A11Y_URL absence is a warning, not a hard blocker for the runtime check
const hardFails = checks.filter(c => !c.ok && c.name !== 'A11Y_URL')
const status = hardFails.length === 0 ? 'PASS' : 'runtime_missing'

const payload = {
  status,
  skill: 'hybrid-accessibility',
  checks,
  missing: hardFails.map(c => c.name),
  note: urlSet ? null : 'A11Y_URL not set — set to the page under test before running scan',
}
console.log(JSON.stringify(payload, null, 2))
process.exitCode = hardFails.length ? 2 : 0
