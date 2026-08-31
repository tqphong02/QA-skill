#!/usr/bin/env node
/** Repository test entrypoint for the complete local senior-readiness suite. */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveInvocationRoot } from './invocation-paths.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INVOCATION_ROOT = resolveInvocationRoot();
const RUN_ENV = { ...process.env, QA_SKILL_PROJECT_ROOT: INVOCATION_ROOT };

function resolvePython() {
  const windowsInstalls = process.platform === 'win32'
    ? (() => {
        const root = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python');
        if (!fs.existsSync(root)) return [];
        return fs.readdirSync(root).sort().reverse()
          .map(entry => path.join(root, entry, 'python.exe'))
          .filter(executable => fs.existsSync(executable))
          .map(command => ({ command, prefix: [] }));
      })()
    : [];
  const candidates = process.platform === 'win32'
    ? [
        { command: process.env.QA_SKILL_PYTHON, prefix: [] },
        ...windowsInstalls,
        { command: 'python', prefix: [] },
        { command: 'py', prefix: ['-3'] },
      ]
    : [
        { command: process.env.QA_SKILL_PYTHON, prefix: [] },
        { command: 'python3', prefix: [] },
        { command: 'python', prefix: [] },
      ];

  for (const candidate of candidates) {
    if (!candidate.command) continue;
    const probe = spawnSync(candidate.command, [...candidate.prefix, '--version'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    if (!probe.error && probe.status === 0) return candidate;
  }
  throw new Error('Python 3 runtime not found');
}

function run(command, args, cwd = ROOT) {
  console.log(`[test-suite] ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { cwd, env: RUN_ENV, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status}`);
}

try {
  const python = resolvePython();
  run(process.execPath, ['--test', 'scripts/invocation-paths.test.mjs']);
  run(process.execPath, ['--test', 'scripts/qa-runs.test.mjs']);
  run(process.execPath, ['scripts/sync-output-contract.mjs', '--check']);
  run(process.execPath, ['--test', 'scripts/setup-migration.test.mjs']);
  run(process.execPath, ['--test', 'scripts/core-skill-router.test.mjs']);
  run(process.execPath, [
    'scripts/benchmark-core-routing.mjs',
    '--output',
    path.join(INVOCATION_ROOT, 'evidence', 'ai-eval', 'core-routing-latest.json'),
  ]);
  run(python.command, [...python.prefix, 'scripts/validate_cross_model.py']);
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
