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
  run(process.execPath, [
    'dynamic-testing/web-exploratory/scripts/writers/render-intelligence-html.mjs',
    '--check',
    'skill-catalog/QA-skill-effective-html-04-08-2026/QA-skill.html',
  ]);

  run(process.execPath, ['scripts/skill-readiness-suite.mjs']);
  console.log('[test-suite] PASS; all deterministic local contracts passed');
} catch (error) {
  console.error(`[test-suite] FAIL: ${error.message}`);
  process.exitCode = 1;
}
