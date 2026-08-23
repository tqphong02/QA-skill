import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { verifyAllureContract } from '../assets/templates/scripts/verify-allure-contract.mjs';

function writeResult(root, name, result) {
  fs.mkdirSync(root, { recursive: true });
  for (const attachment of result.attachments || []) {
    if (attachment.source) fs.writeFileSync(path.join(root, attachment.source), 'evidence');
  }
  fs.writeFileSync(path.join(root, `${name}-result.json`), `${JSON.stringify(result)}\n`, 'utf8');
}

function canonicalResult(overrides = {}) {
  return {
    uuid: 'result-001',
    status: 'passed',
    parameters: [
      { name: 'account', value: 'admin-slot-0' },
      { name: 'url', value: 'https://app.example.test/orders/42' },
      { name: 'evidence_image', value: 'evidence-image' },
      { name: 'evidence_video', value: 'evidence-video' },
      { name: 'testcase_id', value: 'TC-001' },
      { name: 'run_id', value: 'run-001' },
    ],
    attachments: [
      { name: 'evidence-image', source: 'image-001.png', type: 'image/png' },
      { name: 'evidence-video', source: 'video-001.webm', type: 'video/webm' },
    ],
    ...overrides,
  };
}

test('canonical Allure contract accepts one fixed UI result shape', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'allure-contract-pass-'));
  try {
    writeResult(root, 'result-001', canonicalResult());
    const result = verifyAllureContract({ resultsDir: root, mode: 'ui' });
    assert.equal(result.status, 'PASS');
    assert.equal(result.result_count, 1);
    assert.deepEqual(result.required_parameters, ['account', 'url', 'evidence_image', 'evidence_video']);
    assert.deepEqual(result.violations, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('canonical Allure contract blocks missing media and duplicate parameters', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'allure-contract-blocked-'));
  try {
    const result = canonicalResult({
      parameters: [
        { name: 'account', value: 'admin-slot-0' },
        { name: 'account', value: 'admin-slot-1' },
        { name: 'url', value: 'https://app.example.test/orders/42' },
        { name: 'evidence_image', value: 'N/A' },
        { name: 'evidence_video', value: 'N/A' },
      ],
      attachments: [],
    });
    writeResult(root, 'result-001', result);
    const report = verifyAllureContract({ resultsDir: root, mode: 'functional' });
    assert.equal(report.status, 'BLOCKED');
    assert.ok(report.violations.some(item => item.code === 'ALLURE_PARAMETER_DUPLICATE'));
    assert.ok(report.violations.some(item => item.code === 'ALLURE_ATTACHMENT_REQUIRED_MISSING'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('API mode keeps the four parameter names without requiring browser media', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'allure-contract-api-'));
  try {
    writeResult(root, 'result-001', canonicalResult({
      parameters: [
        { name: 'account', value: 'service-role' },
        { name: 'url', value: 'https://api.example.test/users' },
        { name: 'evidence_image', value: 'N/A' },
        { name: 'evidence_video', value: 'N/A' },
      ],
      attachments: [],
    }));
    const report = verifyAllureContract({ resultsDir: root, mode: 'api' });
    assert.equal(report.status, 'PASS');
    assert.equal(report.require_media, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('mixed mode exempts results tagged @api but keeps UI media strict', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'allure-contract-mixed-'));
  try {
    writeResult(root, 'result-001', canonicalResult({
      name: 'GET /users @api',
      parameters: [
        { name: 'account', value: 'service-role' },
        { name: 'url', value: 'https://api.example.test/users' },
        { name: 'evidence_image', value: 'N/A' },
        { name: 'evidence_video', value: 'N/A' },
      ],
      attachments: [],
    }));
    const report = verifyAllureContract({ resultsDir: root, mode: 'mixed' });
    assert.equal(report.status, 'PASS');
    assert.equal(report.results[0].media_required, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a test skipped before fixtures does not become UNTEST because media cannot exist', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'allure-contract-skipped-'));
  try {
    writeResult(root, 'result-001', { uuid: 'result-001', status: 'skipped', attachments: [] });
    const report = verifyAllureContract({ resultsDir: root, mode: 'ui' });
    assert.equal(report.status, 'PASS');
    assert.equal(report.results[0].media_required, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('canonical Allure contract rejects secret-like account values', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'allure-contract-secret-'));
  try {
    writeResult(root, 'result-001', canonicalResult({
      parameters: canonicalResult().parameters.map(parameter => (
        parameter.name === 'account'
          ? { ...parameter, value: 'password=super-secret' }
          : parameter
      )),
    }));
    const report = verifyAllureContract({ resultsDir: root, mode: 'ui' });
    assert.equal(report.status, 'BLOCKED');
    assert.ok(report.violations.some(item => item.code === 'ALLURE_PARAMETER_SECRET'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
