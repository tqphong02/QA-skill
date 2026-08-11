#!/usr/bin/env node

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCleanFixtureRepo } from '../helpers/clean-fixture-repo.mjs';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(testDir, '..', '..');
const prepare = path.join(skillRoot, 'scripts', 'helpers', 'prepare-test-intelligence.mjs');
const fixtureRepo = path.join(skillRoot, 'tests', 'fixtures', 'nestjs-app');

function run(dataDir, repoPath, extraArgs = []) {
  return spawnSync(process.execPath, [
    prepare,
    '--intent',
    'EXPLORATORY_ADHOC',
    '--scope',
    'order',
    '--repo',
    repoPath,
    ...extraArgs,
  ], {
    cwd: dataDir,
    env: { ...process.env, QA_DATA_DIR: dataDir },
    encoding: 'utf8',
  });
}

test('Test intelligence: refreshes source and generates evidence-linked risk charters', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-test-intelligence-'));
  try {
    const cleanFixtureRepo = createCleanFixtureRepo(fixtureRepo, tempRoot);
    const first = run(tempRoot, cleanFixtureRepo);
    assert.equal(first.status, 0, first.stderr || first.stdout);
    assert.match(first.stdout, /Refreshing source knowledge/);

    const briefPath = path.join(
      tempRoot,
      'qa-knowledge',
      'context',
      'business-execution-brief.json',
    );
    const brief = JSON.parse(fs.readFileSync(briefPath, 'utf8'));
    const knowledgeIndex = JSON.parse(fs.readFileSync(
      path.join(tempRoot, 'qa-knowledge', 'knowledge-index.json'),
      'utf8',
    ));

    assert.equal(brief.schema_version, 2);
    assert.equal(brief.status, 'READY');
    assert.equal(brief.knowledge_health.source_only, true);
    assert.equal(brief.knowledge_health.runtime_evidence_present, false);
    assert.ok(brief.source_evidence.length > 0);
    assert.ok(knowledgeIndex.source_repositories['nestjs-app']);
    assert.ok(
      knowledgeIndex.source_repositories['nestjs-app'].artifacts
        .some(file => file.endsWith('business-flows.json')),
    );

    const riskCategories = brief.risk_inventory.map(item => item.category);
    assert.ok(riskCategories.includes('authorization-boundary'));
    assert.ok(riskCategories.includes('state-integrity'));
    assert.ok(riskCategories.includes('validation-data-integrity'));
    assert.ok(riskCategories.includes('mutation-idempotency'));

    assert.ok(brief.exploratory_charters.length >= 4);
    for (const charter of brief.exploratory_charters) {
      assert.ok(charter.oracles.length > 0, `${charter.charter_id} must have an oracle`);
      assert.ok(charter.source_refs.length > 0, `${charter.charter_id} must cite source`);
      assert.ok(charter.evidence_required.includes('same-session network/console'));
    }

    const allSignals = Object.values(brief.business_context).flat().map(String);
    assert.equal(allSignals.some(value => /^(?:--+|\d+|STATIC_ONLY)$/i.test(value)), false);
    assert.equal(
      brief.business_context.business_rules.some(value => /^uniqueness:\s+import\b/i.test(value)),
      false,
    );
    assert.equal(
      brief.business_context.business_rules.some(value => /Permission: role ->/i.test(value)),
      false,
    );
    assert.equal(
      brief.business_context.business_rules.some(value => /^financial:/i.test(value)),
      false,
    );

    const second = run(tempRoot, cleanFixtureRepo);
    assert.equal(second.status, 0, second.stderr || second.stdout);
    assert.match(second.stdout, /Source knowledge is current/);
    assert.doesNotMatch(second.stdout, /Phase 1: Core Scanner/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
