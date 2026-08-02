import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertDiscoveryStage } from '../../lib/discovery-gate.mjs';

test('discovery gate fails closed on scanner failure', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-discovery-gate-'));
  try {
    assert.throws(
      () => assertDiscoveryStage({
        stage: 'phase1',
        outputDir: dir,
        tasks: [{ name: 'business-rule-extractor.mjs' }],
        results: [{ name: 'business-rule-extractor.mjs', ok: false, status: 1 }],
      }),
      /BLOCKED: discovery gate failed closed/,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('discovery gate fails closed when a reused artifact is missing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-discovery-gate-missing-'));
  try {
    assert.throws(
      () => assertDiscoveryStage({
        stage: 'phase2',
        outputDir: dir,
        tasks: [{ name: 'business-flow-builder.mjs' }],
        results: [],
      }),
      /business-flow-builder\.mjs -> business-flows\.json/,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
