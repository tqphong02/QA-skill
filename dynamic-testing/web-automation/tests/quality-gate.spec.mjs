import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(HERE, '../assets/templates/scripts/quality-gate.mjs');

function config() {
  return {
    version: 'test',
    requiredTags: ['@ui', '@api', '@functional'],
    surfaceTags: {
      ui: '@ui',
      api: '@api',
      functional: '@functional',
    },
    evidenceTags: ['@ui', '@functional'],
    browsers: ['chromium', 'firefox'],
    thresholds: {
      minExecuted: 1,
      maxFailed: 0,
      maxFlakeRate: 0.02,
      maxDurationSeconds: 60,
      minEvidenceRate: 1,
      minBranchCoverage: 0,
    },
  };
}

function playwrightReport(results, title = 'TC-001 login @ui') {
  return {
    suites: [{
      title: 'login.ui.spec.ts',
      specs: [{
        title,
        tags: ['@ui'],
        tests: [{
          testId: 'stable-test-id',
          projectName: 'chromium',
          results,
        }],
      }],
    }],
  };
}

function runGate(report, {
  gateConfig = config(),
  args = ['--surface', 'ui', '--project', 'chromium'],
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'quality-gate-'));
  const configPath = path.join(root, 'quality-gates.json');
  const reportPath = path.join(root, 'playwright.json');
  const outputPath = path.join(root, 'quality-gate.json');
  fs.writeFileSync(configPath, JSON.stringify(gateConfig));
  fs.writeFileSync(reportPath, JSON.stringify(report));
  const execution = spawnSync(process.execPath, [
    SCRIPT,
    '--config', configPath,
    '--report', reportPath,
    '--output', outputPath,
    ...args,
  ], { encoding: 'utf8' });
  const output = fs.existsSync(outputPath) ? JSON.parse(fs.readFileSync(outputPath, 'utf8')) : null;
  fs.rmSync(root, { recursive: true, force: true });
  return { execution, output };
}

test('quality gate reads the real suites/specs/tests reporter shape', () => {
  const { execution, output } = runGate(playwrightReport([{
    status: 'passed',
    duration: 25,
    attachments: [{ name: 'evidence-image', path: 'evidence.png' }],
  }]));

  assert.equal(execution.status, 0, execution.stderr);
  assert.equal(output.summary.total, 1);
  assert.equal(output.summary.executed, 1);
  assert.equal(output.summary.failed, 0);
  assert.equal(output.checks.testsDiscovered.pass, true);
});

test('quality gate inherits evidence tags from a nested describe title', () => {
  const report = {
    suites: [{
      title: 'login.ui.spec.ts',
      suites: [{
        title: 'Login @ui',
        specs: [{
          title: 'TC-001 succeeds',
          tests: [{
            testId: 'nested-ui-test',
            projectName: 'chromium',
            results: [{ status: 'passed', duration: 1, attachments: [] }],
          }],
        }],
      }],
    }],
  };

  const { execution, output } = runGate(report);

  assert.equal(execution.status, 1);
  assert.equal(output.summary.evidenceRequired, 1);
  assert.equal(output.checks.evidenceRate.pass, false);
});

test('quality gate blocks a retry-pass even below the configured flake-rate threshold', () => {
  const passingTests = Array.from({ length: 99 }, (_, index) => ({
    title: `TC-${String(index + 2).padStart(3, '0')} stable @api`,
    testId: `stable-${index + 2}`,
    projectName: 'chromium',
    results: [{ status: 'passed', duration: 1, attachments: [] }],
  }));
  const report = {
    suites: [{
      title: 'suite',
      specs: [{
        title: 'TC-001 flaky @api',
        tests: [{
          testId: 'flaky-test',
          projectName: 'chromium',
          results: [
            { status: 'failed', duration: 1, attachments: [] },
            { status: 'passed', duration: 1, attachments: [] },
          ],
        }],
      }, ...passingTests.map(item => ({ title: item.title, tests: [item] }))],
    }],
  };

  const { execution, output } = runGate(report, {
    args: ['--surface', 'api', '--project', 'chromium'],
  });

  assert.equal(execution.status, 1);
  assert.equal(output.summary.total, 100);
  assert.equal(output.summary.flaky, 1);
  assert.equal(output.summary.failed, 1);
  assert.equal(output.checks.flakyRate.pass, true);
  assert.equal(output.checks.failed.pass, false);
  assert.equal(output.tests.find(item => item.id === 'flaky-test').passed, false);
});

