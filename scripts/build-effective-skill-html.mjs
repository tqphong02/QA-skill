#!/usr/bin/env node

/**
 * Build the recursive QA-skill catalog and render its catalog-v2 companion.
 *
 * The JSON emitted by build-skill-catalog.mjs remains canonical. The
 * render-intelligence-html.mjs output is a self-contained presentation only.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const now = new Date();
const dateLabel = [
  String(now.getDate()).padStart(2, '0'),
  String(now.getMonth() + 1).padStart(2, '0'),
  now.getFullYear(),
].join('-');

function argument(flag, fallback) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? fallback : process.argv[index + 1] || fallback;
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('node scripts/build-effective-skill-html.mjs [--root <repo>] [--bundle <directory>]');
  process.exit(0);
}

const rootArg = argument('--root', root);
const repoRoot = path.resolve(rootArg);
const bundleArg = argument('--bundle', `skill-catalog/QA-skill-effective-html-${dateLabel}`);
const bundleDirectory = path.resolve(repoRoot, bundleArg);
const jsonPath = path.join(bundleDirectory, 'QA-skill-du-lieu.json');
const htmlPath = path.join(bundleDirectory, 'QA-skill.html');
const builder = path.join(repoRoot, 'scripts', 'build-skill-catalog.mjs');
const renderer = path.join(repoRoot, 'qa-run', 'scripts', 'writers', 'render-intelligence-html.mjs');

function run(command, args) {
  const result = spawnSync(process.execPath, [command, ...args], {
    cwd: repoRoot,
    env: { ...process.env },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.relative(repoRoot, command)} exited with ${result.status}`);
}

try {
  if (!fs.existsSync(builder) || !fs.existsSync(renderer)) {
    throw new Error('catalog builder or intelligence renderer is missing');
  }
  run(builder, ['--root', repoRoot, '--bundle', bundleDirectory]);
  run(renderer, [
    '--input', jsonPath,
    '--output', htmlPath,
    '--kind', 'qa-skill-catalog',
  ]);
  run(renderer, ['--check', htmlPath]);
  console.log(`[effective-skill-html] bundle ready: ${bundleDirectory}`);
} catch (error) {
  console.error(`[effective-skill-html] ERROR: ${error.message}`);
  process.exitCode = 1;
}
