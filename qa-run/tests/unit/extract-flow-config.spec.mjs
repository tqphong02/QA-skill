import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const extractFlow = path.join(testDir, '..', '..', 'scripts', 'helpers', 'extract-flow.mjs');
const source = fs.readFileSync(extractFlow, 'utf8');

test('extract-flow reads positional CLI values for discovery limits', () => {
  assert.match(source, /parseInt\(find\(args, '--max-pages', 1\) \?\? '30'/);
  assert.match(source, /parseInt\(find\(args, '--wait', 1\) \?\? '1200'/);
});

test('extract-flow resolves the canonical business-guide writer path', () => {
  assert.match(source, /path\.join\(SKILL_DIR, 'scripts', 'writers', 'write-business-guide\.mjs'\)/);
});
