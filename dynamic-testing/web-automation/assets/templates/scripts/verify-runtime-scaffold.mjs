#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function getArg(flag, fallback = '') {
  const index = process.argv.indexOf(flag);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function relative(projectRoot, filePath) {
  return path.relative(projectRoot, filePath).replaceAll(path.sep, '/');
}

function specFiles(root) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  const visit = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (/\.spec\.[cm]?[jt]sx?$/.test(entry.name)) files.push(target);
    }
  };
  visit(root);
  return files.sort();
}

function requireFile(projectRoot, relativePath, violations) {
  const filePath = path.join(projectRoot, relativePath);
  if (!fs.existsSync(filePath)) {
    violations.push({ code: 'RUNTIME_FILE_MISSING', file: relativePath });
  }
}

function requirePattern(source, pattern, code, file, violations) {
  if (!pattern.test(source)) violations.push({ code, file });
}

export function inspectRuntimeScaffold(projectRoot, { testRoot = 'tests' } = {}) {
  const resolvedRoot = path.resolve(projectRoot);
  const violations = [];
  const configPath = path.join(resolvedRoot, 'playwright.config.ts');

  requireFile(resolvedRoot, 'fixtures/pom.ts', violations);
  requireFile(resolvedRoot, 'fixtures/api-client.ts', violations);
  requireFile(resolvedRoot, 'fixtures/auth.ts', violations);
  requireFile(resolvedRoot, 'fixtures/data-driven.ts', violations);
  requireFile(resolvedRoot, 'fixtures/runtime-context.ts', violations);
  requireFile(resolvedRoot, 'fixtures/allure-contract.ts', violations);
  requireFile(resolvedRoot, 'fixtures/parallel-pool.js', violations);
  requireFile(resolvedRoot, 'fixtures/parallel-pool.d.ts', violations);
  requireFile(resolvedRoot, 'scripts/artifact-naming.mjs', violations);
  requireFile(resolvedRoot, 'scripts/generate-pom-code.mjs', violations);
  requireFile(resolvedRoot, 'scripts/execution-lock.mjs', violations);
  requireFile(resolvedRoot, 'scripts/verify-module-artifact-layout.mjs', violations);
  requireFile(resolvedRoot, 'scripts/verify-api-operation-coverage.mjs', violations);
  requireFile(resolvedRoot, 'scripts/verify-allure-contract.mjs', violations);
  requireFile(resolvedRoot, 'scripts/qa.mjs', violations);
  requireFile(resolvedRoot, 'scripts/merge-allure-results.mjs', violations);
  requireFile(resolvedRoot, 'playwright.config.ts', violations);

  const pomPath = path.join(resolvedRoot, 'fixtures/pom.ts');
  if (fs.existsSync(pomPath)) {
    const pomSource = fs.readFileSync(pomPath, 'utf8');
    requirePattern(
      pomSource,
      /captureCanonicalUiEvidence/,
      'CANONICAL_ALLURE_FIXTURE_MISSING',
      'fixtures/pom.ts',
      violations,
    );
    for (const [fixture, code] of [
      ['api', 'CANONICAL_API_FIXTURE_MISSING'],
      ['authenticatedApi', 'CANONICAL_AUTHENTICATED_API_FIXTURE_MISSING'],
      ['testData', 'CANONICAL_TEST_DATA_FIXTURE_MISSING'],
      ['workerAccount', 'CANONICAL_WORKER_ACCOUNT_FIXTURE_MISSING'],
    ]) {
      requirePattern(
        pomSource,
        new RegExp(`\\b${fixture}\\s*:`),
        code,
        'fixtures/pom.ts',
        violations,
      );
    }
  }

  if (fs.existsSync(configPath)) {
    const source = fs.readFileSync(configPath, 'utf8');
    requirePattern(source, /\bPW_WORKERS\b/, 'DYNAMIC_WORKERS_MISSING', 'playwright.config.ts', violations);
    requirePattern(source, /\bQA_UNIFIED_EVIDENCE\b/, 'EVIDENCE_SWITCH_MISSING', 'playwright.config.ts', violations);
    requirePattern(
      source,
      /outputDir\s*:\s*(?:process\.env\.[A-Z0-9_]+\s*\?\?\s*)?['"]evidence\/test-results['"]/,
      'EVIDENCE_OUTPUT_MISSING',
      'playwright.config.ts',
      violations,
    );
    requirePattern(source, /\btrace\s*:/, 'TRACE_POLICY_MISSING', 'playwright.config.ts', violations);
    requirePattern(source, /\bscreenshot\s*:/, 'SCREENSHOT_POLICY_MISSING', 'playwright.config.ts', violations);
    requirePattern(source, /\bvideo\s*:/, 'VIDEO_POLICY_MISSING', 'playwright.config.ts', violations);
    requirePattern(source, /reports\/playwright\.json/, 'JSON_REPORTER_MISSING', 'playwright.config.ts', violations);
    requirePattern(source, /allure-playwright/, 'ALLURE_REPORTER_MISSING', 'playwright.config.ts', violations);
    requirePattern(
      source,
      /resultsDir\s*:\s*['"]reports\/allure-results['"]/,
      'ALLURE_RESULTS_DIR_MISSING',
      'playwright.config.ts',
      violations,
    );
    requirePattern(source, /detail\s*:\s*true/, 'ALLURE_DETAIL_POLICY_MISSING', 'playwright.config.ts', violations);
    requirePattern(source, /suiteTitle\s*:\s*false/, 'ALLURE_SUITE_POLICY_MISSING', 'playwright.config.ts', violations);
    requirePattern(source, /screenshot\s*:\s*['"]off['"]/, 'CANONICAL_SCREENSHOT_POLICY_MISSING', 'playwright.config.ts', violations);
    requirePattern(source, /video\s*:\s*['"]on['"]/, 'CANONICAL_VIDEO_POLICY_MISSING', 'playwright.config.ts', violations);
  }

  const generatedSpecs = specFiles(path.join(resolvedRoot, testRoot)).filter(filePath => (
    fs.readFileSync(filePath, 'utf8').includes('[AUTOMATION_SOURCE:')
  ));
  for (const filePath of generatedSpecs) {
    const source = fs.readFileSync(filePath, 'utf8');
    const file = relative(resolvedRoot, filePath);
    if (/from\s+['"]@playwright\/test['"]/.test(source)) {
      violations.push({ code: 'GENERATED_SPEC_BYPASSES_POM_FIXTURE', file });
    }
    if (!/from\s+['"][^'"]*fixtures\/pom(?:\.[cm]?[jt]s)?['"]/.test(source)) {
      violations.push({ code: 'GENERATED_SPEC_POM_FIXTURE_MISSING', file });
    }
    if (/from\s+['"]allure-playwright['"]/.test(source)) {
      violations.push({ code: 'GENERATED_SPEC_BYPASSES_ALLURE_FIXTURE', file });
    }
    if (/async\s*\(\s*\{[^}]*\brequest\b[^}]*\}/s.test(source)) {
      violations.push({ code: 'GENERATED_SPEC_BYPASSES_API_FIXTURE', file });
    }
  }

  return {
    status: violations.length > 0 ? 'BLOCKED' : 'PASS',
    project_root: resolvedRoot,
    generated_spec_count: generatedSpecs.length,
    fixture_entrypoint: 'fixtures/pom.ts',
    command_entrypoint: 'scripts/qa.mjs',
    evidence_root: 'evidence',
    violations,
  };
}

function main() {
  const projectRoot = path.resolve(getArg('--project-root', process.cwd()));
  const result = inspectRuntimeScaffold(projectRoot, { testRoot: getArg('--test-root', 'tests') });
  const outputArg = getArg('--output');
  if (outputArg) {
    const outputPath = path.resolve(projectRoot, outputArg);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  }
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'PASS') process.exitCode = 2;
}

const isDirectRun = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isDirectRun) {
  try {
    main();
  } catch (error) {
    console.error(`[runtime-scaffold] BLOCKED: ${error.message}`);
    process.exitCode = 2;
  }
}
