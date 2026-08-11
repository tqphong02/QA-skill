import test from 'node:test';
import assert from 'node:assert/strict';

function redactTextContent(content) {
  let text = String(content);
  text = text.replace(/Bearer\s+[A-Za-z0-9._-]{10,}/gi, 'Bearer [REDACTED_TOKEN]');
  text = text.replace(/(authorization|cookie|set-cookie|api-key|secret|password):\s*["']?[^"'\s\n]+["']?/gi, '$1: "[REDACTED_SECRET]"');
  text = text.replace(/"password"\s*:\s*"[^"]+"/gi, '"password": "[REDACTED_PASSWORD]"');
  text = text.replace(/"token"\s*:\s*"[^"]+"/gi, '"token": "[REDACTED_TOKEN]"');
  text = text.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi, 'user-[REDACTED_EMAIL]@domain.com');
  return text;
}

test('Redaction: Bearer token is masked', () => {
  const raw = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secretpayload';
  const clean = redactTextContent(raw);
  assert.doesNotMatch(clean, /eyJhbGci/);
  assert.match(clean, /REDACTED_TOKEN/);
});

test('Redaction: Password in JSON is masked', () => {
  const raw = '{"username": "admin", "password": "SuperSecretPassword123!"}';
  const clean = redactTextContent(raw);
  assert.doesNotMatch(clean, /SuperSecretPassword123!/);
  assert.match(clean, /REDACTED_PASSWORD/);
});

test('Redaction: Email PII is masked', () => {
  const raw = 'Contact user at john.doe@customer.com for support';
  const clean = redactTextContent(raw);
  assert.doesNotMatch(clean, /john\.doe@customer\.com/);
  assert.match(clean, /REDACTED_EMAIL/);
});
