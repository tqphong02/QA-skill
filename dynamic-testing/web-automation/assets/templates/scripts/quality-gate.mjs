#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith('--')) {
    return process.argv[index + 1];
  }
  const inline = process.argv.find(value => value.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1) : fallback;
}

function args(name) {
  const values = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    const value = process.argv[index];
    if (value === name && process.argv[index + 1] && !process.argv[index + 1].startsWith('--')) {
      values.push(process.argv[index + 1]);
      index += 1;
    } else if (value.startsWith(`${name}=`)) {
      values.push(value.slice(name.length + 1));
    }
  }
  return values.flatMap(value => value.split(',')).map(value => value.trim()).filter(Boolean);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function normalizedTest(test, titleParts, inheritedTags = []) {
  const title = [...titleParts, test.title].filter(Boolean).join(' › ');
  const explicitTags = [
    ...inheritedTags,
    ...(Array.isArray(test.tags) ? test.tags : []),
  ].map(tag => String(tag));
  const titleTags = title.match(/@[\w-]+/g) ?? [];
  return {
    ...test,
    title,
    tags: [...new Set([...explicitTags, ...titleTags])],
  };
}

function collectTests(suites, output = [], parentTitles = [], parentTags = []) {
  for (const suite of suites ?? []) {
    const suiteTitles = [...parentTitles, suite.title].filter(Boolean);
    const suiteTags = [
      ...parentTags,
      ...(Array.isArray(suite.tags) ? suite.tags : []),
      ...((suite.title ?? '').match(/@[\w-]+/g) ?? []),
    ];
    if (Array.isArray(suite.tests)) {
      output.push(...suite.tests.map(test => normalizedTest(test, suiteTitles, suiteTags)));
    }
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        output.push(normalizedTest(
          test,
          [...suiteTitles, spec.title],
          [...suiteTags, ...(Array.isArray(spec.tags) ? spec.tags : [])],
        ));
      }
    }
    collectTests(suite.suites, output, suiteTitles, suiteTags);
  }
  return output;
}

function normalizedSurface(value) {
  const surface = String(value || 'all').toLowerCase();
  if (!['ui', 'api', 'functional', 'all'].includes(surface)) {
    throw new Error(`Unknown quality-gate surface: ${value}. Expected ui, api, functional or all`);
  }
  return surface;
}

function tagsForSurface(config, surface) {
  const configured = Array.isArray(config.requiredTags)
    ? config.requiredTags.map(value => String(value))
    : [];
  if (surface === 'all') return configured;
  const mapped = config.surfaceTags?.[surface] ?? `@${surface}`;
  return configured.includes(mapped) || config.surfaceTags?.[surface] ? [mapped] : [];
}

function testHasTag(row, tag) {
  return row.tags.includes(tag) || row.title.includes(tag);
}

function validateConfig(config) {
  const requiredTags = Array.isArray(config.requiredTags) ? config.requiredTags : [];
  const browsers = Array.isArray(config.browsers) ? config.browsers : [];
  const requiredSurfaces = ['ui', 'api', 'functional'];
  const minimumExecuted = Number(config.thresholds?.minExecuted);
  if (!config.version || !config.thresholds) {
    throw new Error('quality-gates.json requires version and thresholds');
  }
  if (!Number.isInteger(minimumExecuted) || minimumExecuted < 1) {
    throw new Error('quality-gates.json requires thresholds.minExecuted >= 1');
  }
  if (browsers.length === 0 || browsers.some(value => typeof value !== 'string' || !value.trim())) {
    throw new Error('quality-gates.json requires at least one non-empty browser project');
  }
  for (const surface of requiredSurfaces) {
    const tag = config.surfaceTags?.[surface];
    if (typeof tag !== 'string' || !tag.startsWith('@') || !requiredTags.includes(tag)) {
      throw new Error(`quality-gates.json must map surfaceTags.${surface} to a requiredTags entry`);
    }
  }
  return config;
}

