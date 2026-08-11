#!/usr/bin/env node

/**
 * Senior-readiness contract runner for every public skill in this repository.
 *
 * The default mode is intentionally local and read-only:
 * - deterministic fixtures and existing unit/integration suites are executed
 * - external MCP, cloud, device and live-target checks run only as doctors
 * - a missing credential/runtime is recorded as BLOCKED, never as PASS
 * - no Docker, Postgres, network target, mutation or load test is started
 *
 * Exit codes:
 *   0  all local contracts pass; live integrations may still be BLOCKED
 *   1  a deterministic contract or local runtime check failed
 *   2  --strict-live was requested and an integration remains BLOCKED
 *
 * Usage:
 *   node scripts/skill-readiness-suite.mjs
 *   node scripts/skill-readiness-suite.mjs --strict-live
 *   node scripts/skill-readiness-suite.mjs --output-dir evidence/skill-readiness
 */

import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadSkillRegistry, skillRepoPath } from './skill-registry.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SKILL_REGISTRY = loadSkillRegistry(ROOT)
const SKILL_ORDER = SKILL_REGISTRY.skills.map((entry) => entry.id)

const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-skill-senior-'))
const RUN_ID = `${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}-${process.pid}`
const DEFAULT_OUTPUT_DIR = path.join(ROOT, 'evidence', 'skill-readiness')

function parseArgs(argv) {
  const args = { outputDir: DEFAULT_OUTPUT_DIR, strictLive: false }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--strict-live') {
      args.strictLive = true
    } else if (value === '--output-dir') {
      args.outputDir = path.resolve(argv[index + 1] || DEFAULT_OUTPUT_DIR)
      index += 1
    } else if (value === '--help' || value === '-h') {
      console.log('Usage: node scripts/skill-readiness-suite.mjs [--strict-live] [--output-dir <dir>]')
      process.exit(0)
    } else {
      throw new Error(`Unknown argument: ${value}`)
    }
  }
  return args
}

const OPTIONS = parseArgs(process.argv.slice(2))

function safeEnv(overrides = {}, remove = []) {
  const env = { ...process.env }
  for (const key of remove) delete env[key]
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined || value === null) delete env[key]
    else env[key] = String(value)
  }
  return env
}