test('quality gate blocks an empty Playwright report', () => {
  const { execution, output } = runGate({ suites: [] });

  assert.equal(execution.status, 1);
  assert.equal(output.summary.total, 0);
  assert.equal(output.checks.testsDiscovered.pass, false);
  assert.equal(output.checks.minimumExecuted.pass, false);
});

test('quality gate enforces the selected surface and browser project', () => {
  const strictConfig = {
    ...config(),
    requiredTags: ['@ui', '@api', '@functional'],
    browsers: ['chromium', 'firefox'],
    thresholds: { ...config().thresholds, minExecuted: 1 },
  };
  const { execution, output } = runGate(
    playwrightReport([{
      status: 'passed',
      duration: 1,
      attachments: [{ name: 'evidence-image', path: 'evidence.png' }],
    }]),
    {
      gateConfig: strictConfig,
      args: ['--surface', 'ui', '--project', 'chromium'],
    },
  );

  assert.equal(execution.status, 0, execution.stderr);
  assert.deepEqual(output.checks.requiredSurfaces.actual, { '@ui': 1 });
  assert.deepEqual(output.checks.browserProjects.actual, ['chromium']);
  assert.equal(output.checks.browserProjects.pass, true);
});

test('quality gate blocks missing required surfaces and browser projects on a full run', () => {
  const strictConfig = {
    ...config(),
    requiredTags: ['@ui', '@api', '@functional'],
    browsers: ['chromium', 'firefox'],
    thresholds: { ...config().thresholds, minExecuted: 1 },
  };
  const { execution, output } = runGate(
    playwrightReport([{
      status: 'passed',
      duration: 1,
      attachments: [{ name: 'evidence-image', path: 'evidence.png' }],
    }]),
    { gateConfig: strictConfig, args: ['--surface', 'all'] },
  );

  assert.equal(execution.status, 1);
  assert.deepEqual(output.checks.requiredSurfaces.missing, ['@api', '@functional']);
  assert.deepEqual(output.checks.browserProjects.missing, ['firefox']);
});

test('quality gate enforces only the surfaces detected by a partial CI project', () => {
  const report = {
    suites: [{
      title: 'partial suite',
      specs: [{
        title: 'TC-UI succeeds @ui',
        tags: ['@ui'],
        tests: [{
          testId: 'ui-test',
          projectName: 'chromium',
          results: [{
            status: 'passed',
            duration: 1,
            attachments: [{ name: 'evidence-image', path: 'evidence.png' }],
          }],
        }],
      }, {
        title: 'TC-API succeeds @api',
        tags: ['@api'],
        tests: [{
          testId: 'api-test',
          projectName: 'chromium',
          results: [{ status: 'passed', duration: 1, attachments: [] }],
        }],
      }],
    }],
  };
  const { execution, output } = runGate(report, {
    args: [
      '--surface', 'all',
      '--required-surfaces', 'ui,api',
      '--project', 'chromium',
    ],
  });

  assert.equal(execution.status, 0, execution.stderr);
  assert.deepEqual(output.scope.requiredSurfaces, ['ui', 'api']);
  assert.deepEqual(output.checks.requiredSurfaces.actual, { '@ui': 1, '@api': 1 });
  assert.deepEqual(output.checks.requiredSurfaces.missing, []);
});

test('quality gate does not count a skipped-only suite as executed', () => {
  const strictConfig = {
    ...config(),
    thresholds: { ...config().thresholds, minExecuted: 1 },
  };
  const { execution, output } = runGate(playwrightReport([{ status: 'skipped', duration: 0 }]), {
    gateConfig: strictConfig,
  });

  assert.equal(execution.status, 1);
  assert.equal(output.summary.executed, 0);
  assert.equal(output.summary.skipped, 1);
  assert.equal(output.checks.minimumExecuted.pass, false);
});

test('quality gate rejects configuration that disables browser or surface enforcement', () => {
  const invalidConfig = { ...config(), browsers: [] };
  const { execution, output } = runGate(playwrightReport([{ status: 'passed', duration: 1 }]), {
    gateConfig: invalidConfig,
  });

  assert.notEqual(execution.status, 0);
  assert.equal(output, null);
  assert.match(execution.stderr, /requires at least one non-empty browser project/);
});
