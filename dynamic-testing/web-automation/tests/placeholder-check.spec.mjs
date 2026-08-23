import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { findPlaceholders } from '../assets/templates/scripts/check-placeholders.mjs';

test('cross-platform placeholder check ignores comments and TypeScript generics', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'placeholder-check-'));
  try {
    fs.writeFileSync(path.join(root, 'example.ts'), [
      'const value: Promise<string> = Promise.resolve("ok");',
      '// <COMMENT_ONLY>',
      'const baseUrl = "<API_BASE_URL>";',
    ].join('\n'), 'utf8');
    const issues = findPlaceholders({ root });
    assert.deepEqual(issues, [{ file: 'example.ts', line: 3, token: '<API_BASE_URL>' }]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
