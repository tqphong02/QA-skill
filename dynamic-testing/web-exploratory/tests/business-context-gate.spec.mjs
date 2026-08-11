#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(testDir, '..');
const contextBuilder = path.join(skillRoot, 'scripts', 'helpers', 'context-builder.mjs');
const runManifest = path.join(skillRoot, 'scripts', 'helpers', 'run-manifest.mjs');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-business-gate-'));

function run(script, args, dataDir) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: dataDir,
    env: { ...process.env, QA_DATA_DIR: dataDir },
    encoding: 'utf8',
  });
}

try {
  const readyRoot = path.join(tempRoot, 'ready');
  const knowledgeDir = path.join(readyRoot, 'qa-knowledge');
  fs.mkdirSync(knowledgeDir, { recursive: true });
  fs.writeFileSync(path.join(knowledgeDir, 'checkout-business-guide.md'), `# Checkout Business Guide

## Roles and permissions

- Role: Buyer

## Entry points

- Route: /checkout

## Happy business flow

### Step 1 — Review cart

- Precondition: Cart contains an in-stock item
- Expected: Correct item, quantity and total are shown

### Step 2 — Place order

- Precondition: Buyer has a valid delivery address
- Expected: Order is created with status PENDING

## Business rules

- Total equals item subtotal plus shipping minus discount

## State transitions

- PENDING -> CONFIRMED

## Side effects and integrations

- Inventory reservation and payment authorization
`, 'utf8');

  const readyBrief = path.join(knowledgeDir, 'context', 'business-execution-brief.json');
  const readyBuild = run(contextBuilder, [
    '--intent', 'RETEST_TICKET',
    '--scope', 'checkout',
    '--ticket', 'SHOP-101',
  ], readyRoot);
  assert.equal(readyBuild.status, 0, readyBuild.stderr || readyBuild.stdout);
  const ready = JSON.parse(fs.readFileSync(readyBrief, 'utf8'));
  assert.equal(ready.status, 'READY');
  assert.equal(ready.execution_contract.target, '/checkout');
  assert.equal(ready.execution_contract.role_data, 'Buyer');
  assert.equal(ready.execution_contract.original_flow.length, 2);
  assert.equal(ready.source_files.length, 1);
  assert.equal(ready.schema_version, 2);
  assert.ok(ready.risk_inventory.length > 0);
  assert.ok(ready.exploratory_charters.length > 0);
  assert.ok(ready.exploratory_charters.every(charter => charter.oracles.length > 0));

  const readyManifest = run(runManifest, [
    'start',
    '--mode', 'RETEST_TICKET',
    '--business-context', readyBrief,
    '--browser-observer', 'playwright-mcp',
  ], readyRoot);
  assert.equal(readyManifest.status, 0, readyManifest.stderr || readyManifest.stdout);
  const manifest = JSON.parse(
    fs.readFileSync(path.join(readyRoot, 'evidence', 'manifest-latest.json'), 'utf8'),
  );
  assert.equal(manifest.business_context.status, 'READY');
  assert.equal(manifest.business_context.scope, 'checkout');
  assert.equal(manifest.browser_observability.observer, 'playwright-mcp');
  assert.equal(manifest.browser_observability.same_session_required, true);
  assert.equal(manifest.browser_observability.redaction_required, true);
  assert.ok(manifest.test_intelligence.charter_ids.length > 0);
  assert.ok(manifest.test_intelligence.high_risk_ids.length > 0);
  assert.equal(manifest.test_intelligence.knowledge_confidence, 'static_or_document_derived');
  assert.equal(manifest.test_intelligence.context_card.status, 'READY');
  assert.equal(manifest.test_intelligence.context_card.within_budget, true);
  assert.ok(manifest.test_intelligence.context_budget);

  const staleBrief = JSON.parse(fs.readFileSync(readyBrief, 'utf8'));
  staleBrief.scope = 'checkout-changed-without-card-refresh';
  fs.writeFileSync(readyBrief, JSON.stringify(staleBrief, null, 2), 'utf8');
  const staleManifest = run(runManifest, [
    'start',
    '--mode', 'RETEST_TICKET',
    '--business-context', readyBrief,
    '--browser-observer', 'playwright-mcp',
  ], readyRoot);
  assert.equal(staleManifest.status, 2);
  assert.match(staleManifest.stderr, /business execution card is stale/);

  const missingRoot = path.join(tempRoot, 'missing');
  fs.mkdirSync(missingRoot, { recursive: true });
  const blockedBuild = run(contextBuilder, [
    '--intent', 'RETEST_TICKET',
    '--scope', 'unknown-feature',
  ], missingRoot);
  assert.equal(blockedBuild.status, 2);
  const blockedBrief = path.join(
    missingRoot,
    'qa-knowledge',
    'context',
    'business-execution-brief.json',
  );
  const blocked = JSON.parse(fs.readFileSync(blockedBrief, 'utf8'));
  assert.equal(blocked.status, 'BLOCKED');
  assert.ok(blocked.missing_required.includes('happy_flow'));
  assert.ok(blocked.missing_required.includes('business_rules'));

  const blockedManifest = run(runManifest, [
    'start',
    '--mode', 'RETEST_TICKET',
    '--business-context', blockedBrief,
  ], missingRoot);
  assert.equal(blockedManifest.status, 2);
  assert.match(blockedManifest.stderr, /status=BLOCKED/);
  assert.equal(fs.existsSync(path.join(missingRoot, 'evidence')), false);

  const discoveryRoot = path.join(tempRoot, 'discovery');
  fs.mkdirSync(discoveryRoot, { recursive: true });
  const needsDiscovery = run(contextBuilder, [
    '--intent', 'EXPLORATORY_ADHOC',
    '--scope', 'unknown-feature',
  ], discoveryRoot);
  assert.equal(needsDiscovery.status, 3);
  const discoveryManifest = run(runManifest, [
    'start',
    '--mode', 'SCOPED_BUSINESS_DISCOVERY',
  ], discoveryRoot);
  assert.equal(discoveryManifest.status, 0, discoveryManifest.stderr || discoveryManifest.stdout);

  console.log('business-context-gate: PASS');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
