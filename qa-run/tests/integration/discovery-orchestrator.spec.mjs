import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(testDir, '..', '..');
const fixtureRepo = path.join(skillRoot, 'tests', 'fixtures', 'nestjs-app');
const orchestrator = path.join(skillRoot, 'scripts', 'orchestrators', 'repo-business-discovery.mjs');

function git(cwd, ...args) {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}

test('incremental discovery sees dirty source with unchanged HEAD and skips unrelated scanners', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-incremental-discovery-'));
  const repo = path.join(tempRoot, 'repo');
  const dataDir = path.join(tempRoot, 'data');
  fs.cpSync(fixtureRepo, repo, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });
  try {
    git(repo, 'init', '-q');
    git(repo, 'config', 'user.email', 'qa@example.test');
    git(repo, 'config', 'user.name', 'QA Test');
    git(repo, 'add', '.');
    git(repo, 'commit', '-qm', 'baseline');

    const full = spawnSync(process.execPath, [orchestrator, '--repo', repo, '--mode', 'full', '--graphify', 'off'], {
      cwd: dataDir,
      env: { ...process.env, QA_DATA_DIR: dataDir },
      encoding: 'utf8',
    });
    assert.equal(full.status, 0, full.stderr || full.stdout);

    const uiFile = path.join(repo, 'src', 'components', 'order-form.tsx');
    fs.mkdirSync(path.dirname(uiFile), { recursive: true });
    fs.writeFileSync(uiFile, 'export function OrderForm() { return null; }\n', 'utf8');
    const incremental = spawnSync(process.execPath, [orchestrator, '--repo', repo, '--mode', 'incremental', '--graphify', 'off'], {
      cwd: dataDir,
      env: { ...process.env, QA_DATA_DIR: dataDir },
      encoding: 'utf8',
    });
    assert.equal(incremental.status, 0, incremental.stderr || incremental.stdout);
    assert.doesNotMatch(incremental.stdout, /Knowledge up-to-date.*Skipping/);

    const session = JSON.parse(fs.readFileSync(
      path.join(dataDir, 'qa-knowledge', 'repositories', 'repo', 'discovery-session.json'),
      'utf8',
    ));
    assert.equal(session.change_impact.mode, 'incremental');
    assert.ok(session.change_impact.changed_files.includes('src/components/order-form.tsx'));
    assert.ok(session.optimization.selected_tasks.phase1.includes('business-rule-extractor.mjs'));
    assert.equal(session.optimization.selected_tasks.phase1.includes('api-contract-extractor.mjs'), false);
    assert.equal(session.optimization.selected_tasks.phase2.includes('permission-matrix-extractor.mjs'), false);
    assert.equal(session.optimization.selected_tasks.phase2.includes('database-domain-extractor.mjs'), false);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