function redact(value) {
  return String(value || '')
    .replace(/(Bearer\s+)[^\s"']+/gi, '$1<redacted>')
    .replace(/((?:api[_-]?key|token|secret|password|authorization)["'=: ]+)[^\s,"']+/gi, '$1<redacted>')
    .replace(/(PLANE_API_KEY(?:_[A-Z0-9_]+)?=)[^\s]+/g, '$1<redacted>')
}

function compactOutput(value, maxLines = 12) {
  const lines = redact(value).split(/\r?\n/).map(line => line.trimEnd()).filter(Boolean)
  if (lines.length <= maxLines) return lines.join('\n')
  const headCount = Math.max(3, Math.floor(maxLines / 2))
  const tailCount = Math.max(2, maxLines - headCount - 1)
  return [...lines.slice(0, headCount), `… ${lines.length - headCount - tailCount} lines omitted …`, ...lines.slice(-tailCount)].join('\n')
}

function runCommand(command, args = [], options = {}) {
  const started = Date.now()
  const result = spawnSync(command, args, {
    cwd: options.cwd || ROOT,
    env: options.env || safeEnv(),
    encoding: 'utf8',
    timeout: options.timeout || 120000,
    maxBuffer: options.maxBuffer || 24 * 1024 * 1024,
    input: options.input,
  })
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n')
  return {
    command: [command, ...args].join(' '),
    code: result.error ? (result.error.code || 'SPAWN_ERROR') : result.status,
    signal: result.signal || null,
    elapsedMs: Date.now() - started,
    output: compactOutput(output),
    rawOutput: redact(output),
    error: result.error ? redact(result.error.message) : null,
  }
}

function fileExists(relativePath) {
  return fs.existsSync(path.resolve(ROOT, relativePath))
}

function readText(relativePath) {
  return fs.readFileSync(path.resolve(ROOT, relativePath), 'utf8')
}

function skillPath(skillId, ...segments) {
  const root = skillRepoPath(skillId, ROOT)
  if (!root) throw new Error(`Unknown skill registry ID: ${skillId}`)
  return path.join(root, ...segments)
}

function skillRelativePath(skillId, ...segments) {
  return path.relative(ROOT, skillPath(skillId, ...segments))
}

function readSkillText(skillId, ...segments) {
  return fs.readFileSync(skillPath(skillId, ...segments), 'utf8')
}

function addCheck(skill, name, status, detail, command = null) {
  skill.checks.push({ name, status, detail: redact(detail), command })
  if (status === 'FAIL') skill.failures += 1
}

function addIntegration(skill, status, detail) {
  skill.integration = { status, detail: redact(detail) }
}

function parseSkillFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---(?:\n|$)/)
  if (!match) return null
  const frontmatter = {}
  for (const line of match[1].split('\n')) {
    const field = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (field) frontmatter[field[1]] = field[2].trim().replace(/^['"]|['"]$/g, '')
  }
  return { values: frontmatter, body: content.slice(match[0].length) }
}

function linkedLocalPaths(skillPath, content) {
  const links = []
  const linkPattern = /\]\(\s*<?([^)>\s]+)>?/g
  let match
  while ((match = linkPattern.exec(content))) {
    const target = match[1].replace(/^`|`$/g, '').split('#')[0].split('?')[0]
    if (!target || target.startsWith('#') || /^[a-z]+:\/\//i.test(target)) continue
    const resolved = path.resolve(skillPath, target)
    links.push({ target, resolved })
  }
  return links
}

function staticContract(skill) {
  const skillPath = skillRepoPath(skill.name, ROOT)
  const skillMdPath = path.join(skillPath, 'SKILL.md')
  const errors = []
  if (!fs.existsSync(skillMdPath)) {
    errors.push('SKILL.md is missing')
  } else {
    const content = fs.readFileSync(skillMdPath, 'utf8')
    const parsed = parseSkillFrontmatter(content)
    if (!parsed) errors.push('SKILL.md has no valid YAML frontmatter')
    else {
      if (parsed.values.name !== skill.name) errors.push(`frontmatter name must be ${skill.name}`)
      if (!parsed.values.description || parsed.values.description.length < 40) errors.push('description is missing or too short')
      if (!/Trigger/i.test(parsed.values.description || '')) errors.push('description must declare trigger behavior')
      if (parsed.body.split('\n').length > 500) errors.push('SKILL.md body exceeds the 500-line progressive-disclosure limit')
      if (!/(hard\s+gate|source boundary|core principle|authentication boundaries|safety|do not claim)/i.test(parsed.body)) errors.push('safety/gate contract is missing')
      if (!/(workflow|tool routing|routing|quick start|common commands|execution workflow|process|runtime doctor|execute|generate)/i.test(parsed.body)) errors.push('operational workflow or routing section is missing')
      if (!/(evidence|report|output)/i.test(parsed.body)) errors.push('evidence/report/output contract is missing')
      for (const { target, resolved } of linkedLocalPaths(skillPath, content)) {
        if (!fs.existsSync(resolved)) errors.push(`broken local link: ${target}`)
      }
    }
  }
  if (!fs.existsSync(path.join(skillPath, 'agents', 'openai.yaml'))) errors.push('agents/openai.yaml is missing')
  addCheck(skill, 'skill contract and linked resources', errors.length ? 'FAIL' : 'PASS', errors.length ? errors.join('; ') : 'frontmatter, progressive disclosure, hard gates, routing and local references are valid')
}

function commandPass(skill, name, result, detail = '') {
  if (result.code === 0) {
    addCheck(skill, name, 'PASS', `${detail}${detail ? '; ' : ''}exit=0 in ${result.elapsedMs}ms`, result.command)
    return true
  }
  addCheck(skill, name, 'FAIL', `${detail}${detail ? '; ' : ''}exit=${result.code}\n${result.output || result.error || 'no output'}`, result.command)
  return false
}

function expectedBlocked(skill, name, result, patterns, detail) {
  const haystack = `${result.output}\n${result.rawOutput}`
  const matched = patterns.some(pattern => pattern.test(haystack))
  if (matched && [0, 1, 2, 3, 4, 5].includes(result.code)) {
    addCheck(skill, name, 'PASS', `${detail}; fail-closed doctor response observed\n${result.output}`, result.command)
    return true
  }
  addCheck(skill, name, 'FAIL', `expected a typed blocked response, got exit=${result.code}\n${result.output || result.error || 'no output'}`, result.command)
  return false
}

function parseJsonOutput(result) {
  const text = result.rawOutput.trim()
  try { return JSON.parse(text) } catch {}
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try { return JSON.parse(lines[index]) } catch {}
  }
  return null
}

function runPythonUnitTests(skill, skillId, relativeDirectory = 'tests') {
  const directory = skillPath(skillId, relativeDirectory)
  const result = runCommand('python3', ['-m', 'unittest', 'discover', '-s', directory, '-p', 'test_*.py'], { timeout: 180000 })
  return commandPass(skill, 'deterministic Python tests', result, 'unit/fixture suite')
}

function runNodeTestFiles(skill, directories, cwd = TMP_ROOT, timeout = 240000) {
  const files = directories.flatMap(directory => fs.readdirSync(directory)
    .filter(name => name.endsWith('.spec.mjs'))
    .sort()
    .map(name => path.join(directory, name)))
  const result = runCommand(process.execPath, ['--test', ...files], { cwd, timeout })
  return commandPass(skill, 'deterministic Node test suite', result, `${files.length} spec files`)
}

function accessibilityChecks(skill) {
  const asset = readSkillText('hybrid-accessibility', 'assets', 'axe-playwright.spec.ts')
  const matrix = readSkillText('hybrid-accessibility', 'references', 'MANUAL_MATRIX.md')
  const errors = []
  if (!asset.includes('@axe-core/playwright') || !asset.includes('wcag22aa')) errors.push('axe template does not pin WCAG 2.2 tags')
  if (!asset.includes('test.skip(!targetUrl')) errors.push('target URL safety gate is missing')
  for (const term of ['Keyboard', 'Focus', 'Screen reader', 'incomplete', 'Evidence rules']) if (!matrix.includes(term)) errors.push(`manual matrix is missing ${term}`)
  addCheck(skill, 'axe and manual WCAG contract', errors.length ? 'FAIL' : 'PASS', errors.length ? errors.join('; ') : 'WCAG 2.2 automated template and manual evidence matrix are present')
  addIntegration(skill, 'BLOCKED', 'no authorized application URL, authenticated journey, browser session or named screen reader was supplied; the suite will not invent a live target')
}

function aiChecks(skill) {
  runPythonUnitTests(skill, 'dynamic-ai-evaluation')
  addIntegration(skill, 'BLOCKED', 'no live model/provider, approved golden dataset execution context or cost/latency budget was supplied; local evaluator and golden fixture were tested')
}

function apiChecks(skill) {
  const fixtureDir = path.join(TMP_ROOT, 'api-contract')
  fs.mkdirSync(fixtureDir, { recursive: true })
  const valid = {
    openapi: '3.0.3',
    info: { title: 'Readiness fixture', version: '1.0.0' },
    paths: {
      '/users/{id}': {
        get: {
          operationId: 'getUser',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'ok' } },
        },
      },
    },
  }
  const invalid = {
    openapi: '3.0.3',
    info: { title: 'Invalid readiness fixture', version: '1.0.0' },
    paths: { '/users/{id}': { get: { operationId: 'bad', responses: { '200': { '$ref': '#/components/responses/Missing' } } } } },
  }
  const validPath = path.join(fixtureDir, 'valid.json')
  const invalidPath = path.join(fixtureDir, 'invalid.json')
  fs.writeFileSync(validPath, `${JSON.stringify(valid, null, 2)}\n`)
  fs.writeFileSync(invalidPath, `${JSON.stringify(invalid, null, 2)}\n`)
  const script = skillPath('hybrid-api-contract', 'scripts', 'check_openapi.py')
  const validRun = runCommand('python3', [script, validPath])
  const validReport = parseJsonOutput(validRun)
  const validOk = validRun.code === 0 && validReport?.passed === true && validReport.operation_count === 1
  addCheck(skill, 'OpenAPI valid fixture', validOk ? 'PASS' : 'FAIL', validOk ? 'valid contract parsed with one operation' : `unexpected result\n${validRun.output}`, validRun.command)
  const invalidRun = runCommand('python3', [script, invalidPath])
  const invalidReport = parseJsonOutput(invalidRun)
  const invalidOk = invalidRun.code === 1 && invalidReport?.passed === false && Array.isArray(invalidReport.errors) && invalidReport.errors.length > 0
  addCheck(skill, 'OpenAPI negative fixture', invalidOk ? 'PASS' : 'FAIL', invalidOk ? 'invalid contract is rejected with structured errors' : `unexpected result\n${invalidRun.output}`, invalidRun.command)
  addIntegration(skill, 'BLOCKED', 'no live implementation, deployed OpenAPI target, GraphQL schema, proto or webhook endpoint was supplied; only structural contract preflight is authorized locally')
}

function businessChecks(skill) {
  const outputDir = path.join(TMP_ROOT, 'static-requirements-analysis')
  const result = runCommand('bash', [skillPath('static-requirements-analysis', 'scripts', 'generate.sh'), skillPath('static-requirements-analysis', 'examples', 'sample-analysis.json'), outputDir, 'readiness'], { timeout: 180000 })
  const expected = [
    'readiness_Business_Flow.xmind',
    'readiness_Q&A.md',
    'readiness_Q&A.xlsx',
    path.join('.static-testing', 'requirements-analysis', 'readiness_Requirements.json'),
  ]
  const missing = expected.filter(file => !fs.existsSync(path.join(outputDir, file)))
  const ok = result.code === 0 && missing.length === 0
  addCheck(skill, 'business analysis synchronized artifacts', ok ? 'PASS' : 'FAIL', ok ? 'Markdown, Excel, XMind and exported requirement registry generated and read-backed' : `generation failed or missing: ${missing.join(', ')}\n${result.output}`, result.command)
  if (ok) {
    const registry = JSON.parse(fs.readFileSync(path.join(outputDir, '.static-testing', 'requirements-analysis', 'readiness_Requirements.json'), 'utf8'))
    const source = JSON.parse(readSkillText('static-requirements-analysis', 'examples', 'sample-analysis.json'))
    const expectedIds = source.requirements.map(item => item.id)
    const actualIds = registry.requirements.map(item => item.id)
    const idsOk = JSON.stringify(expectedIds) === JSON.stringify(actualIds)
    addCheck(skill, 'requirement registry ID read-back', idsOk ? 'PASS' : 'FAIL', idsOk ? `${actualIds.length} stable requirement IDs preserved` : `source IDs and exported IDs differ: ${expectedIds.join(',')} != ${actualIds.join(',')}`)
  }
  addIntegration(skill, 'N/A', 'business analysis has a deterministic local artifact contract; remote Drive/source-document access is exercised by integration-google-drive when a real source is supplied')
}

function dataChecks(skill) {
  runPythonUnitTests(skill, 'dynamic-data-quality')
  addIntegration(skill, 'BLOCKED', 'no database/MCP target was supplied; SQLite fixture passed and Docker/Postgres were intentionally excluded from this local run')
}

function docChecks(skill) {
  const converter = skillPath('support-document-conversion', 'scripts', 'convert.sh')
  const noInput = runCommand('bash', [converter])
  const noInputOk = noInput.code === 1 && /Usage:/.test(noInput.output)
  addCheck(skill, 'converter no-input guard', noInputOk ? 'PASS' : 'FAIL', noInputOk ? 'missing input returns usage instead of an unbound-variable crash' : `unexpected exit/output\n${noInput.output}`, noInput.command)
  const source = path.join(TMP_ROOT, 'source.html')
  const target = path.join(TMP_ROOT, 'converted.md')
  fs.writeFileSync(source, '<!doctype html><html><head><title>Readiness</title></head><body><h1>Local fixture</h1><p>Converted safely</p></body></html>\n')
  const conversion = runCommand('bash', [converter, source, target], {
    env: safeEnv({ QA_PRESERVE_EXACT_FILENAME: '1', QA_ARTIFACT_DATE: '01-08-2026' }),
    timeout: 180000,
  })
  const converted = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : ''
  const conversionOk = conversion.code === 0 && /Local fixture/.test(converted) && /Converted safely/.test(converted)
  addCheck(skill, 'HTML to Markdown local conversion', conversionOk ? 'PASS' : 'FAIL', conversionOk ? `converted fixture to ${target}` : `conversion failed\n${conversion.output}`, conversion.command)
  addIntegration(skill, 'N/A', 'support-document-conversion is a local converter; no remote document source was authorized')
}

function egoChecks(skill) {
  const detect = runCommand(process.execPath, [skillPath('adapter-browser-session', 'scripts', 'detect.mjs'), '--json'], {
    env: safeEnv({ npm_config_offline: 'true' }),
    timeout: 30000,
  })
  const report = parseJsonOutput(detect)
  const detectOk = report && typeof report.available === 'boolean' && typeof report.exitCode === 'number' && report.exitCode === detect.code
  addCheck(skill, 'adapter-browser-session detection contract', detectOk ? 'PASS' : 'FAIL', detectOk ? `typed detection returned ${report.available ? 'available' : 'unavailable'} without installation or external action` : `invalid detection response\n${detect.output}`, detect.command)
  if (detectOk && report.available) {
    const smoke = runCommand(process.execPath, [skillPath('adapter-browser-session', 'scripts', 'smoke-test.mjs'), '--json'], { env: safeEnv({ npm_config_offline: 'true' }), timeout: 90000 })
    const smokeReport = parseJsonOutput(smoke)
    const smokeOk = smoke.code === 0 && smokeReport?.passed === true && smokeReport.networkBody === false
    addCheck(skill, 'adapter-browser-session safe about:blank smoke', smokeOk ? 'PASS' : 'FAIL', smokeOk ? 'navigation, snapshot, screenshot and interaction passed with reduced network-body confidence' : `smoke failed\n${smoke.output}`, smoke.command)
    addIntegration(skill, 'PASS', 'adapter-browser-session is installed and its safe no-network smoke passed; real login-state work still requires a user-approved target')
  } else {
    addIntegration(skill, 'BLOCKED', `adapter-browser-session is not ready: ${report?.reason || 'typed detection unavailable'}; use the documented Playwright/Chrome DevTools fallback`)
  }
}

function githubChecks(skill) {
  const result = runCommand('bash', [skillPath('integration-github', 'scripts', 'doctor-codex.sh')], { timeout: 30000 })
  const ok = expectedBlocked(skill, 'GitHub MCP doctor', result, [/mcp_not_configured/i, /runtime_missing/i, /PASS GitHub MCP/i, /FAILED/i], 'doctor completed without exposing credentials')
  if (ok && /PASS GitHub MCP/i.test(result.output)) addIntegration(skill, 'BLOCKED', 'configuration exists but the doctor explicitly requires a new-host read-only auth smoke before integration can be certified')
  else addIntegration(skill, 'BLOCKED', 'GitHub MCP is not configured/authenticated in this local session; no repository mutation was attempted')
}

function driveChecks(skill) {
  const client = path.join(TMP_ROOT, 'missing-drive-client.json')
  const token = path.join(TMP_ROOT, 'missing-drive-token.json')
  const result = runCommand('python3', [skillPath('integration-google-drive', 'scripts', 'drive_auth_doctor.py')], {
    env: safeEnv({ DRIVE_OAUTH_CLIENT: client, DRIVE_OAUTH_TOKEN: token }),
    timeout: 30000,
  })
  const ok = result.code === 2 && /DRIVE AUTH NOT READY/i.test(result.output)
  addCheck(skill, 'Google Drive auth doctor', ok ? 'PASS' : 'FAIL', ok ? 'missing local credential is classified without browser/network/write side effects' : `unexpected doctor response\n${result.output}`, result.command)
  addIntegration(skill, 'BLOCKED', 'Google Drive OAuth/MCP is not configured for this local run; no Drive file was read or mutated')
}

function mobileChecks(skill) {
  const gate = runCommand('bash', [skillPath('dynamic-mobile', 'scripts', 'check-device-target.sh')], {
    env: safeEnv({ EXECUTION_TARGET: undefined, ANDROID_UDID: undefined, IOS_SIMULATOR_UDID: undefined }),
    timeout: 30000,
  })
  expectedBlocked(skill, 'mobile execution-target safety gate', gate, [/BLOCKED/i, /required/i, /unsupported/i], 'missing target fails closed before device interaction')
  const doctor = runCommand('bash', [skillPath('dynamic-mobile', 'scripts', 'mobile-doctor.sh'), '--all'], { timeout: 60000 })
  const doctorText = `${doctor.output}\n${doctor.rawOutput}`
  const doctorOk = [0, 1, 2].includes(doctor.code) && /(INFO|PASS|WARN|FAIL|BLOCKED)/i.test(doctorText)
  addCheck(skill, 'mobile runtime doctor', doctorOk ? 'PASS' : 'FAIL', doctorOk ? `doctor returned typed capability output with exit=${doctor.code}` : `doctor crashed or returned untyped output\n${doctor.output}`, doctor.command)
  addIntegration(skill, 'BLOCKED', 'no approved Android/iOS device matrix, Appium MCP session or authorized proxy capture target is available')
}

function pentestChecks(skill) {
  const contractFiles = [
    skillPath('dynamic-security-pentest', 'references', 'ENGAGEMENT_CONTRACT.md'),
    skillPath('dynamic-security-pentest', 'references', 'FINDING_FORMAT.md'),
    skillPath('dynamic-security-pentest', 'references', 'TOOL_ROUTING.md'),
  ]
  const missing = contractFiles.filter(file => !fs.existsSync(file))
  addCheck(skill, 'engagement and finding contract resources', missing.length ? 'FAIL' : 'PASS', missing.length ? `missing ${missing.join(', ')}` : 'scope, evidence and routing references are present')
  const doctor = runCommand('bash', [skillPath('dynamic-security-pentest', 'scripts', 'doctor.sh')], { timeout: 60000 })
  commandPass(skill, 'security tool doctor', doctor, 'passive executable/source availability check')
  const testDirectory = skillPath('dynamic-security-pentest', 'skills', 'pentest-security', 'tests')
  const testFiles = fs.readdirSync(testDirectory).filter(name => name.endsWith('.spec.mjs')).sort().map(name => path.join(testDirectory, name))
  const securityTests = runCommand(process.execPath, ['--test', ...testFiles], { cwd: TMP_ROOT, timeout: 180000 })
  commandPass(skill, 'Codex Security-compatible local host tests', securityTests, `${testFiles.length} local security spec files`)
  addIntegration(skill, 'BLOCKED', 'no .pentest/engagement.md with target, authorization, exclusions and rate limit was supplied; no network request or exploit validation was attempted')
}

function performanceChecks(skill) {
  runPythonUnitTests(skill, 'dynamic-performance')
  addIntegration(skill, 'BLOCKED', 'local prepare/smoke contracts passed, but no approved target, workload contract, stop condition or engine authorization was supplied; no load was started')
}

function uiUxChecks(skill) {
  runPythonUnitTests(skill, 'hybrid-ui-ux-review')
  addIntegration(skill, 'BLOCKED', 'no approved design source, SJK screen target or same-session browser run was supplied; local state/evidence contract passed without inventing a visual PASS')
}

function releaseGovernanceChecks(skill) {
  runPythonUnitTests(skill, 'governance-release-quality')
  addIntegration(skill, 'BLOCKED', 'no real release packet, CI run, named release owner or tracker mutation scope was supplied; local gate evaluator passed its valid and negative fixtures')
}

function appsecSupplyChainChecks(skill) {
  runPythonUnitTests(skill, 'static-supply-chain-security')
  const scan = runCommand('python3', [skillPath('static-supply-chain-security', 'scripts', 'check_supply_chain.py'), '--repo', ROOT], { timeout: 180000 })
  commandPass(skill, 'redacted repository supply-chain preflight', scan, 'local manifest and secret scan; no registry/network lookup')
  addIntegration(skill, 'BLOCKED', 'no CI SAST/SCA provider, vulnerability database, SBOM signer or approved remote repository was supplied; local scan never printed credential values')
}

function reliabilityResilienceChecks(skill) {
  runPythonUnitTests(skill, 'dynamic-resilience')
  addIntegration(skill, 'BLOCKED', 'no approved staging target, owner approval, fault-injection scope or recovery run was supplied; only read-only plan validation ran')
}

function compatibilityLocalizationChecks(skill) {
  runPythonUnitTests(skill, 'dynamic-compatibility')
  addIntegration(skill, 'BLOCKED', 'no SJK URL, browser/device farm, supported-platform source or executed locale evidence was supplied; only the local matrix contract ran')
}

function planeChecks(skill) {
  const remove = Object.keys(process.env).filter(key => key === 'PLANE_API_KEY' || key.startsWith('PLANE_API_KEY_'))
  const doctor = runCommand('bash', [skillPath('integration-plane', 'scripts', 'doctor.sh')], {
    env: safeEnv({ PLANE_WORKSPACE_SLUG: 'senior-readiness-fixture', PLANE_BASE_URL: 'http://127.0.0.1' }, remove),
    timeout: 30000,
  })
  expectedBlocked(
    skill,
    'Plane auth doctor',
    doctor,
    [/PLANE AUTH OK/i, /PLANE AUTH FAIL/i, /PLANE CONFIG FAIL/i, /PLANE CONNECTIVITY FAIL/i],
    'Plane doctor returned a typed read-only auth result before any write',
  )
  addIntegration(skill, 'BLOCKED', 'Plane workspace/API key is not configured in this local run; no ticket/comment/state mutation was attempted')
}

function pomChecks(skill) {
  const templateRoot = skillPath('dynamic-web-automation', 'assets', 'templates')
  const required = ['pages/base.page.ts', 'pages/example.page.ts', 'selectors/index.ts', 'tests/ui/example.ui.spec.ts', 'tests/api/example.api.spec.ts', 'tests/functional/example.functional.spec.ts', 'quality-gates.json', 'scripts/quality-gate.mjs', 'scripts/generate-pom-plan.mjs', 'scripts/verify-testcase-traceability.mjs']
  const missing = required.filter(file => !fs.existsSync(path.join(templateRoot, file)))
  const specFiles = []
  function collect(directory) {
    if (!fs.existsSync(directory)) return
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const item = path.join(directory, entry.name)
      if (entry.isDirectory()) collect(item)
      else if (entry.name.endsWith('.spec.ts')) specFiles.push(item)
    }
  }
  collect(path.join(templateRoot, 'tests'))
  const rawLocatorInSpecs = specFiles.filter(file => /page\.(?:locator|getByTestId|getByRole|getByLabel|getByPlaceholder|getByText)\s*\(/.test(fs.readFileSync(file, 'utf8')))
  const tags = specFiles.every(file => /@(ui|api|functional|perf)/.test(fs.readFileSync(file, 'utf8')))
  const structureOk = missing.length === 0 && rawLocatorInSpecs.length === 0 && tags
  addCheck(skill, 'POM/selectors/tags template contract', structureOk ? 'PASS' : 'FAIL', structureOk ? 'selectors are outside specs, required Page Objects exist and specs carry execution tags' : `missing=${missing.join(',')}; raw locators in specs=${rawLocatorInSpecs.join(',')}; tags=${tags}`)
  const tsc = runCommand('npx', ['--no-install', 'tsc', '--noEmit', '-p', path.join(templateRoot, 'tsconfig.json')], { cwd: skillPath('dynamic-web-automation'), env: safeEnv({ npm_config_offline: 'true' }), timeout: 90000 })
  commandPass(skill, 'POM template TypeScript compile', tsc, 'template-only compile')
  const qualityGate = runCommand(process.execPath, [path.join(templateRoot, 'scripts/quality-gate.mjs'), '--config', path.join(templateRoot, 'quality-gates.json'), '--report', path.join(templateRoot, 'reports/playwright.sample.json'), '--output', path.join(TMP_ROOT, 'quality-gate.json')], { cwd: ROOT, timeout: 30000 })
  commandPass(skill, 'automation quality gate fixture', qualityGate, 'failed/flaky/evidence/duration/coverage gate fixture')
  runNodeTestFiles(skill, [skillPath('dynamic-web-automation', 'tests')], ROOT)
  addIntegration(skill, 'BLOCKED', 'no application URL, test account or approved browser target was supplied; template compilation is not a live UI certification')
}

function integrationPostmanChecks(skill) {
  runPythonUnitTests(skill, 'integration-postman')
  const doctor = runCommand('python3', [skillPath('integration-postman', 'scripts', 'runner.py'), 'doctor'], { timeout: 60000 })
  const doctorText = `${doctor.output}\n${doctor.rawOutput}`
  const typed = [0, 1].includes(doctor.code) && /(PASS|MISSING|BLOCKED|NOTICE)/i.test(doctorText)
  addCheck(skill, 'Postman runtime doctor', typed ? 'PASS' : 'FAIL', typed ? `official CLI/Newman availability is classified with exit=${doctor.code}` : `untyped doctor response\n${doctor.output}`, doctor.command)
  addIntegration(skill, 'BLOCKED', 'Postman MCP/OAuth or a live collection account is not configured; local runner unit tests passed and no collection was executed')
}

function qaRunChecks(skill) {
  const text = readSkillText('dynamic-web-exploratory', 'SKILL.md')
  const required = ['DISCOVERY_CORE', 'UI/UX', 'BROWSER_OBSERVABILITY', 'Network', 'Console', 'Page Error', 'same session']
  const missing = required.filter(term => !text.includes(term))
  addCheck(skill, 'browser QA and UI/UX branch contract', missing.length ? 'FAIL' : 'PASS', missing.length ? `missing ${missing.join(', ')}` : 'Scoped Business Discovery, Exploratory, Ad-hoc, UI/UX and same-session observability are explicit')
  const qaDirectories = [
    skillPath('dynamic-web-exploratory', 'tests', 'unit'),
    skillPath('dynamic-web-exploratory', 'tests', 'integration'),
    skillPath('dynamic-web-exploratory', 'tests', 'e2e'),
  ]
  runNodeTestFiles(skill, qaDirectories, TMP_ROOT, 300000)
  const gate = runCommand(process.execPath, [skillPath('dynamic-web-exploratory', 'tests', 'business-context-gate.spec.mjs')], { cwd: TMP_ROOT, timeout: 120000 })
  commandPass(skill, 'business context gate', gate, 'READY/NEEDS_DISCOVERY/BLOCKED contract')
  addIntegration(skill, 'BLOCKED', 'no live SJK/app target and same-session browser observer were supplied for this run; the local fixture suite includes UI reconciliation, visual regression and runtime mismatch detection')
}

function testcaseChecks(skill) {
  runPythonUnitTests(skill, 'support-testcase-authoring')
  const output = path.join(TMP_ROOT, 'testcases', 'readiness.xlsx')
  fs.mkdirSync(path.dirname(output), { recursive: true })
  const generator = runCommand('python3', [skillPath('support-testcase-authoring', 'scripts', 'gen-testcases.py'), skillPath('support-testcase-authoring', 'examples', 'sample-input.json'), output], {
    env: safeEnv({ QA_PRESERVE_EXACT_FILENAME: '1', QA_ARTIFACT_DATE: '01-08-2026' }),
    timeout: 180000,
  })
  const markdown = output.replace(/\.xlsx$/, '.md')
  const manifest = output.replace(/\.xlsx$/, '.automation.json')
  let manifestOk = false
  if (fs.existsSync(manifest) && fs.existsSync(markdown)) {
    try {
      const parsedManifest = JSON.parse(fs.readFileSync(manifest, 'utf8'))
      const markdownHash = crypto.createHash('sha256').update(fs.readFileSync(markdown)).digest('hex')
      manifestOk = parsedManifest?.source?.markdown_sha256 === markdownHash
        && parsedManifest?.source?.testcase_count === parsedManifest?.testcases?.length
    } catch {
      manifestOk = false
    }
  }
  const generatedOk = generator.code === 0
    && fs.existsSync(output)
    && fs.existsSync(markdown)
    && /# Testcases/.test(fs.readFileSync(markdown, 'utf8'))
    && manifestOk
  addCheck(skill, 'Markdown-first testcase generation', generatedOk ? 'PASS' : 'FAIL', generatedOk ? 'Markdown, lossless automation manifest and Excel are generated from the same sample source' : `generation failed or manifest/hash mismatch\n${generator.output}`, generator.command)
  const apiSource = path.join(TMP_ROOT, 'testcases', 'readiness-openapi.json')
  fs.writeFileSync(apiSource, `${JSON.stringify({
    openapi: '3.0.3',
    info: { title: 'Readiness API', version: '1.0.0' },
    paths: { '/health': { get: { operationId: 'health', responses: { '200': { description: 'ok' } } } } },
  }, null, 2)}\n`)
  const apiOutput = path.join(TMP_ROOT, 'testcases', 'api.json')
  const importer = runCommand('python3', [skillPath('support-testcase-authoring', 'scripts', 'import-api-spec.py'), apiSource, apiOutput, '--project-code', 'API', '--project-name', 'Readiness API'], { timeout: 120000 })
  const apiOk = importer.code === 0 && fs.existsSync(apiOutput)
  addCheck(skill, 'API testcase import contract', apiOk ? 'PASS' : 'FAIL', apiOk ? 'safe placeholder-preserving API input imported' : `import failed\n${importer.output}`, importer.command)
  addIntegration(skill, 'N/A', 'support-testcase-authoring is local artifact generation; Plane/Drive write-back is routed to their integration skills only when explicitly requested')
}

function whiteboxChecks(skill) {
  const result = runCommand('npm', ['test', '--prefix', skillPath('hybrid-source-coverage')], { timeout: 240000 })
  commandPass(skill, 'white-box Vitest suite', result, 'source-derived path/graph/test/coverage contract')
  addIntegration(skill, 'N/A', 'whitebox executes supplied local source and fixtures; measured coverage claims remain tied to the executed fixture run')
}

function mappingContractCheck() {
  const required = [
    skillRelativePath('static-requirements-analysis', 'scripts', 'export-requirements.py'),
    skillRelativePath('dynamic-web-exploratory', 'scripts', 'orchestrators', 'ui-business-reconciliation.mjs'),
    skillRelativePath('dynamic-web-exploratory', 'references', 'UI_REQUIREMENT_TRACEABILITY_SCHEMA.json'),
    skillRelativePath('dynamic-web-exploratory', 'tests', 'integration', 'ui-conflict-app.spec.mjs'),
  ]
  const missing = required.filter(file => !fileExists(file))
  const business = readSkillText('static-requirements-analysis', 'SKILL.md')
  const qa = readSkillText('dynamic-web-exploratory', 'SKILL.md')
  const termsOk = /requirement registry|UI.*mapping|traceability/i.test(business) && /UI_BUSINESS_RECONCILIATION|UI.*requirement|traceability/i.test(qa)
  return {
    status: missing.length || !termsOk ? 'FAIL' : 'PASS',
    detail: missing.length ? `missing ${missing.join(', ')}` : termsOk ? 'BA requirement registry, UI reconciliation, traceability schema and runtime conflict fixture are mapped' : 'skill routing text does not expose BA → browser mapping',
  }
}

function createSkill(name) {
  const entry = SKILL_REGISTRY.skills.find((item) => item.id === name)
  return { name, repoPath: entry?.path, checks: [], failures: 0, integration: { status: 'BLOCKED', detail: 'not evaluated' } }
}

function evaluateSkill(skill) {
  staticContract(skill)
  switch (skill.name) {
    case 'hybrid-accessibility': accessibilityChecks(skill); break
    case 'dynamic-ai-evaluation': aiChecks(skill); break
    case 'hybrid-api-contract': apiChecks(skill); break
    case 'static-supply-chain-security': appsecSupplyChainChecks(skill); break
    case 'static-requirements-analysis': businessChecks(skill); break
    case 'dynamic-compatibility': compatibilityLocalizationChecks(skill); break
    case 'dynamic-data-quality': dataChecks(skill); break
    case 'support-document-conversion': docChecks(skill); break
    case 'adapter-browser-session': egoChecks(skill); break
    case 'integration-github': githubChecks(skill); break
    case 'integration-google-drive': driveChecks(skill); break
    case 'dynamic-mobile': mobileChecks(skill); break
    case 'dynamic-security-pentest': pentestChecks(skill); break
    case 'dynamic-performance': performanceChecks(skill); break
    case 'integration-plane': planeChecks(skill); break
    case 'dynamic-web-automation': pomChecks(skill); break
    case 'integration-postman': integrationPostmanChecks(skill); break
    case 'dynamic-web-exploratory': qaRunChecks(skill); break
    case 'governance-release-quality': releaseGovernanceChecks(skill); break
    case 'dynamic-resilience': reliabilityResilienceChecks(skill); break
    case 'support-testcase-authoring': testcaseChecks(skill); break
    case 'hybrid-ui-ux-review': uiUxChecks(skill); break
    case 'hybrid-source-coverage': whiteboxChecks(skill); break
    default: throw new Error(`No readiness adapter for ${skill.name}`)
  }
  const localFail = skill.failures > 0
  const localBlocked = skill.checks.some(check => check.status === 'BLOCKED')
  skill.localStatus = localFail ? 'FAIL' : localBlocked ? 'PARTIAL' : 'PASS'
  skill.status = localFail ? 'FAIL' : skill.integration.status === 'BLOCKED' ? 'PARTIAL' : 'PASS'
  return skill
}

function mdCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, '<br>')
}

