import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveScriptPath } from '../../scripts/registry.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.cwd();
const FIXTURE = path.resolve(__dirname, '../fixtures/conflict-app/components.json');
const REQUIREMENTS = path.resolve(__dirname, '../fixtures/conflict-app/requirements.json');
const PAGE = 'test-order-detail';
const OUT_DIR = path.join(DATA_DIR, 'qa-knowledge', 'ui-business', PAGE);
const readJSON = name => JSON.parse(fs.readFileSync(path.join(OUT_DIR, name), 'utf8'));

test('UI reconciliation maps explicit snapshot to explicit requirements', () => {
  const result = spawnSync('node', [resolveScriptPath('ui-business-reconciliation.mjs'),
    '--page', PAGE, '--snapshot', FIXTURE, '--requirements', REQUIREMENTS, '--role', 'Staff'],
  { encoding: 'utf8', env: { ...process.env } });
  assert.equal(result.status, 0, `Orchestrator failed:\n${result.stdout}\n${result.stderr}`);
  for (const name of ['ui-components.json', 'observed-flow.json', 'business-conflicts.json',
    'ui-requirement-traceability.json', 'unresolved-rules.json', 'clarification-qna.json', 'ui-business-guide.md']) {
    assert.ok(fs.existsSync(path.join(OUT_DIR, name)), `Missing ${name}`);
  }
});

test('every observed component has a deterministic UI item ID and intent', () => {
  const data = readJSON('ui-components.json');
  assert.ok(data.components.every(item => /^UI-[A-F0-9]{12}$/.test(item.uiItemId)));
  assert.equal(new Set(data.components.map(item => item.uiItemId)).size, data.components.length);
  assert.equal(data.components.find(item => item.label === 'Approve')?.intent, 'APPROVE');
});

test('traceability includes component mappings and requirement orphans', () => {
  const trace = readJSON('ui-requirement-traceability.json');
  assert.equal(trace.summary.requirements, 7);
  assert.ok(trace.mappings.some(row => row.requirementId === 'REQ-ORD-001' && row.mappingStatus === 'CONFLICT'));
  assert.ok(trace.mappings.some(row => row.requirementId === 'REQ-ORD-007' && row.mappingStatus === 'REQ_ONLY'));
  assert.ok(trace.mappings.some(row => row.mappingStatus === 'UI_ONLY'));
  assert.ok(trace.mappings.every(row => row.evidenceLevel && Array.isArray(row.evidenceLevels)));
});

test('permission and validation conflicts are evidence-linked', () => {
  const conflicts = readJSON('business-conflicts.json').conflicts;
  const permission = conflicts.find(item => item.type === 'PERMISSION_CONFLICT' && item.requirementId === 'REQ-ORD-001');
  assert.ok(permission);
  assert.equal(permission.evidenceBundle.role, 'Staff');
  assert.equal(permission.confidence, 'source_derived');
  assert.ok(conflicts.some(item => item.requirementId === 'REQ-ORD-002'));
});

test('ambiguity detector reports coverage for exactly ten named patterns', () => {
  const data = readJSON('unresolved-rules.json');
  assert.equal(data.requiredPatternCount, 10);
  assert.equal(data.patternCoverage.length, 10);
  assert.equal(new Set(data.patternCoverage.map(item => item.patternId)).size, 10);
  assert.ok(data.patternCoverage.every(item => ['detected', 'not_detected', 'not_applicable'].includes(item.status)));
  assert.ok(data.unresolvedRules.every(item => item.question && item.observedUI && item.risk));
});

test('Q&A uses the shared business-analysis lifecycle vocabulary', () => {
  const data = readJSON('clarification-qna.json');
  assert.ok(data.questions.length > 0);
  assert.ok(data.questions.every(item => ['Open', 'Answered', 'Blocked', 'Cancelled'].includes(item.status)));
});

test('guide contains traceability and all required sections without hard-coded modules', () => {
  const guide = fs.readFileSync(path.join(OUT_DIR, 'ui-business-guide.md'), 'utf8');
  for (let section = 1; section <= 12; section += 1) assert.match(guide, new RegExp(`## ${section}\\.`));
  assert.match(guide, /UI Item ID/);
  assert.match(guide, /REQ-ORD-007/);
});
