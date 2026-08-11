import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateBusinessIntelligence } from '../../scripts/helpers/evaluate-business-intelligence.mjs';
import { normalizeModelUsage } from '../../lib/model-telemetry.mjs';
import { validateHostSmoke } from '../../scripts/helpers/validate-host-smoke.mjs';

test('provider-reported token usage is preserved separately from the estimate', () => {
  const usage = normalizeModelUsage({
    provider: 'test-host',
    model: 'test-model',
    input_tokens: 120,
    output_tokens: 30,
    latency_ms: 240,
  });
  assert.equal(usage.measurement, 'provider_reported');
  assert.equal(usage.total_tokens, 150);
  assert.equal(usage.latency_ms, 240);
});

test('golden business-flow evaluation reports missing intelligence', () => {
  const report = evaluateBusinessIntelligence(
    {
      status: 'READY',
      business_context: {
        routes: ['/orders'],
        roles: ['Buyer'],
        preconditions: ['Authenticated session'],
        happy_flow: ['Create order', 'Order is created'],
        business_rules: ['Order code must be unique'],
        expected_results: ['Order is created'],
        business_model: { invariants: [] },
      },
    },
    {
      id: 'order',
      required: {
        routes: ['/orders'],
        roles: ['Buyer'],
        preconditions: ['Authenticated session'],
        happy_flow: ['Create order'],
        business_rules: ['Order code must be unique'],
        expected_results: ['Order is created'],
        invariants: ['One result per selected version'],
      },
      thresholds: { min_recall: 1, min_precision: 0.3 },
    },
  );
  assert.equal(report.verdict, 'FAILED');
  assert.match(report.missing.join('\n'), /One result per selected version/);
});

test('Antigravity smoke gate never passes without same-session evidence', () => {
  const blocked = validateHostSmoke({
    host: 'antigravity',
    browser_driver: 'antigravity-native',
    same_session: false,
    screenshot_paths: [],
    network_observed: false,
    console_observed: true,
    page_errors_observed: true,
  });
  assert.equal(blocked.verdict, 'BLOCKED');
  assert.ok(blocked.missing.includes('same_session=true'));
});
