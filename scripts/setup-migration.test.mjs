import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SETUP = path.join(ROOT, 'scripts', 'setup.sh')

test('single-skill setup migrates only its legacy alias and installs the canonical skill', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-skill-migration-'))
  const skillsDir = path.join(tempRoot, 'skills')
  fs.mkdirSync(path.join(skillsDir, 'qa-run'), { recursive: true })
  fs.mkdirSync(path.join(skillsDir, 'plane-qa'), { recursive: true })
  fs.writeFileSync(path.join(skillsDir, 'qa-run', 'SKILL.md'), 'legacy qa-run\n')
  fs.writeFileSync(path.join(skillsDir, 'plane-qa', 'SKILL.md'), 'legacy plane-qa\n')

  try {
    const result = spawnSync('bash', [
      SETUP,
      '--agent=codex',
      '--profile=full',
      '--only=dynamic-web-exploratory',
      `--skills-dir=${skillsDir}`,
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
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-skill-nested-'))
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
    const result = spawnSync('bash', ['-c', script, '_', ROOT, tempRoot], {
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
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-skill-deps-reuse-'))
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
    const result = spawnSync('bash', [
      SETUP,
      '--agent=codex',
      '--profile=full',
      '--only=dynamic-web-exploratory',
      `--skills-dir=${skillsDir}`,
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
