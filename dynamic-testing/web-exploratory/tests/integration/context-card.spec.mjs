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

test('Context card keeps high-risk intelligence inside a bounded model surface', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-context-card-'));
  try {
    const cleanFixtureRepo = createCleanFixtureRepo(fixtureRepo, tempRoot);
    const knowledgeDir = path.join(tempRoot, 'qa-knowledge');
    fs.mkdirSync(knowledgeDir, { recursive: true });
    fs.writeFileSync(
      path.join(knowledgeDir, 'order-business-model.json'),
      JSON.stringify({
        business_model: {
          nodes: [
            { id: 'order', type: 'entity', label: 'Order', confidence: 'documented' },
            { id: 'approval', type: 'state', label: 'APPROVED', confidence: 'documented' },
          ],
          relations: [
            { from: 'order', to: 'approval', type: 'has_state', confidence: 'documented' },
          ],
          invariants: [
            {
              id: 'one-result-per-version',
              statement: 'Mỗi phiên bản được chọn phải có đúng một result tương ứng',
              oracle: 'Đối chiếu selected version IDs với result IDs và count',
              confidence: 'documented',
            },
          ],
        },
      }, null, 2),
      'utf8',
    );
    fs.writeFileSync(
      path.join(knowledgeDir, 'order-business-guide.md'),
      [
        '# Order',
        '',
        '## Happy Business Flow',
        '',
        '### Step 1 — Create order',
        '- Role: Buyer',
        '- Precondition: Authenticated session',
        '- Expected: Order is created',
        '- Status: documented',
        '- Evidence: guide-only detail',
        '- Submit the order form',
        '',
        '## Business Rules',
        '',
        '- Order code must be unique',
        '- Implementation: repository enforces uniqueness',
      ].join('\n'),
      'utf8',
    );
    const result = run(tempRoot, cleanFixtureRepo);
    assert.equal(result.status, 0, result.stderr || result.stdout);

    const contextDir = path.join(tempRoot, 'qa-knowledge', 'context');
    const brief = JSON.parse(fs.readFileSync(
      path.join(contextDir, 'business-execution-brief.json'),
      'utf8',
    ));
    const card = JSON.parse(fs.readFileSync(
      path.join(contextDir, 'business-execution-card.json'),
      'utf8',
    ));
    const budget = JSON.parse(fs.readFileSync(
      path.join(contextDir, 'context-budget.json'),
      'utf8',
    ));

    assert.equal(card.artifact, 'business-execution-card');
    assert.equal(card.status, 'READY');
    assert.equal(card.retrieval.full_brief, 'qa-knowledge/context/business-execution-brief.json');
    assert.ok(card.execution_contract.original_flow.length > 0);
    assert.ok(card.observability_contract.includes('same-session network/console'));
    assert.ok(brief.business_context.business_model.nodes.length > 0);
    assert.ok(brief.business_context.business_model.relations.length > 0);
    assert.ok(
      brief.business_context.business_model.invariants.some(item => item.id === 'one-result-per-version'),
    );
    assert.ok(
      card.business_model.invariants.some(item => item.id === 'one-result-per-version'),
    );
    assert.ok(
      brief.risk_inventory.some(item => item.category === 'version-result-integrity'),
    );
    assert.equal(
      brief.business_context.happy_flow.some(value => /^(Status|Evidence):/i.test(value)),
      false,
    );
    assert.equal(
      brief.business_context.business_rules.some(value => /^Implementation:/i.test(value)),
      false,
    );
    assert.ok(
      brief.source_evidence.some(item => item.kind === 'knowledge_detail'),
    );
    assert.ok(card.exploratory_charters.length > 0);
    assert.ok(card.source_evidence.length > 0);
    assert.deepEqual(
      card.retrieval.high_risk_ids,
      brief.risk_inventory
        .filter(risk => ['critical', 'high'].includes(risk.priority))
        .map(risk => risk.risk_id),
    );
    assert.deepEqual(
      [...card.risk_inventory.map(risk => risk.risk_id), ...card.retrieval.deferred_risk_ids].sort(),
      brief.risk_inventory.map(risk => risk.risk_id).sort(),
    );
    assert.deepEqual(
      [...card.exploratory_charters.map(charter => charter.charter_id), ...card.retrieval.deferred_charter_ids].sort(),
      brief.exploratory_charters.map(charter => charter.charter_id).sort(),
    );
    assert.equal(budget.model_context_card.within_budget, true);
    assert.ok(
      budget.model_context_card.estimated_tokens <= budget.model_context_card.max_estimated_tokens,
    );
    assert.equal(budget.cache_hit, false);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('Test intelligence reuses an unchanged brief and records a cache hit', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-context-cache-'));
  try {
    const cleanFixtureRepo = createCleanFixtureRepo(fixtureRepo, tempRoot);
    const first = run(tempRoot, cleanFixtureRepo);
    assert.equal(first.status, 0, first.stderr || first.stdout);

    const second = run(tempRoot, cleanFixtureRepo);
    assert.equal(second.status, 0, second.stderr || second.stdout);
    assert.match(second.stdout, /CACHE_HIT/);
    assert.match(second.stdout, /CACHE_HIT_FAST/);
    assert.doesNotMatch(second.stdout, /Phase 1: Core Scanner/);

    const budget = JSON.parse(fs.readFileSync(
      path.join(tempRoot, 'qa-knowledge', 'context', 'context-budget.json'),
      'utf8',
    ));
    assert.equal(budget.cache_hit, true);
    assert.equal(budget.cache_mode, 'stat_fast');
    assert.ok(budget.cache_key);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