function buildMarkdown(payload) {
  const { summary, skills, mapping, strictLive } = payload
  const lines = [
    '# QA-skill senior readiness report',
    '',
    `Run ID: \`${payload.runId}\``,
    `Generated: ${payload.generatedAt}`,
    '',
    '## Kết luận',
    '',
    `- Kết quả local: **${summary.localCertification}**`,
    `- Kết quả live integration: **${summary.liveCertification}**`,
    `- Chế độ chạy: local, read-only, không Docker, không Postgres, không load test`,
    `- Strict-live requested: **${strictLive ? 'yes' : 'no'}**`,
    '',
    `Local certification chỉ có nghĩa là contract, fixture và fail-closed doctor của ${skills.length} skill đã chạy qua. Nó không biến MCP, cloud, thiết bị, model hoặc live application chưa cấu hình thành PASS`,
    '',
    `## Tổng quan ${skills.length} skill`,
    '',
    '| # | Skill | Contract/runtime local | Live integration | Status |',
    '|---:|---|---|---|---|',
  ]
  skills.forEach((skill, index) => {
    lines.push(`| ${index + 1} | \`${skill.name}\` | ${skill.localStatus} | ${skill.integration.status} | **${skill.status}** |`)
  })
  lines.push('', '## Số liệu', '', `- ${skills.length}/${skills.length} skill được discover và có adapter`, `- ${summary.localPass}/${skills.length} skill đạt local contract/runtime`, `- ${summary.blockedIntegrations} live integration đang BLOCKED vì thiếu target, credential, device, MCP hoặc approval`, `- ${summary.failures} deterministic failure`, '', '## UI/UX và mapping BA → browser', '', `- Mapping contract: **${mapping.status}** — ${mapping.detail}`, '- dynamic-web-exploratory có riêng `DISCOVERY_CORE = Scoped Business Discovery + Exploratory + Ad-hoc + UI/UX`', '- hybrid-ui-ux-review có packet contract cho requirement, viewport, state và screenshot/video evidence', '- Browser observability yêu cầu Network + Console + Page Error trong cùng session', '- static-requirements-analysis export requirement IDs ổn định', '- ui-business-reconciliation đối chiếu UI snapshot/runtime với requirement registry và có fixture bắt conflict HTTP 500 nhưng UI hiển thị success', '- hybrid-accessibility có axe WCAG 2.2 template và manual matrix cho keyboard, focus, reflow, contrast, dynamic state và screen reader', '', '## Chi tiết evidence')
  for (const skill of skills) {
    lines.push('', `### ${skill.name}`, '', `Local status: **${skill.localStatus}**  `, `Integration: **${skill.integration.status}** — ${skill.integration.detail}`, '', '| Check | Status | Evidence |', '|---|---|---|')
    for (const check of skill.checks) lines.push(`| ${mdCell(check.name)} | ${check.status} | ${mdCell(check.detail)} |`)
  }
  lines.push('', '## Cổng chứng nhận senior', '', '| Gate | Result | Meaning |', '|---|---|---|', `| ${skills.length} public skills discoverable | ${skills.length === SKILL_ORDER.length ? 'PASS' : 'FAIL'} | canonical public skill list is complete |`, `| Local deterministic contracts | ${summary.failures === 0 ? 'PASS' : 'FAIL'} | no fixture/unit/compile/doctor contract failed |`, `| UI/UX branch is explicit | ${mapping.status} | requirement-to-browser mapping and UI/UX are tested paths |`, `| Live external integrations | ${summary.blockedIntegrations === 0 ? 'PASS' : 'BLOCKED'} | requires real credentials/targets and must be run separately |`, `| Strict senior live sign-off | ${summary.blockedIntegrations === 0 && summary.failures === 0 ? 'PASS' : 'BLOCKED'} | cannot be claimed while a live integration gate is blocked |`, '', '## Cách đọc kết quả', '', '- `PASS`: evidence đã chạy thành công trong phạm vi local', '- `BLOCKED`: safety/doctor đã fail-closed hoặc live input chưa được cấp; đây không phải là lỗi deterministic', '- `FAIL`: lỗi phải sửa trước khi gọi local readiness đạt chuẩn', '', 'File JSON companion được pretty-print với indent 2 để không còn hiện thành một dòng')
  return `${lines.join('\n')}\n`
}

