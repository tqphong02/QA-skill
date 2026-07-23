import test from 'node:test';
import assert from 'node:assert/strict';

class IdempotentExporterStore {
  constructor() {
    this.store = new Map();
  }

  getLockKey(runId, testId, exporter) {
    return `${runId}:${testId}:${exporter}`;
  }

  startExport(runId, testId, exporter) {
    const key = this.getLockKey(runId, testId, exporter);
    const existing = this.store.get(key);
    if (existing && (existing.status === 'SUCCESS' || existing.status === 'PROCESSING')) {
      return { ok: false, reason: `Already in state ${existing.status}` };
    }
    this.store.set(key, { status: 'PROCESSING', started_at: new Date().toISOString() });
    return { ok: true, key };
  }

  finishExport(key, status = 'SUCCESS') {
    if (this.store.has(key)) {
      this.store.set(key, { status, finished_at: new Date().toISOString() });
    }
  }

  getStatus(runId, testId, exporter) {
    return this.store.get(this.getLockKey(runId, testId, exporter))?.status || 'IDLE';
  }
}

test('Idempotency Store: First export transitions IDLE -> PROCESSING -> SUCCESS', () => {
  const store = new IdempotentExporterStore();
  const start = store.startExport('run-100', 'TC-001', 'google_sheet');
  assert.equal(start.ok, true);

  store.finishExport(start.key, 'SUCCESS');
  assert.equal(store.getStatus('run-100', 'TC-001', 'google_sheet'), 'SUCCESS');
});

test('Idempotency Store: Retried export is skipped when state is SUCCESS', () => {
  const store = new IdempotentExporterStore();
  const start1 = store.startExport('run-100', 'TC-001', 'google_sheet');
  store.finishExport(start1.key, 'SUCCESS');

  const start2 = store.startExport('run-100', 'TC-001', 'google_sheet');
  assert.equal(start2.ok, false);
  assert.match(start2.reason, /Already in state SUCCESS/);
});

test('Idempotency Store: Concurrent export attempt is blocked when state is PROCESSING', () => {
  const store = new IdempotentExporterStore();
  store.startExport('run-100', 'TC-002', 'plane');

  const concurrent = store.startExport('run-100', 'TC-002', 'plane');
  assert.equal(concurrent.ok, false);
  assert.match(concurrent.reason, /Already in state PROCESSING/);
});
