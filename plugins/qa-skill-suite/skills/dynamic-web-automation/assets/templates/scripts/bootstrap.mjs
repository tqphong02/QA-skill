#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { ensurePlaywrightRuntime } from './bootstrap-playwright.mjs';

function getArg(args, flag, fallback = '') {
  const index = args.indexOf(flag);
  if (index >= 0 && args[index + 1]) return args[index + 1];
  const inline = args.find(value => value.startsWith(`${flag}=`));
  return inline ? inline.slice(flag.length + 1) : fallback;
}

function parseBrowsers(value) {
  return String(value || 'chromium')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

export function bootstrapProject({
  projectRoot = process.cwd(),
  browsers = ['chromium'],
  skipInstall = false,
  skipBrowsers = false,
  skipTypes = false,
  withDeps = false,
} = {}) {
  const resolvedRoot = path.resolve(projectRoot);
  const runtime = ensurePlaywrightRuntime(resolvedRoot, {
    browsers,
    install: !skipInstall,
    installBrowsers: !skipBrowsers,
    checkTypes: !skipTypes,
    withDeps,
  });
  const envPath = path.join(resolvedRoot, '.env');
  const envExamplePath = path.join(resolvedRoot, '.env.example');
  let envStatus = 'EXISTING';
  if (!fs.existsSync(envPath)) {
    if (!fs.existsSync(envExamplePath)) {
      throw new Error(`.env.example is required to create ${envPath}`);
    }
    fs.copyFileSync(envExamplePath, envPath);
    envStatus = 'CREATED';
  }
  return { ...runtime, env: envStatus };
}

function main() {
  const args = process.argv.slice(2);
  const result = bootstrapProject({
    projectRoot: getArg(args, '--project-root', process.cwd()),
    browsers: parseBrowsers(getArg(args, '--browsers', 'chromium')),
    skipInstall: args.includes('--skip-install'),
    skipBrowsers: args.includes('--skip-browsers'),
    skipTypes: args.includes('--skip-types'),
    withDeps: args.includes('--with-deps'),
  });
  console.log(JSON.stringify({ ...result, command: 'bootstrap' }, null, 2));
  console.log('Next: fill .env, then run npm run qa:lint and npm run qa:test:ui. CI runs qa:preflight with exported CI secrets before live tests.');
}

const isDirectRun = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isDirectRun) {
  try {
    main();
  } catch (error) {
    console.error(`[bootstrap] BLOCKED: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}