function writeReports(payload) {
  fs.mkdirSync(OPTIONS.outputDir, { recursive: true })
  const json = `${JSON.stringify(payload, null, 2)}\n`
  const markdown = buildMarkdown(payload)
  const jsonPath = path.join(OPTIONS.outputDir, `skill-readiness-${RUN_ID}.json`)
  const markdownPath = path.join(OPTIONS.outputDir, `skill-readiness-${RUN_ID}.md`)
  const latestJsonPath = path.join(OPTIONS.outputDir, 'latest.json')
  const latestMarkdownPath = path.join(OPTIONS.outputDir, 'latest.md')
  for (const [file, content] of [[jsonPath, json], [markdownPath, markdown], [latestJsonPath, json], [latestMarkdownPath, markdown]]) fs.writeFileSync(file, content)
  return { jsonPath, markdownPath, latestJsonPath, latestMarkdownPath }
}

function printSummary(payload, reports) {
  console.log('\nQA-skill senior readiness')
  console.log('=========================')
  console.log(`Local certification: ${payload.summary.localCertification}`)
  console.log(`Live integration certification: ${payload.summary.liveCertification}`)
  console.log(`Skills: ${payload.summary.localPass}/${payload.skills.length} local pass | ${payload.summary.blockedIntegrations} live blocked | ${payload.summary.failures} failures`)
  console.log('')
  console.log('Skill                           Local       Integration  Status')
  console.log('------------------------------  ----------  -----------  ----------')
  for (const skill of payload.skills) console.log(`${skill.name.padEnd(30)}  ${skill.localStatus.padEnd(10)}  ${skill.integration.status.padEnd(11)}  ${skill.status}`)
  console.log('')
  console.log(`Readable report: ${reports.latestMarkdownPath}`)
  console.log(`Pretty JSON:     ${reports.latestJsonPath}`)
}

