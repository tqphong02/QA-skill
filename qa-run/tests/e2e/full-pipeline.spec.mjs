import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveScriptPath } from '../../scripts/registry.mjs';

function run(args, dataDir) {
  const result = spawnSync('node', [resolveScriptPath('run-manifest.mjs'), ...args], {
    encoding: 'utf8',
    env: { ...process.env, QA_DATA_DIR: dataDir },
  });
  assert.equal(result.status, 0, `run-manifest failed:\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

test('Full Pipeline E2E: Run manifest start and finish cycle', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-full-pipeline-'));
  try {
    const briefPath = path.join(tempRoot, 'qa-knowledge', 'context', 'business-execution-brief.json');
    fs.mkdirSync(path.dirname(briefPath), { recursive: true });
    fs.writeFileSync(briefPath, JSON.stringify({
      schema_version: 2,
      status: 'READY',
      scope: 'full-e2e-fixture',
      source_files: ['test-fixture'],
      source_hash: 'fixture-hash',
      risk_inventory: [{ id: 'RISK-E2E-001', priority: 'high', evidence_refs: ['test-fixture'] }],
      exploratory_charters: [{ id: 'CHARTER-E2E-001', risk_ids: ['RISK-E2E-001'], oracles: ['Manifest persists final verdict'] }],
      missing_required: [],
    }, null, 2));
    const startStdout = run(
      ['start', '--workers', '2', '--mode', 'FULL_E2E', '--business-context', briefPath],
      tempRoot,
    );
    assert.match(startStdout, /Manifest initialized/);
    const runId = startStdout.match(/run-\d+/)?.[0];
    assert.ok(runId, 'Run ID should be generated');

    const finishStdout = run(
      ['finish', runId, '--verdict', 'PASS', '--total-cases', '10', '--passed', '10'],
      tempRoot,
    );
    assert.match(finishStdout, /Manifest finalized/);
    assert.match(finishStdout, /Verdict:\s+PASS/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
