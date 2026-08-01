#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function collectTests(suites, output = []) {
  for (const suite of suites ?? []) {
    if (suite.tests) output.push(...suite.tests);
    collectTests(suite.suites, output);
  }
  return output;
}

function evaluate(config, report) {
  const tests = collectTests(report.suites);
  const rows = tests.map(test => {
    const results = test.results ?? [];
    const statuses = results.map(result => result.status);
    const passed = statuses.includes('passed');
    const skipped = statuses.length > 0 && statuses.every(status => status === 'skipped');
    const failedBeforePass = passed && statuses.some(status => ['failed', 'timedOut', 'interrupted'].includes(status));
    const evidence = results.some(result => (result.attachments ?? []).some(attachment =>
      /\.(png|jpe?g|webp|gif|mp4|webm|mov|m4v)$/i.test(attachment.path ?? attachment.name ?? '')));
    const evidenceTags = config.evidenceTags ?? ['@ui', '@functional'];
    const requiresEvidence = evidenceTags.some(tag => String(test.title ?? '').includes(tag));
    return { id: test.testId ?? test.title, passed, skipped, flaky: failedBeforePass, evidence, requiresEvidence, duration: results.reduce((sum, result) => sum + (result.duration ?? 0), 0) };
  });
  const executed = rows.filter(row => !row.skipped);
  const failed = executed.filter(row => !row.passed && !row.flaky).length;
  const flaky = executed.filter(row => row.flaky).length;
  const durationSeconds = executed.reduce((sum, row) => sum + row.duration, 0) / 1000;
  const evidenceRequired = executed.filter(row => row.requiresEvidence);
  const evidenceRate = evidenceRequired.length ? evidenceRequired.filter(row => row.evidence).length / evidenceRequired.length : 1;
  const branchCoverage = Number(report.branchCoverage ?? 0);
  const thresholds = config.thresholds ?? {};
  const checks = {
    failed: { actual: failed, limit: thresholds.maxFailed ?? 0, pass: failed <= (thresholds.maxFailed ?? 0) },
    flakyRate: { actual: executed.length ? flaky / executed.length : 0, limit: thresholds.maxFlakeRate ?? 0, pass: executed.length ? flaky / executed.length <= (thresholds.maxFlakeRate ?? 0) : true },
    durationSeconds: { actual: durationSeconds, limit: thresholds.maxDurationSeconds ?? Number.POSITIVE_INFINITY, pass: durationSeconds <= (thresholds.maxDurationSeconds ?? Number.POSITIVE_INFINITY) },
    evidenceRate: { actual: evidenceRate, limit: thresholds.minEvidenceRate ?? 0, pass: evidenceRate >= (thresholds.minEvidenceRate ?? 0) },
    branchCoverage: { actual: branchCoverage, limit: thresholds.minBranchCoverage ?? 0, pass: branchCoverage >= (thresholds.minBranchCoverage ?? 0) },
  };
  return { version: config.version, passed: Object.values(checks).every(check => check.pass), summary: { total: rows.length, executed: executed.length, skipped: rows.length - executed.length, failed, flaky, durationSeconds, evidenceRate, evidenceRequired: evidenceRequired.length, branchCoverage }, checks, tests: rows };
}

const configPath = path.resolve(arg('--config', 'quality-gates.json'));
const reportPath = path.resolve(arg('--report', 'reports/playwright.json'));
const outputPath = path.resolve(arg('--output', 'reports/quality-gate.json'));

if (!fs.existsSync(configPath)) throw new Error(`Quality gate config not found: ${configPath}`);
if (!fs.existsSync(reportPath)) throw new Error(`Playwright JSON report not found: ${reportPath}`);
const result = evaluate(readJson(configPath), readJson(reportPath));
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ passed: result.passed, output: outputPath, summary: result.summary }, null, 2));
if (!result.passed) process.exitCode = 1;
