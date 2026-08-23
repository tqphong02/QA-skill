#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { findPlaceholders } from './check-placeholders.mjs';
import {
  allPoolSlots,
  configuredPool,
  packageProjectKey,
  poolCapacity,
} from '../fixtures/parallel-pool.js';

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

function validateWorkers(env, violations) {
  const rawWorkers = env.PW_WORKERS?.trim();
  const requestedWorkers = rawWorkers ? Number.parseInt(rawWorkers, 10) : 1;
  if (rawWorkers && (
    !Number.isInteger(requestedWorkers)
    || requestedWorkers < 1
    || String(requestedWorkers) !== rawWorkers
  )) {
    violations.push(violation('CI_WORKERS_INVALID', 'PW_WORKERS must be a positive integer'));
    return null;
  }
  return requestedWorkers;
}

function validateAuth(env, violations, projectRoot, requestedWorkers) {
  const projectKey = packageProjectKey(projectRoot, env);
  const accountEnvironment = configuredPool('ACCOUNTS', projectKey, env);
  if (accountEnvironment) {
    try {
      const slots = allPoolSlots(accountEnvironment.raw, accountEnvironment.name);
      const invalid = slots.some(slot => {
        const hasCredentials = typeof slot.email === 'string' && slot.email.trim()
          && typeof slot.password === 'string' && slot.password;
        const state = typeof slot.storageState === 'string'
          ? slot.storageState
          : typeof slot.storage_state === 'string' ? slot.storage_state : '';
        const hasStorageState = state.trim()
          && fs.existsSync(path.resolve(projectRoot, state));
        return !hasCredentials && !hasStorageState;
      });
      if (slots.length === 0 || invalid) {
        throw new Error('pool slot is missing credentials or a readable storage state');
      }
      if (requestedWorkers !== null) {
        const capacity = poolCapacity(accountEnvironment.raw, 'ACCOUNTS', projectRoot);
        if (capacity < requestedWorkers) {
          violations.push(violation(
            'CI_AUTH_POOL_CAPACITY',
            `${accountEnvironment.name} safe capacity is ${capacity}; PW_WORKERS requests ${requestedWorkers}`,
          ));
        }
      }
      return;
    } catch {
      violations.push(violation(
        'CI_AUTH_JSON_INVALID',
        `${accountEnvironment.name} must contain non-empty, unique account slots with credentials or readable storageState`,
      ));
      return;
    }
  }

  const hasSingleAccount = Boolean(env.TEST_USER && env.TEST_PASS);
  if (hasSingleAccount) {
    if (requestedWorkers > 1) {
      violations.push(violation(
        'CI_AUTH_POOL_REQUIRED',
        'Parallel authentication cannot reuse TEST_USER/TEST_PASS; configure one account slot per worker',
      ));
    }
    return;
  }

  violations.push(violation('CI_AUTH_INPUT_MISSING', 'Set TEST_USER and TEST_PASS, or TEST_ACCOUNTS_JSON, in the CI secret store'));
}

function validateParallelData(env, violations, projectRoot, requestedWorkers) {
  if (requestedWorkers === null || requestedWorkers <= 1) return;
  const projectKey = packageProjectKey(projectRoot, env);
  const datasetEnvironment = configuredPool('DATASETS', projectKey, env);
  if (!datasetEnvironment) {
    violations.push(violation(
      'CI_DATA_POOL_REQUIRED',
      'PW_WORKERS greater than one requires one isolated dataset slot per worker',
    ));
    return;
  }
  try {
    const slots = allPoolSlots(datasetEnvironment.raw, datasetEnvironment.name);
    const capacity = poolCapacity(datasetEnvironment.raw, 'DATASETS', projectRoot);
    if (slots.length === 0 || capacity < requestedWorkers) {
      violations.push(violation(
        'CI_DATA_POOL_CAPACITY',
        `${datasetEnvironment.name} safe capacity is ${capacity}; PW_WORKERS requests ${requestedWorkers}`,
      ));
    }
  } catch {
    violations.push(violation(
      'CI_DATA_JSON_INVALID',
      `${datasetEnvironment.name} must contain non-empty, unique dataset slots`,
    ));
  }
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
  requireFile(resolvedRoot, 'scripts/execution-lock.mjs', violations);
  requireFile(resolvedRoot, 'fixtures/parallel-pool.js', violations);
  requireFile(resolvedRoot, 'fixtures/parallel-pool.d.ts', violations);

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
  if (normalizedSurface === 'api' || normalizedSurface === 'functional' || normalizedSurface === 'all') {
    validateUrl('API_BASE_URL', env.API_BASE_URL, violations);
  }
  const workers = validateWorkers(env, violations);
  if (requireAuth) validateAuth(env, violations, resolvedRoot, workers);
  validateParallelData(env, violations, resolvedRoot, workers);

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
