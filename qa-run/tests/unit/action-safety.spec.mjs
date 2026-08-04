import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateActionSafety, ALLOWED_ACTION_POLICIES } from '../../scripts/analysis/attack-surface.mjs';

test('Action Safety: READ_ONLY actions pass automatically', () => {
  const res = evaluateActionSafety({ actionText: 'Search products', httpMethod: 'GET' });
  assert.equal(res.safety, 'READ_ONLY');
});

test('Action Safety: SAFE_WRITE actions pass for test inputs', () => {
  const res = evaluateActionSafety({ actionText: 'Save profile draft', httpMethod: 'POST' });
  assert.equal(res.safety, 'SAFE_WRITE');
});

test('Action Safety: Destructive action BLOCKED by default', () => {
  const res = evaluateActionSafety({ actionText: 'Delete user account', httpMethod: 'DELETE' });
  assert.equal(res.safety, 'BLOCKED');
  assert.match(res.reason, /BLOCKED/);
});

test('Action Safety: Destructive action ALLOWED only with valid policy', () => {
  const res = evaluateActionSafety({
    actionText: 'Delete test record',
    httpMethod: 'DELETE',
    allowAction: 'delete-test-record',
  });
  assert.equal(res.safety, 'DESTRUCTIVE_ALLOWED');
});

test('Action Safety: Invalid allow-action is BLOCKED', () => {
  const res = evaluateActionSafety({
    actionText: 'Delete user account',
    httpMethod: 'DELETE',
    allowAction: 'arbitrary-untrusted-action',
  });
  assert.equal(res.safety, 'BLOCKED');
});

test('Action Safety: Payment action is classified as PAYMENT', () => {
  const res = evaluateActionSafety({ actionText: 'Checkout credit card', httpMethod: 'POST' });
  assert.equal(res.safety, 'PAYMENT');
});

test('Action Safety: External side-effect action is classified as EXTERNAL_EFFECT', () => {
  const res = evaluateActionSafety({ actionText: 'Send email blast to all', httpMethod: 'POST' });
  assert.equal(res.safety, 'EXTERNAL_EFFECT');
});

test('Action Safety: Login email field fill is not mistaken for an external effect', () => {
  const res = evaluateActionSafety({
    actionText: 'Fill authorized login fields',
    selector: 'textbox Email and textbox Mật khẩu',
    httpMethod: 'GET',
    targetUrl: 'https://uat.example.test/login',
  });
  assert.equal(res.safety, 'READ_ONLY');
});
