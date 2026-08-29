import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SETUP = path.join(ROOT, 'scripts', 'setup.sh')
const TEMP_BASE = process.env.QA_SKILL_TEST_TMP
  ? path.resolve(process.env.QA_SKILL_TEST_TMP)
  : process.platform === 'win32'
    ? path.join(ROOT, '.tmp')
    : os.tmpdir()
fs.mkdirSync(TEMP_BASE, { recursive: true })

function makeTempRoot(prefix) {
  return fs.mkdtempSync(path.join(TEMP_BASE, prefix))
}

function resolveBash() {
  const candidates = process.platform === 'win32'
    ? [
        process.env.QA_SKILL_BASH,
        path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'bin', 'bash.exe'),
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Git', 'bin', 'bash.exe'),
      ]
    : [process.env.QA_SKILL_BASH, 'bash']

  for (const candidate of candidates) {
    if (!candidate) continue
    if (path.isAbsolute(candidate) && !fs.existsSync(candidate)) continue
    const probe = spawnSync(candidate, ['--version'], { encoding: 'utf8' })
    if (!probe.error && probe.status === 0) return candidate
  }
  throw new Error('Bash runtime not found')
}

const BASH = resolveBash()

function toBashPath(value) {
  if (process.platform !== 'win32') return value
  const normalized = path.resolve(value).replaceAll('\\', '/')
  const match = /^([A-Za-z]):\/(.*)$/.exec(normalized)
  return match ? `/${match[1].toLowerCase()}/${match[2]}` : normalized
}

test('single-skill setup migrates only its legacy alias and installs the canonical skill', () => {
  const tempRoot = makeTempRoot('qa-skill-migration-')
  const skillsDir = path.join(tempRoot, 'skills')
  fs.mkdirSync(path.join(skillsDir, 'qa-run'), { recursive: true })
  fs.mkdirSync(path.join(skillsDir, 'plane-qa'), { recursive: true })
  fs.writeFileSync(path.join(skillsDir, 'qa-run', 'SKILL.md'), 'legacy qa-run\n')
  fs.writeFileSync(path.join(skillsDir, 'plane-qa', 'SKILL.md'), 'legacy plane-qa\n')

  try {
    const result = spawnSync(BASH, [
      toBashPath(SETUP),
      '--agent=codex',
      '--profile=full',
      '--only=dynamic-web-exploratory',
      `--skills-dir=${toBashPath(skillsDir)}`,
      '--skip-deps',
      '--skip-mcp-setup',
      '--yes',
    ], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, NO_COLOR: '1' },
    })

    assert.equal(result.status, 0, result.stderr || result.stdout)
    assert.equal(fs.existsSync(path.join(skillsDir, 'qa-run')), false)
    assert.equal(fs.existsSync(path.join(skillsDir, 'plane-qa', 'SKILL.md')), true)
    assert.equal(
      fs.readFileSync(path.join(skillsDir, 'dynamic-web-exploratory', 'SKILL.md'), 'utf8'),
      fs.readFileSync(path.join(ROOT, 'dynamic-testing', 'web-exploratory', 'SKILL.md'), 'utf8'),
    )
    assert.equal(
      fs.readFileSync(path.join(skillsDir, 'dynamic-web-exploratory', 'scripts', 'qa-runs.mjs'), 'utf8'),
      fs.readFileSync(path.join(ROOT, 'scripts', 'qa-runs.mjs'), 'utf8'),
    )

    const backupRoot = path.join(tempRoot, 'qa-skill-backups')
    const legacyBackups = fs.readdirSync(backupRoot, { recursive: true })
      .map(value => String(value))
      .filter(value => value.includes('qa-run-to-dynamic-web-exploratory'))
    assert.equal(legacyBackups.length > 0, true)
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
})

test('dependency SKILL manifests are quarantined outside host discovery', () => {
  const tempRoot = makeTempRoot('qa-skill-nested-')
  const skillRoot = path.join(tempRoot, 'dynamic-web-exploratory')
  const nestedRoot = path.join(skillRoot, 'node_modules', 'playwright-core', 'lib', 'tools', 'trace')
  fs.mkdirSync(nestedRoot, { recursive: true })
  fs.writeFileSync(path.join(skillRoot, 'SKILL.md'), 'canonical\n')
  fs.writeFileSync(path.join(nestedRoot, 'SKILL.md'), 'dependency resource\n')

  try {
    const script = [
      'set -e',
      'REPO_DIR="$1"',
      'SKILLS_DIR="$2"',
      'DRY_RUN=0',
      'source "$REPO_DIR/scripts/setup_lib.sh"',
      'quarantine_nested_skill_manifests "$SKILLS_DIR/dynamic-web-exploratory"',
    ].join('; ')
    const result = spawnSync(BASH, ['-c', script, '_', toBashPath(ROOT), toBashPath(tempRoot)], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, NO_COLOR: '1' },
    })

    assert.equal(result.status, 0, result.stderr || result.stdout)
    assert.equal(fs.existsSync(path.join(skillRoot, 'SKILL.md')), true)
    assert.equal(fs.existsSync(path.join(nestedRoot, 'SKILL.md')), false)
    assert.equal(fs.existsSync(path.join(nestedRoot, 'SKILL.dependency-resource.md')), true)
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
})

test('unchanged dependency manifests reuse node_modules across skill updates', () => {
  const tempRoot = makeTempRoot('qa-skill-deps-reuse-')
  const skillsDir = path.join(tempRoot, 'skills')
  const installed = path.join(skillsDir, 'dynamic-web-exploratory')
  const source = path.join(ROOT, 'dynamic-testing', 'web-exploratory')
  const nested = path.join(installed, 'node_modules', 'playwright-core', 'trace')
  fs.mkdirSync(nested, { recursive: true })
  fs.copyFileSync(path.join(source, 'package.json'), path.join(installed, 'package.json'))
  fs.copyFileSync(path.join(source, 'package-lock.json'), path.join(installed, 'package-lock.json'))
  fs.writeFileSync(path.join(installed, 'SKILL.md'), 'old canonical copy\n')
  fs.writeFileSync(path.join(nested, 'runtime-marker.txt'), 'keep me\n')
  fs.writeFileSync(path.join(nested, 'SKILL.md'), 'dependency skill\n')

  try {
    const result = spawnSync(BASH, [
      toBashPath(SETUP),
      '--agent=codex',
      '--profile=full',
      '--only=dynamic-web-exploratory',
      `--skills-dir=${toBashPath(skillsDir)}`,
      '--skip-deps',
      '--skip-mcp-setup',
      '--yes',
    ], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, NO_COLOR: '1' },
    })

    assert.equal(result.status, 0, result.stderr || result.stdout)
    assert.equal(fs.existsSync(path.join(nested, 'runtime-marker.txt')), true)
    assert.equal(fs.existsSync(path.join(nested, 'SKILL.md')), false)
    assert.equal(fs.existsSync(path.join(nested, 'SKILL.dependency-resource.md')), true)
    assert.equal(fs.existsSync(path.join(installed, '.qa-skill-deps-reused')), false)
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
})
