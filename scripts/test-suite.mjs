#!/usr/bin/env node
/** Repository test entrypoint that keeps generated QA evidence outside the worktree. */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-skill-test-'));

function run(command, args, cwd = ROOT) {
  console.log(`[test-suite] ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { cwd, env: { ...process.env }, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status}`);
}

function testFiles(directory) {
  return fs.readdirSync(directory)
    .filter(name => name.endsWith('.spec.mjs'))
    .sort()
    .map(name => path.join(directory, name));
}

try {
  run('python3', ['scripts/validate_cross_model.py']);
  for (const catalog of [
    'skill-catalog/QA-skill-effective-html-30-07-2026/QA-skill.html',
    'skill-catalog/QA-skill-effective-html/QA-skill.html',
  ]) run(process.execPath, ['scripts/build-skill-catalog.mjs', '--check', catalog]);

  const qaTests = [
    ...testFiles(path.join(ROOT, 'qa-run/tests/unit')),
    ...testFiles(path.join(ROOT, 'qa-run/tests/integration')),
    ...testFiles(path.join(ROOT, 'qa-run/tests/e2e')),
  ];
  run(process.execPath, ['--test', ...qaTests], TEMP_ROOT);
  run(process.execPath, [path.join(ROOT, 'qa-run/tests/business-context-gate.spec.mjs')], TEMP_ROOT);
  run(process.execPath, ['--test', ...testFiles(path.join(ROOT, 'pentest-run/skills/pentest-security/tests'))], TEMP_ROOT);
  console.log(`[test-suite] PASS; temporary artifacts: ${TEMP_ROOT}`);
} catch (error) {
  console.error(`[test-suite] FAIL: ${error.message}`);
  process.exitCode = 1;
} finally {
  fs.rmSync(TEMP_ROOT, { recursive: true, force: true });
}
