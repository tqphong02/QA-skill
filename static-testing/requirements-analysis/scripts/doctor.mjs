#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const SKILL_ROOT = path.dirname(SCRIPT_DIR)
const require = createRequire(import.meta.url)

function run(command, args) {
  const result = spawnSync(command, args, { cwd: SKILL_ROOT, encoding: 'utf8', windowsHide: true })
  return { command, args, ok: result.status === 0, status: result.status, error: result.error?.code || null }
}

const checks = []
const generatePath = path.join(SCRIPT_DIR, 'generate.sh')
checks.push({ name: 'generate_script', ok: fs.existsSync(generatePath), detail: generatePath })

let xmindmark = false
try {
  require.resolve('xmindmark', { paths: [SKILL_ROOT] })
  xmindmark = true
} catch {}
checks.push({ name: 'xmindmark', ok: xmindmark, detail: xmindmark ? 'resolved' : 'missing dependency' })

const bashCandidates = []
if (process.env.QA_SKILL_BASH) bashCandidates.push(process.env.QA_SKILL_BASH)
if (process.platform === 'win32') {
  bashCandidates.push(
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'bin', 'bash.exe'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'usr', 'bin', 'bash.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Git', 'bin', 'bash.exe'),
  )
}
bashCandidates.push('bash')
let bashRuntime = null
for (const candidate of bashCandidates) {
  if (path.isAbsolute(candidate) && !fs.existsSync(candidate)) continue
  const result = run(candidate, ['--version'])
  if (result.ok) {
    bashRuntime = candidate
    break
  }
}
checks.push({ name: 'bash', ok: Boolean(bashRuntime), detail: bashRuntime || 'no runnable Bash' })

const pythonCandidates = []
if (process.env.QA_SKILL_PYTHON) pythonCandidates.push([process.env.QA_SKILL_PYTHON, []])
pythonCandidates.push(['python3', []], ['python', []], ['py', ['-3']], ['py', ['-3.12']])
let python = null
for (const [command, prefix] of pythonCandidates) {
  const result = run(command, [...prefix, '-c', 'import openpyxl; print("ready")'])
  if (result.ok) {
    python = { command, prefix }
    break
  }
}
checks.push({ name: 'python_openpyxl', ok: Boolean(python), detail: python ? `${python.command} ${python.prefix.join(' ')}`.trim() : 'no runnable Python with openpyxl' })

const missing = checks.filter(item => !item.ok).map(item => item.name)
const payload = {
  status: missing.length ? 'runtime_missing' : 'PASS',
  skill: 'static-requirements-analysis',
  checks,
  missing,
}
console.log(JSON.stringify(payload, null, 2))
process.exitCode = missing.length ? 2 : 0