let payload
try {
  const skills = SKILL_ORDER.map(createSkill).map(evaluateSkill)
  const mapping = mappingContractCheck()
  const failures = skills.reduce((total, skill) => total + skill.failures, 0) + (mapping.status === 'FAIL' ? 1 : 0)
  const localPass = skills.filter(skill => skill.localStatus === 'PASS').length
  const blockedIntegrations = skills.filter(skill => skill.integration.status === 'BLOCKED').length
  payload = {
    schemaVersion: '1.0',
    runId: RUN_ID,
    generatedAt: new Date().toISOString(),
    scope: { skills: SKILL_ORDER, mode: 'local-read-only', excludes: ['Docker', 'Postgres', 'network targets', 'load tests', 'external mutations'] },
    strictLive: OPTIONS.strictLive,
    mapping,
    skills,
    summary: {
      localPass,
      failures,
      blockedIntegrations,
      localCertification: failures === 0 && localPass === skills.length ? 'PASS — SENIOR LOCAL CONTRACT' : 'FAIL',
      liveCertification: failures > 0 ? 'FAIL' : blockedIntegrations > 0 ? 'BLOCKED — LIVE INPUTS REQUIRED' : 'PASS — LIVE CONTRACTS OBSERVED',
    },
  }
  const reports = writeReports(payload)
  printSummary(payload, reports)
  if (failures > 0) process.exitCode = 1
  else if (OPTIONS.strictLive && blockedIntegrations > 0) process.exitCode = 2
} catch (error) {
  console.error(`skill-readiness-suite fatal: ${error.message}`)
  process.exitCode = 1
} finally {
  fs.rmSync(TMP_ROOT, { recursive: true, force: true })
}
