import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'qa-runs.mjs')

function invoke(project, args) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: 'utf8',
    env: { ...process.env, QA_SKILL_PROJECT_ROOT: project, QA_SKILL_TIMEZONE: 'Asia/Ho_Chi_Minh' },
  })
  return result
}

test('start and finish create a sortable run with latest and index pointers', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-runs-test-'))
  const started = invoke(project, ['start', '--skill', 'dynamic-web-exploratory', '--label', 'Đăng nhập admin'])
  assert.equal(started.status, 0, started.stderr)
  const run = JSON.parse(started.stdout)
  assert.match(path.basename(run.run_dir_absolute), /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_dang-nhap-admin$/)
  assert.equal(JSON.parse(fs.readFileSync(run.manifest_path, 'utf8')).status, 'RUNNING')

  fs.writeFileSync(path.join(run.run_dir_absolute, 'report.md'), '# Report\n', 'utf8')
  fs.mkdirSync(path.join(run.run_dir_absolute, 'evidence'))
  fs.writeFileSync(path.join(run.run_dir_absolute, 'evidence', 'login.png'), 'image', 'utf8')

  const finished = invoke(project, [
    'finish',
    '--run-dir', run.run_dir_absolute,
    '--status', 'PASS',
    '--primary', 'report.md',
  ])
  assert.equal(finished.status, 0, finished.stderr)
  const completed = JSON.parse(finished.stdout)
  assert.equal(completed.status, 'PASS')
  assert.equal(completed.artifact_count, 2)
  assert.deepEqual(completed.artifacts.map(item => item.path), ['evidence/login.png', 'report.md'])

  const latest = JSON.parse(fs.readFileSync(path.join(project, 'qa-runs', 'latest.json'), 'utf8'))
  assert.equal(latest.run_id, completed.run_id)
  assert.equal(latest.primary_report, completed.primary_report)
  const index = fs.readFileSync(path.join(project, 'qa-runs', 'INDEX.md'), 'utf8')
  assert.match(index, /dynamic-web-exploratory/)
  assert.match(index, /mở report/)
  const latestMarkdown = fs.readFileSync(path.join(project, 'qa-runs', 'LATEST.md'), 'utf8')
  assert.match(latestMarkdown, /Trạng thái: `PASS`/)
})

test('same-second run names never overwrite an existing run', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-runs-collision-'))
  const first = invoke(project, ['start', '--skill', 'dynamic-ai-evaluation', '--label', 'baseline'])
  const second = invoke(project, ['start', '--skill', 'dynamic-ai-evaluation', '--label', 'baseline'])
  assert.equal(first.status, 0, first.stderr)
  assert.equal(second.status, 0, second.stderr)
  const firstRun = JSON.parse(first.stdout)
  const secondRun = JSON.parse(second.stdout)
  assert.notEqual(firstRun.run_dir_absolute, secondRun.run_dir_absolute)
  assert.match(path.basename(secondRun.run_dir_absolute), /-02$/)
})

test('finish rejects a primary report outside the run directory', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-runs-boundary-'))
  const started = invoke(project, ['start', '--skill', 'dynamic-performance'])
  assert.equal(started.status, 0, started.stderr)
  const run = JSON.parse(started.stdout)
  const outside = path.join(project, 'outside.md')
  fs.writeFileSync(outside, 'outside', 'utf8')
  const finished = invoke(project, [
    'finish',
    '--run-dir', run.run_dir_absolute,
    '--status', 'PASS',
    '--primary', outside,
  ])
  assert.equal(finished.status, 1)
  assert.match(finished.stderr, /Primary report must stay inside/)
})

test('rebuild restores indexes from immutable run manifests', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-runs-rebuild-'))
  const started = invoke(project, ['start', '--skill', 'hybrid-api-contract', '--label', 'orders'])
  assert.equal(started.status, 0, started.stderr)
  fs.rmSync(path.join(project, 'qa-runs', 'INDEX.md'))
  fs.rmSync(path.join(project, 'qa-runs', 'LATEST.md'))
  const rebuilt = invoke(project, ['rebuild'])
  assert.equal(rebuilt.status, 0, rebuilt.stderr)
  assert.equal(JSON.parse(rebuilt.stdout).count, 1)
  assert.ok(fs.existsSync(path.join(project, 'qa-runs', 'INDEX.md')))
  assert.ok(fs.existsSync(path.join(project, 'qa-runs', 'LATEST.md')))
})

test('legacy-index sorts existing output files without moving them', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-runs-legacy-'))
  fs.mkdirSync(path.join(project, 'evidence', 'old-run'), { recursive: true })
  const evidence = path.join(project, 'evidence', 'old-run', 'report.json')
  const rootResult = path.join(project, 'retest_results.json')
  fs.writeFileSync(evidence, '{}\n', 'utf8')
  fs.writeFileSync(rootResult, '{}\n', 'utf8')
  const indexed = invoke(project, ['legacy-index'])
  assert.equal(indexed.status, 0, indexed.stderr)
  assert.equal(JSON.parse(indexed.stdout).count, 2)
  const markdown = fs.readFileSync(path.join(project, 'qa-runs', 'LEGACY.md'), 'utf8')
  assert.match(markdown, /evidence\/old-run\/report.json/)
  assert.match(markdown, /retest_results.json/)
  assert.ok(fs.existsSync(evidence))
  assert.ok(fs.existsSync(rootResult))
})
