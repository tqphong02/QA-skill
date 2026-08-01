#!/usr/bin/env node
/** Repository test entrypoint for the complete local senior-readiness suite. */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(command, args, cwd = ROOT) {
  console.log(`[test-suite] ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { cwd, env: { ...process.env }, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status}`);
}

try {
  run('python3', ['scripts/validate_cross_model.py']);
  for (const catalog of [
    'skill-catalog/QA-skill-effective-html-30-07-2026/QA-skill.html',
    'skill-catalog/QA-skill-effective-html/QA-skill.html',
  ]) run(process.execPath, ['scripts/build-skill-catalog.mjs', '--check', catalog]);

  run(process.execPath, ['scripts/skill-readiness-suite.mjs']);
  console.log('[test-suite] PASS; all deterministic local contracts passed');
} catch (error) {
  console.error(`[test-suite] FAIL: ${error.message}`);
  process.exitCode = 1;
}
