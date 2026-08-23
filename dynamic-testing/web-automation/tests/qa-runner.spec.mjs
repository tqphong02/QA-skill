import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPlaywrightArgs, parseTestArgs } from '../assets/templates/scripts/qa.mjs';

test('qa runner builds one stable UI command and forwards project options', () => {
  assert.deepEqual(
    buildPlaywrightArgs('ui', ['--project=chromium']),
    ['--no-install', 'playwright', 'test', '--grep', '@ui', '--project=chromium'],
  );
});

test('qa runner does not overwrite an explicit grep filter', () => {
  assert.deepEqual(
    buildPlaywrightArgs('functional', ['--grep', '@smoke']),
    ['--no-install', 'playwright', 'test', '--grep', '@smoke'],
  );
});

test('qa runner parses surface without leaking its control flag to Playwright', () => {
  assert.deepEqual(parseTestArgs(['--surface', 'api', '--project', 'chromium']), {
    surface: 'api',
    extraArgs: ['--project', 'chromium'],
  });
});

test('qa runner rejects an unsupported surface', () => {
  assert.throws(() => parseTestArgs(['--surface', 'mobile']), /Unknown test surface/);
});
