import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIncrementalImpactPlan } from '../../lib/change-impact.mjs';

test('dirty source is an incremental delta, not an up-to-date cache hit', () => {
  const plan = buildIncrementalImpactPlan(['src/orders/service.ts'], { hasBaseline: true });
  assert.equal(plan.mode, 'incremental');
  assert.equal(plan.refresh_derived, true);
  assert.ok(plan.phase1['source-indexer.mjs']);
  assert.ok(plan.phase2['business-flow-builder.mjs']);
});

test('UI-only change reuses unaffected API, permission and database artifacts', () => {
  const plan = buildIncrementalImpactPlan(['src/components/order-form.tsx'], { hasBaseline: true });
  assert.equal(plan.phase1['api-contract-extractor.mjs'], false);
  assert.equal(plan.phase2['permission-matrix-extractor.mjs'], false);
  assert.equal(plan.phase2['database-domain-extractor.mjs'], false);
  assert.equal(plan.phase2['business-flow-builder.mjs'], true);
});

test('test-only change updates metadata without rescanning business source', () => {
  const plan = buildIncrementalImpactPlan(['tests/orders.spec.ts'], { hasBaseline: true });
  assert.equal(plan.mode, 'metadata-only');
  assert.deepEqual(plan.phase1, {
    'repo-fingerprint.mjs': true,
    'source-indexer.mjs': false,
    'graphify-adapter.mjs': false,
    'architecture-discovery.mjs': false,
    'api-contract-extractor.mjs': false,
    'business-rule-extractor.mjs': false,
    'business-flow-builder.mjs': false,
    'state-machine-extractor.mjs': false,
    'permission-matrix-extractor.mjs': false,
    'database-domain-extractor.mjs': false,
  });
});

test('missing baseline escalates incremental discovery to full', () => {
  const plan = buildIncrementalImpactPlan(['src/orders/service.ts'], { hasBaseline: false });
  assert.equal(plan.mode, 'full');
  assert.equal(plan.phase1['api-contract-extractor.mjs'], true);
  assert.equal(plan.phase2['database-domain-extractor.mjs'], true);
});