export function evaluate(config, report, {
  surface = 'all',
  expectedProjects = [],
} = {}) {
  validateConfig(config);
  const selectedSurface = normalizedSurface(surface);
  const tests = collectTests(report.suites);
  const rows = tests.map(test => {
    const results = test.results ?? [];
    const statuses = results.map(result => result.status);
    const attemptPassed = statuses.includes('passed');
    const skipped = statuses.length > 0 && statuses.every(status => status === 'skipped');
    const executed = statuses.length > 0 && !skipped;
    const flaky = attemptPassed && statuses.some(status => ['failed', 'timedOut', 'interrupted'].includes(status));
    // Repository invariant: a retry-pass is FAILED with flaky=true, never a
    // clean PASS. Keep maxFlakeRate as a trend/release threshold, but do not let
    // a low flake rate override the testcase verdict.
    const passed = attemptPassed && !flaky;
    const evidence = results.some(result => (result.attachments ?? []).some(attachment =>
      /\.(png|jpe?g|webp|gif|mp4|webm|mov|m4v)$/i.test(attachment.path ?? attachment.name ?? '')));
    const evidenceTags = config.evidenceTags ?? ['@ui', '@functional'];
    const title = String(test.title ?? '');
    const tags = Array.isArray(test.tags) ? test.tags.map(tag => String(tag)) : [];
    const requiresEvidence = evidenceTags.some(tag => title.includes(tag) || tags.includes(tag));
    return {
      id: test.testId ?? title,
      title,
      tags,
      project: String(test.projectName || ''),
      passed,
      skipped,
      executed,
      flaky,
      evidence,
      requiresEvidence,
      duration: results.reduce((sum, result) => sum + (result.duration ?? 0), 0),
    };
  });
  const executed = rows.filter(row => row.executed);
  const failed = executed.filter(row => !row.passed).length;
  const flaky = executed.filter(row => row.flaky).length;
  const durationSeconds = executed.reduce((sum, row) => sum + row.duration, 0) / 1000;
  const evidenceRequired = executed.filter(row => row.requiresEvidence);
  const evidenceRate = evidenceRequired.length ? evidenceRequired.filter(row => row.evidence).length / evidenceRequired.length : 1;
  const branchCoverage = Number(report.branchCoverage ?? 0);
  const thresholds = config.thresholds ?? {};
  const minimumExecuted = Number(thresholds.minExecuted ?? 1);
  const requiredTags = tagsForSurface(config, selectedSurface);
  const requiredTagCounts = Object.fromEntries(requiredTags.map(tag => [
    tag,
    executed.filter(row => testHasTag(row, tag)).length,
  ]));
  const missingTags = requiredTags.filter(tag => requiredTagCounts[tag] < 1);
  const configuredBrowsers = Array.isArray(config.browsers)
    ? config.browsers.map(value => String(value))
    : [];
  const requestedProjects = [...new Set(expectedProjects.map(value => String(value)).filter(Boolean))];
  const requiredProjects = requestedProjects.length > 0 ? requestedProjects : configuredBrowsers;
  const observedProjects = [...new Set(executed.map(row => row.project).filter(Boolean))].sort();
  const missingProjects = requiredProjects.filter(project => !observedProjects.includes(project));
  const unexpectedProjects = configuredBrowsers.length > 0
    ? observedProjects.filter(project => !configuredBrowsers.includes(project))
    : [];
  const unsupportedRequestedProjects = configuredBrowsers.length > 0
    ? requestedProjects.filter(project => !configuredBrowsers.includes(project))
    : [];
  const checks = {
    testsDiscovered: { actual: rows.length, limit: 1, pass: rows.length >= 1 },
    minimumExecuted: {
      actual: executed.length,
      limit: minimumExecuted,
      pass: Number.isInteger(minimumExecuted) && minimumExecuted >= 1 && executed.length >= minimumExecuted,
    },
    requiredSurfaces: {
      actual: requiredTagCounts,
      limit: requiredTags,
      missing: missingTags,
      pass: missingTags.length === 0,
    },
    browserProjects: {
      actual: observedProjects,
      limit: requiredProjects,
      missing: missingProjects,
      unexpected: unexpectedProjects,
      unsupported_requested: unsupportedRequestedProjects,
      pass: missingProjects.length === 0
        && unexpectedProjects.length === 0
        && unsupportedRequestedProjects.length === 0,
    },
    failed: { actual: failed, limit: thresholds.maxFailed ?? 0, pass: failed <= (thresholds.maxFailed ?? 0) },
    flakyRate: { actual: executed.length ? flaky / executed.length : 0, limit: thresholds.maxFlakeRate ?? 0, pass: executed.length ? flaky / executed.length <= (thresholds.maxFlakeRate ?? 0) : true },
    durationSeconds: { actual: durationSeconds, limit: thresholds.maxDurationSeconds ?? Number.POSITIVE_INFINITY, pass: durationSeconds <= (thresholds.maxDurationSeconds ?? Number.POSITIVE_INFINITY) },
    evidenceRate: { actual: evidenceRate, limit: thresholds.minEvidenceRate ?? 0, pass: evidenceRate >= (thresholds.minEvidenceRate ?? 0) },
    branchCoverage: { actual: branchCoverage, limit: thresholds.minBranchCoverage ?? 0, pass: branchCoverage >= (thresholds.minBranchCoverage ?? 0) },
  };
  return {
    version: config.version,
    passed: Object.values(checks).every(check => check.pass),
    scope: { surface: selectedSurface, expectedProjects: requiredProjects },
    summary: {
      total: rows.length,
      executed: executed.length,
      skipped: rows.filter(row => row.skipped).length,
      notRun: rows.filter(row => !row.executed && !row.skipped).length,
      failed,
      flaky,
      durationSeconds,
      evidenceRate,
      evidenceRequired: evidenceRequired.length,
      branchCoverage,
    },
    checks,
    tests: rows,
  };
}

const configPath = path.resolve(arg('--config', 'quality-gates.json'));
const reportPath = path.resolve(arg('--report', 'reports/playwright.json'));
const outputPath = path.resolve(arg('--output', 'reports/quality-gate.json'));

if (!fs.existsSync(configPath)) throw new Error(`Quality gate config not found: ${configPath}`);
const config = validateConfig(readJson(configPath));
if (process.argv.includes('--validate-config')) {
  console.log(JSON.stringify({ status: 'PASS', config: configPath }, null, 2));
  process.exit(0);
}
if (!fs.existsSync(reportPath)) throw new Error(`Playwright JSON report not found: ${reportPath}`);
const result = evaluate(config, readJson(reportPath), {
  surface: arg('--surface', 'all'),
  expectedProjects: args('--project'),
});
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ passed: result.passed, output: outputPath, summary: result.summary }, null, 2));
if (!result.passed) process.exitCode = 1;
