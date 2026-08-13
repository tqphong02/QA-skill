#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensurePlaywrightRuntime } from './bootstrap-playwright.mjs';
import { buildPomPlan } from './generate-pom-plan.mjs';
import { inspectRuntimeScaffold } from './verify-runtime-scaffold.mjs';
import { buildTraceability } from './verify-testcase-traceability.mjs';

const VALID_PHASES = new Set(['plan', 'execute']);
const VISUAL_RE = /\.(?:png|jpe?g|webp|gif|mp4|webm|mov|m4v)$/i;
const TRACE_RE = /(?:trace|network|console).*\.zip$|\.zip$/i;

function getArg(flag, fallback = '') {
  const index = process.argv.indexOf(flag);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function resolveFrom(root, value, fallback) {
  const selected = value || fallback;
  return path.isAbsolute(selected) ? selected : path.resolve(root, selected);
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function collectTests(suites, output = []) {
  for (const suite of suites || []) {
    if (Array.isArray(suite.tests)) output.push(...suite.tests);
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        output.push({
          ...test,
          title: spec.title || test.title || test.testId || '',
          spec_file: spec.file || suite.file || null,
        });
      }
    }
    collectTests(suite.suites, output);
  }
  return output;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function existingAttachmentPaths(results, projectRoot) {
  const values = [];
  for (const result of results) {
    for (const attachment of result.attachments || []) {
      if (!attachment.path) continue;
      const absolutePath = path.isAbsolute(attachment.path)
        ? attachment.path
        : path.resolve(projectRoot, attachment.path);
      if (!fs.existsSync(absolutePath)) continue;
      values.push({
        name: attachment.name || path.basename(absolutePath),
        path: absolutePath,
        content_type: attachment.contentType || null,
      });
    }
  }
  return values;
}

function verdictForMatches(matches, projectRoot, mode) {
  if (matches.length === 0) {
    return {
      verdict: 'UNTEST',
      note: 'Không tìm thấy Playwright test khớp Testcase ID',
      statuses: [],
      duration_ms: 0,
      flaky: false,
      evidence: { visual: [], observer: [] },
    };
  }
  const results = matches.flatMap(item => item.results || []);
  const statuses = results.map(item => String(item.status || 'unknown'));
  const attachments = existingAttachmentPaths(results, projectRoot);
  const visual = attachments.filter(item => VISUAL_RE.test(item.path));
  const observer = attachments.filter(item => TRACE_RE.test(item.path));
  const passed = statuses.includes('passed');
  const failed = statuses.includes('failed');
  const interrupted = statuses.some(status => ['timedOut', 'interrupted', 'unknown'].includes(status));
  const skipped = statuses.length > 0 && statuses.every(status => status === 'skipped');
  const flaky = passed && statuses.some(status => ['failed', 'timedOut', 'interrupted'].includes(status));
  const needsBrowserEvidence = ['ui', 'functional'].includes(mode);

  let verdict = 'UNTEST';
  let note = 'Playwright không trả về trạng thái kết luận được';
  if (skipped) {
    verdict = 'N/A';
    note = 'Playwright test bị skip theo điều kiện suite';
  } else if (flaky) {
    verdict = 'FAILED';
    note = 'Retry-pass được phân loại flaky, không nâng thành PASS sạch';
  } else if (failed) {
    verdict = 'FAILED';
    note = 'Playwright assertion hoặc hành động thất bại';
  } else if (interrupted) {
    verdict = 'UNTEST';
    note = 'Playwright bị timeout hoặc gián đoạn trước khi đủ bằng chứng';
  } else if (passed) {
    verdict = 'PASS';
    note = 'Playwright hoàn tất và assertion đạt';
  }

  if (needsBrowserEvidence && ['PASS', 'FAILED'].includes(verdict)) {
    if (visual.length === 0 || observer.length === 0) {
      verdict = 'UNTEST';
      note = 'Thiếu screenshot/video hoặc Playwright trace cùng session';
    }
  }

  return {
    verdict,
    note,
    statuses,
    duration_ms: results.reduce((total, item) => total + Number(item.duration || 0), 0),
    flaky,
    evidence: {
      visual: visual.map(item => item.path),
      observer: observer.map(item => item.path),
    },
  };
}

function overallVerdict(results) {
  if (results.some(item => item.verdict === 'FAILED')) return 'FAILED';
  if (results.some(item => item.verdict === 'UNTEST')) return 'UNTEST';
  if (results.length > 0 && results.every(item => item.verdict === 'N/A')) return 'N/A';
  return results.length > 0 ? 'PASS' : 'UNTEST';
}

export function normalizePlaywrightReport(report, plan, {
  projectRoot = process.cwd(),
  mode = 'ui',
  runId = 'playwright-run',
} = {}) {
  const tests = collectTests(report.suites);
  const results = plan.testcases.map(testcase => {
    const idPattern = new RegExp(`(?:^|[^A-Za-z0-9_-])${escapeRegex(testcase.testcase_id)}(?:$|[^A-Za-z0-9_-])`);
    const matches = tests.filter(item => idPattern.test(String(item.title || item.testId || '')));
    const normalized = verdictForMatches(matches, projectRoot, mode);
    return {
      testcase_id: testcase.testcase_id,
      group: testcase.group || null,
      scenario_id: testcase.scenario_id || null,
      requirement: testcase.requirement || null,
      priority: testcase.priority || 'Medium',
      verdict: normalized.verdict,
      sheet_result: {
        PASS: 'Pass', FAILED: 'Fail', 'N/A': 'N/A', UNTEST: 'Untest',
      }[normalized.verdict],
      note: normalized.note,
      statuses: normalized.statuses,
      duration_ms: normalized.duration_ms,
      flaky: normalized.flaky,
      evidence: normalized.evidence,
    };
  });
  return {
    schema_version: 1,
    workflow: 'TESTCASE_POM_EXECUTION',
    run_id: runId,
    source_manifest: plan.source_manifest,
    source_manifest_sha256: plan.source_manifest_sha256,
    mode,
    verdict: overallVerdict(results),
    summary: {
      total: results.length,
      pass: results.filter(item => item.verdict === 'PASS').length,
      failed: results.filter(item => item.verdict === 'FAILED').length,
      not_applicable: results.filter(item => item.verdict === 'N/A').length,
      untest: results.filter(item => item.verdict === 'UNTEST').length,
      flaky: results.filter(item => item.flaky).length,
    },
    results,
  };
}

export function buildSheetResults(executionReport, sheetPlan) {
  const rowsById = new Map();
  for (const assignment of sheetPlan?.assignments || []) {
    for (const testcase of assignment.testcases || []) {
      const id = String(testcase.testcase_id || '').replace(/^\[|\]$/g, '').trim();
      if (!id) continue;
      if (rowsById.has(id)) throw new Error(`Sheet plan trùng testcase_id: ${id}`);
      rowsById.set(id, testcase);
    }
  }
  return {
    run_id: executionReport.run_id,
    worker_id: 'unified-pom',
    results: executionReport.results.map(result => {
      const sheetCase = rowsById.get(result.testcase_id);
      if (!sheetCase || !Number.isInteger(Number(sheetCase.row_number))) {
        throw new Error(`Không tìm thấy row_number cho ${result.testcase_id} trong Sheet plan`);
      }
      return {
        row_number: Number(sheetCase.row_number),
        testcase_id: result.testcase_id,
        result: result.sheet_result,
        priority: result.priority || sheetCase.priority || 'Medium',
        note: result.note,
        evidence: [
          ...(result.evidence?.visual || []),
          ...(result.evidence?.observer || []),
        ],
      };
    }),
  };
}

function untestReport(plan, reason, runId, mode) {
  return {
    schema_version: 1,
    workflow: 'TESTCASE_POM_EXECUTION',
    run_id: runId,
    source_manifest: plan.source_manifest,
    source_manifest_sha256: plan.source_manifest_sha256,
    mode,
    verdict: 'UNTEST',
    summary: { total: plan.testcases.length, pass: 0, failed: 0, not_applicable: 0, untest: plan.testcases.length, flaky: 0 },
    results: plan.testcases.map(testcase => ({
      testcase_id: testcase.testcase_id,
      group: testcase.group || null,
      scenario_id: testcase.scenario_id || null,
      requirement: testcase.requirement || null,
      priority: testcase.priority || 'Medium',
      verdict: 'UNTEST',
      sheet_result: 'Untest',
      note: reason,
      statuses: [],
      duration_ms: 0,
      flaky: false,
      evidence: { visual: [], observer: [] },
    })),
  };
}

function selectedPlan(manifestPath, maxCases) {
  const testcaseIds = getArg('--testcase-id')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  const plan = buildPomPlan(manifestPath, { testcaseIds, group: getArg('--group') });
  if (plan.testcases.length === 0) throw new Error('BLOCKED: selection contains no testcases');
  if (plan.testcases.length > maxCases) {
    throw new Error(`BLOCKED: selection contains ${plan.testcases.length} cases; maximum is ${maxCases}`);
  }
  return plan;
}

async function main() {
  const phase = getArg('--phase', 'execute').toLowerCase();
  if (!VALID_PHASES.has(phase)) throw new Error('--phase must be plan or execute');
  const projectRoot = path.resolve(getArg('--project-root', process.cwd()));
  const manifestPath = resolveFrom(projectRoot, getArg('--manifest'), '');
  if (!getArg('--manifest') || !fs.existsSync(manifestPath)) throw new Error('--manifest is required and must exist');
  const maxCases = Number(getArg('--max-cases', '20'));
  if (!Number.isInteger(maxCases) || maxCases < 1) throw new Error('--max-cases must be a positive integer');
  const plan = selectedPlan(manifestPath, maxCases);
  const planPath = resolveFrom(projectRoot, getArg('--plan-output'), 'reports/testcase-pom-plan.json');
  writeJson(planPath, plan);
  if (phase === 'plan') {
    console.log(JSON.stringify({ status: 'READY_FOR_CODE', plan: planPath, testcase_count: plan.testcases.length }, null, 2));
    return;
  }

  const mode = getArg('--mode', 'ui').toLowerCase();
  const runId = getArg('--run-id', `pom-${Date.now()}`);
  const resultPath = resolveFrom(projectRoot, getArg('--output'), 'reports/testcase-pom-execution.json');
  const testcasePath = resolveFrom(projectRoot, getArg('--testcases'), '');
  const appBuild = getArg('--app-build');
  if (!getArg('--testcases') || !fs.existsSync(testcasePath)) throw new Error('--testcases Markdown is required for execute');
  if (['ui', 'functional'].includes(mode) && !appBuild) throw new Error('--app-build is required for UI/functional execute');

  let runtimeBootstrap = null;
  if (!process.argv.includes('--skip-bootstrap')) {
    try {
      runtimeBootstrap = ensurePlaywrightRuntime(projectRoot, {
        browsers: getArg('--browsers', 'chromium').split(',').map(value => value.trim()).filter(Boolean),
        checkTypes: !process.argv.includes('--skip-types'),
        withDeps: process.argv.includes('--with-deps'),
      });
    } catch (error) {
      const report = untestReport(plan, `Playwright runtime bootstrap không chạy được: ${error.message}`, runId, mode);
      report.bootstrap = { status: 'BLOCKED', reason: error.message };
      writeJson(resultPath, report);
      console.log(JSON.stringify({ verdict: report.verdict, output: resultPath, bootstrap: report.bootstrap }, null, 2));
      process.exitCode = 2;
      return;
    }
  }

  let runtimeScaffold = null;
  if (['ui', 'functional'].includes(mode)) {
    const runtimeScaffoldPath = resolveFrom(
      projectRoot,
      getArg('--runtime-scaffold-output'),
      'reports/runtime-scaffold.json',
    );
    runtimeScaffold = inspectRuntimeScaffold(projectRoot);
    writeJson(runtimeScaffoldPath, runtimeScaffold);
    if (runtimeScaffold.status !== 'PASS') {
      const report = untestReport(plan, 'Runtime fixture/evidence scaffold BLOCKED trước browser execution', runId, mode);
      report.bootstrap = runtimeBootstrap;
      report.runtime_scaffold = runtimeScaffoldPath;
      writeJson(resultPath, report);
      console.log(JSON.stringify({
        verdict: report.verdict,
        output: resultPath,
        runtime_scaffold: runtimeScaffoldPath,
      }, null, 2));
      process.exitCode = 2;
      return;
    }
  }

  const traceabilityPath = resolveFrom(projectRoot, getArg('--traceability-output'), 'reports/testcase-automation-traceability.json');
  let traceability;
  try {
    traceability = buildTraceability({
      testcasePath,
      manifestPath,
      automationRoot: projectRoot,
      evidenceDir: resolveFrom(projectRoot, getArg('--selector-evidence-dir'), 'selector-evidence'),
      tokenUsagePath: getArg('--token-usage')
        ? resolveFrom(projectRoot, getArg('--token-usage'), '')
        : '',
      expectedAppBuild: appBuild,
      maxEvidenceAgeHours: Number(getArg('--max-evidence-age-hours', '168')),
      mode,
    });
    writeJson(traceabilityPath, traceability);
  } catch (error) {
    const report = untestReport(plan, `Traceability không chạy được: ${error.message}`, runId, mode);
    writeJson(resultPath, report);
    console.log(JSON.stringify({ verdict: report.verdict, output: resultPath }, null, 2));
    process.exitCode = 2;
    return;
  }
  if (traceability.status !== 'PASS') {
    const report = untestReport(plan, 'Traceability BLOCKED trước browser execution', runId, mode);
    report.traceability = traceabilityPath;
    writeJson(resultPath, report);
    console.log(JSON.stringify({ verdict: report.verdict, output: resultPath, traceability: traceabilityPath }, null, 2));
    process.exitCode = 2;
    return;
  }

  const grep = plan.testcases.map(item => escapeRegex(item.testcase_id)).join('|');
  const playwrightArgs = ['--no-install', 'playwright', 'test', '--grep', grep];
  const project = getArg('--browser-project', 'chromium');
  if (project) playwrightArgs.push('--project', project);
  const playwrightReportPath = resolveFrom(projectRoot, getArg('--playwright-report'), 'reports/playwright.json');
  // A previous JSON report must never be accepted as same-session evidence.
  fs.rmSync(playwrightReportPath, { force: true });
  const execution = spawnSync('npx', playwrightArgs, {
    cwd: projectRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      QA_UNIFIED_EVIDENCE: 'true',
      QA_RUN_ID: runId,
      RUN_ID: runId,
    },
    maxBuffer: 20 * 1024 * 1024,
  });
  if (!fs.existsSync(playwrightReportPath)) {
    const report = untestReport(plan, 'Playwright không tạo JSON report', runId, mode);
    report.traceability = traceabilityPath;
    report.runner_exit_code = execution.status;
    writeJson(resultPath, report);
    console.log(JSON.stringify({ verdict: report.verdict, output: resultPath }, null, 2));
    process.exitCode = 2;
    return;
  }

  const report = normalizePlaywrightReport(readJson(playwrightReportPath), plan, { projectRoot, mode, runId });
  report.traceability = traceabilityPath;
  report.playwright_report = playwrightReportPath;
  report.bootstrap = runtimeBootstrap;
  report.runtime_scaffold = runtimeScaffold;
  report.runner_exit_code = execution.status;
  writeJson(resultPath, report);
  const sheetPlanArg = getArg('--sheet-plan');
  if (sheetPlanArg) {
    const sheetPlanPath = resolveFrom(projectRoot, sheetPlanArg, '');
    if (!fs.existsSync(sheetPlanPath)) throw new Error(`--sheet-plan không tồn tại: ${sheetPlanPath}`);
    const sheetResultsPath = resolveFrom(
      projectRoot,
      getArg('--sheet-results-output'),
      'reports/sheet-worker-results.json',
    );
    writeJson(sheetResultsPath, buildSheetResults(report, readJson(sheetPlanPath)));
    report.sheet_results = sheetResultsPath;
    writeJson(resultPath, report);
  }
  console.log(JSON.stringify({ verdict: report.verdict, output: resultPath, summary: report.summary }, null, 2));
  process.exitCode = report.verdict === 'FAILED' ? 1 : report.verdict === 'UNTEST' ? 2 : 0;
}

const isDirectRun = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isDirectRun) {
  main().catch(error => {
    console.error(`[testcase-pom] BLOCKED: ${error.message}`);
    process.exitCode = 2;
  });
}
