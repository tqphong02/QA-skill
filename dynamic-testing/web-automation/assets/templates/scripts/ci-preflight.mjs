#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { findPlaceholders } from './check-placeholders.mjs';

const SURFACES = new Set(['ui', 'api', 'functional', 'all']);

function getArg(args, flag, fallback = '') {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--')
    ? args[index + 1]
    : fallback;
}

function hasFlag(args, flag) {
  return args.includes(flag);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function violation(code, message) {
  return { code, message };
}

function requireFile(root, relativePath, violations) {
  if (!fs.existsSync(path.join(root, relativePath))) {
    violations.push(violation('CI_FILE_MISSING', `Required CI file is missing: ${relativePath}`));
  }
}

function requireScript(packageJson, name, violations) {
  if (!packageJson?.scripts || typeof packageJson.scripts[name] !== 'string') {
    violations.push(violation('CI_SCRIPT_MISSING', `Required npm script is missing: ${name}`));
  }
}

function validateUrl(name, value, violations) {
  if (!value) {
    violations.push(violation('CI_URL_MISSING', `Required CI environment variable is missing: ${name}`));
    return;
  }
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) throw new Error('invalid protocol or host');
  } catch {
    violations.push(violation('CI_URL_INVALID', `${name} must be an absolute http/https URL`));
  }
}

function validateAuth(env, violations) {
  const hasSingleAccount = Boolean(env.TEST_USER && env.TEST_PASS);
  if (hasSingleAccount) return;

  if (env.TEST_ACCOUNTS_JSON) {
    try {
      const accounts = JSON.parse(env.TEST_ACCOUNTS_JSON);
      if (Array.isArray(accounts) && accounts.length > 0 && accounts.every(item => item && item.email && item.password)) return;
    } catch {
      // Report one typed violation below without echoing the secret value.
    }
    violations.push(violation('CI_AUTH_JSON_INVALID', 'TEST_ACCOUNTS_JSON must be a non-empty array of { email, password } objects'));
    return;
  }

  violations.push(violation('CI_AUTH_INPUT_MISSING', 'Set TEST_USER and TEST_PASS, or TEST_ACCOUNTS_JSON, in the CI secret store'));
}

export function inspectCiPreflight(projectRoot, {
  surface = 'all',
  requireAuth = false,
  env = process.env,
} = {}) {
  const resolvedRoot = path.resolve(projectRoot);
  const violations = [];
  const normalizedSurface = String(surface || 'all').toLowerCase();

  if (!SURFACES.has(normalizedSurface)) {
    violations.push(violation('CI_SURFACE_INVALID', `Unsupported surface: ${surface}; use ui, api, functional or all`));
  }

  const packagePath = path.join(resolvedRoot, 'package.json');
  const lockPath = path.join(resolvedRoot, 'package-lock.json');
  const packageJson = readJson(packagePath);
  const lockJson = readJson(lockPath);

  requireFile(resolvedRoot, 'package.json', violations);
  requireFile(resolvedRoot, 'package-lock.json', violations);
  requireFile(resolvedRoot, 'quality-gates.json', violations);
  requireFile(resolvedRoot, 'scripts/qa.mjs', violations);
  requireFile(resolvedRoot, 'scripts/ci-preflight.mjs', violations);

  if (fs.existsSync(packagePath) && !packageJson) {
    violations.push(violation('CI_PACKAGE_JSON_INVALID', 'package.json is not valid JSON'));
  }
  if (fs.existsSync(lockPath) && !lockJson) {
    violations.push(violation('CI_LOCKFILE_INVALID', 'package-lock.json is not valid JSON'));
  }
  if (lockJson && (!Number.isInteger(lockJson.lockfileVersion) || lockJson.lockfileVersion < 2)) {
    violations.push(violation('CI_LOCKFILE_UNSUPPORTED', 'package-lock.json must use lockfileVersion 2 or newer for npm ci'));
  }

  if (packageJson) {
    for (const script of ['qa:lint', 'qa:preflight', 'qa:quality', 'qa:contract', 'qa:report', 'qa:merge-allure']) {
      requireScript(packageJson, script, violations);
    }
    if (normalizedSurface === 'ui' || normalizedSurface === 'all') requireScript(packageJson, 'qa:test:ui', violations);
    if (normalizedSurface === 'api' || normalizedSurface === 'all') requireScript(packageJson, 'qa:test:api', violations);
    if (normalizedSurface === 'functional' || normalizedSurface === 'all') requireScript(packageJson, 'qa:test:functional', violations);
  }

  if (normalizedSurface === 'ui' || normalizedSurface === 'functional' || normalizedSurface === 'all') {
    requireFile(resolvedRoot, 'playwright.config.ts', violations);
  }

  for (const item of findPlaceholders({ root: resolvedRoot })) {
    violations.push(violation(
      'CI_PLACEHOLDER_UNRESOLVED',
      `Unresolved placeholder: ${item.file}:${item.line} ${item.token}`,
    ));
  }

  if (normalizedSurface === 'ui' || normalizedSurface === 'functional' || normalizedSurface === 'all') {
    validateUrl('UI_BASE_URL or BASE_URL', env.UI_BASE_URL || env.BASE_URL, violations);
  }
  if (normalizedSurface === 'api' || normalizedSurface === 'all') {
    validateUrl('API_BASE_URL', env.API_BASE_URL, violations);
  }
  if (requireAuth) validateAuth(env, violations);

  return {
    status: violations.length > 0 ? 'BLOCKED' : 'PASS',
    project_root: resolvedRoot,
    surface: normalizedSurface,
    require_auth: requireAuth,
    violations,
  };
}

function main(args = process.argv.slice(2)) {
  const projectRoot = path.resolve(getArg(args, '--project-root', process.cwd()));
  const result = inspectCiPreflight(projectRoot, {
    surface: getArg(args, '--surface', 'all'),
    requireAuth: hasFlag(args, '--require-auth'),
  });

  if (result.status === 'PASS') {
    console.log(`PASS: CI preflight (${result.surface})`);
    return;
  }

  console.error(`BLOCKED: CI preflight (${result.surface})`);
  for (const item of result.violations) console.error(`  ${item.code}: ${item.message}`);
  process.exitCode = 1;
}

const isDirectRun = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isDirectRun) {
  try {
    main();
  } catch (error) {
    console.error(`[ci-preflight] BLOCKED: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}
