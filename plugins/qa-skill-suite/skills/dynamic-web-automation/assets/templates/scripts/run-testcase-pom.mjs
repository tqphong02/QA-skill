#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensurePlaywrightRuntime } from './bootstrap-playwright.mjs';
import { moduleOperationInventoryPath } from './artifact-naming.mjs';
import { generatePomCode } from './generate-pom-code.mjs';
import { buildPomPlan } from './generate-pom-plan.mjs';
import { inspectRuntimeScaffold } from './verify-runtime-scaffold.mjs';
import { verifyApiOperationCoverage } from './verify-api-operation-coverage.mjs';
import { verifyAutomationComplexity } from './verify-automation-complexity.mjs';
import { verifyModuleArtifactLayout } from './verify-module-artifact-layout.mjs';
import { buildTraceability } from './verify-testcase-traceability.mjs';
import { buildUiCoverage } from './verify-ui-coverage.mjs';
import { verifyAllureContract } from './verify-allure-contract.mjs';
import { acquireExecutionLock } from './execution-lock.mjs';

const VALID_PHASES = new Set(['plan', 'build', 'execute', 'build-and-run']);
const VALID_MODES = new Set(['ui', 'api', 'functional']);
const VISUAL_RE = /\.(?:png|jpe?g|webp|gif|mp4|webm|mov|m4v)$/i;
const TRACE_RE = /(?:trace|network|console).*\.zip$|\.zip$/i;
const NPX = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function getArg(flag, fallback = '') {
  const index = process.argv.indexOf(flag);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function resolveFrom(root, value, fallback) {
  const selected = value || fallback;
  return path.isAbsolute(selected) ? selected : path.resolve(root, selected);
}

function getArgs(flag) {
  const values = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === flag && process.argv[index + 1]) values.push(process.argv[index + 1]);
  }
  return values;
}

function assertProjectOutputPath(root, target, label = 'output') {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`BLOCKED: ${label} must stay below project-root: ${resolvedTarget}`);
  }
  if (!fs.existsSync(resolvedRoot)) {
    throw new Error(`BLOCKED: project-root must exist before resolving ${label}: ${resolvedRoot}`);
  }
  let existingAncestor = resolvedTarget;
  while (!fs.existsSync(existingAncestor)) {
    const parent = path.dirname(existingAncestor);
    if (parent === existingAncestor) break;
    existingAncestor = parent;
  }
  const canonicalRoot = fs.realpathSync.native(resolvedRoot);
  const canonicalAncestor = fs.realpathSync.native(existingAncestor);
  const canonicalRelative = path.relative(canonicalRoot, canonicalAncestor);
  if (canonicalRelative.startsWith(`..${path.sep}`) || path.isAbsolute(canonicalRelative)) {
    throw new Error(`BLOCKED: ${label} resolves outside project-root through a link: ${resolvedTarget}`);
  }
  return resolvedTarget;
}

function resolveOutputFrom(root, value, fallback, label = 'output') {
  return assertProjectOutputPath(root, resolveFrom(root, value, fallback), label);
}

function testcaseGrep(testcaseIds) {
  const ids = [...new Set((testcaseIds || []).map(value => String(value).trim()).filter(Boolean))];
  if (ids.length === 0) throw new Error('BLOCKED: at least one testcase ID is required');
  const alternatives = ids.map(escapeRegex).join('|');
  return `(?:^|[^A-Za-z0-9_-])(?:${alternatives})(?:$|[^A-Za-z0-9_-])`;
}

function surfaceTestPath(mode) {
  if (!VALID_MODES.has(mode)) throw new Error(`BLOCKED: unsupported --mode ${mode}; use ui, api or functional`);
  return `tests/${mode}`;
}

function assertPlanSupportsMode(plan, mode) {
  if (!VALID_MODES.has(mode)) throw new Error(`BLOCKED: unsupported --mode ${mode}; use ui, api or functional`);
  const required = mode === 'functional' ? ['ui', 'api'] : [mode];
  const incompatible = (plan?.testcases || []).filter(testcase => {
    const capabilities = new Set(testcase.capabilities || []);
    return required.some(capability => !capabilities.has(capability));
  });
  if (incompatible.length > 0) {
    throw new Error(
      `BLOCKED: --mode ${mode} is incompatible with testcase capabilities: ${incompatible.map(item => item.testcase_id).join(', ')}`,
    );
  }
  return plan;
}

function assertBoundedPlan(plan, maxCases = 20) {
  const testcases = Array.isArray(plan?.testcases) ? plan.testcases : [];
  if (testcases.length === 0 || testcases.length > maxCases || maxCases > 20) {
    throw new Error(`BLOCKED: a POM plan must contain 1-${Math.min(maxCases, 20)} testcases`);
  }
  const ids = testcases.map(testcase => String(testcase.testcase_id || '').trim());
  if (ids.some(id => !id) || new Set(ids).size !== ids.length) {
    throw new Error('BLOCKED: a POM plan requires unique non-empty testcase IDs');
  }
  const moduleSlugs = new Set(testcases.map(testcase => String(testcase.group || '').trim().toLowerCase()));
  if (moduleSlugs.size !== 1 || !plan?.module?.slug) {
    throw new Error('BLOCKED: a POM plan must contain exactly one resolved business module');
  }
  if (!/^[a-f0-9]{64}$/i.test(String(plan.source_manifest_sha256 || ''))) {
    throw new Error('BLOCKED: a POM plan requires a valid source_manifest_sha256');
  }
  return plan;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function loadImmutablePlan(planPath, manifestPath, { maxCases = 20, mode = 'ui' } = {}) {
  if (!fs.existsSync(planPath)) throw new Error(`BLOCKED: --plan-input does not exist: ${planPath}`);
  const plan = readJson(planPath);
  assertBoundedPlan(plan, maxCases);
  assertPlanSupportsMode(plan, mode);
  const currentHash = sha256File(manifestPath);
  if (plan.source_manifest_sha256 !== currentHash) {
    throw new Error('BLOCKED: --plan-input source hash does not match the current automation manifest');
  }
  return plan;
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

function isExplicitNotApplicable(matches, results) {
  const annotations = [
    ...matches.flatMap(item => item.annotations || []),
    ...results.flatMap(item => item.annotations || []),
  ];
  return annotations.some(annotation => {
    const type = String(annotation?.type || '').trim().toLowerCase();
    const description = String(annotation?.description || '').trim();
    return ['n/a', 'na', 'not_applicable', 'not-applicable'].includes(type)
      || (type === 'skip' && /^N\/A\b/i.test(description));
  });
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
  if (skipped && isExplicitNotApplicable(matches, results)) {
    verdict = 'N/A';
    note = 'Playwright test được đánh dấu N/A tường minh theo điều kiện suite';
  } else if (skipped) {
    verdict = 'UNTEST';
    note = 'Playwright test bị skip nhưng không có annotation N/A tường minh';
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

function applyAllureContractGate(report, contract, mode) {
  if (contract.status === 'PASS') return report;
  const reason = contract.violations?.[0]?.message
    || 'Canonical Allure report contract is incomplete';
  report.results = report.results.map(result => ({
    ...result,
    verdict: 'UNTEST',
    sheet_result: 'Untest',
    note: `Allure canonical contract BLOCKED (${mode}): ${reason}`,
  }));
  report.verdict = 'UNTEST';
  report.summary = {
    total: report.results.length,
    pass: 0,
    failed: 0,
    not_applicable: 0,
    untest: report.results.length,
    flaky: report.results.filter(result => result.flaky).length,
  };
  return report;
}

function applyRunnerProcessGate(report, execution) {
  if (!execution?.error && !execution?.signal && execution?.status !== null) return report;
  const reason = execution?.error?.message
    || (execution?.signal ? `terminated by ${execution.signal}` : 'runner exit status is unavailable');
  report.results = report.results.map(result => ({
    ...result,
    verdict: 'UNTEST',
    sheet_result: 'Untest',
    note: `Playwright runner incomplete: ${reason}`,
  }));
  report.verdict = 'UNTEST';
  report.summary = {
    total: report.results.length,
    pass: 0,
    failed: 0,
    not_applicable: 0,
    untest: report.results.length,
    flaky: report.results.filter(result => result.flaky).length,
  };
  return report;
}

function selectedPlan(manifestPath, maxCases) {
  const testcaseIds = getArg('--testcase-id')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  const plan = buildPomPlan(manifestPath, {
    testcaseIds,
    group: getArg('--group'),
    maxCases,
  });
  if (plan.testcases.length === 0) throw new Error('BLOCKED: selection contains no testcases');
  if (plan.testcases.length > maxCases) {
    throw new Error(`BLOCKED: selection contains ${plan.testcases.length} cases; maximum is ${maxCases}`);
  }
  return plan;
}

async function main() {
  const phase = getArg('--phase', 'build-and-run').toLowerCase();
  if (!VALID_PHASES.has(phase)) {
    throw new Error('--phase must be plan, build, execute or build-and-run');
  }
  const mode = getArg('--mode', 'ui').toLowerCase();
  if (!VALID_MODES.has(mode)) {
    throw new Error(`BLOCKED: unsupported --mode ${mode}; use ui, api or functional`);
  }
  const isUiMode = ['ui', 'functional'].includes(mode);
  const projectRoot = path.resolve(getArg('--project-root', process.cwd()));
  const manifestPath = resolveFrom(projectRoot, getArg('--manifest'), '');
  if (!getArg('--manifest') || !fs.existsSync(manifestPath)) throw new Error('--manifest is required and must exist');
  const maxCases = Number(getArg('--max-cases', '20'));
  if (!Number.isInteger(maxCases) || maxCases < 1 || maxCases > 20) {
    throw new Error('--max-cases must be an integer from 1 to the hard limit 20');
  }
  const planInputArg = getArg('--plan-input');
  if (phase === 'execute' && !planInputArg) {
    throw new Error('BLOCKED: --plan-input is required for execute so RUN cannot reinterpret the manifest');
  }
  const planPath = phase === 'execute'
    ? assertProjectOutputPath(
      projectRoot,
      resolveFrom(projectRoot, planInputArg, ''),
      '--plan-input',
    )
    : resolveOutputFrom(
      projectRoot,
      getArg('--plan-output'),
      'reports/testcase-pom-plan.json',
      '--plan-output',
    );
  const plan = phase === 'execute'
    ? loadImmutablePlan(planPath, manifestPath, { maxCases, mode })
    : selectedPlan(manifestPath, maxCases);
  assertBoundedPlan(plan, maxCases);
  assertPlanSupportsMode(plan, mode);
  const runId = getArg('--run-id', `pom-${Date.now()}`);
  const resultPath = resolveOutputFrom(
    projectRoot,
    getArg('--output'),
    'reports/testcase-pom-execution.json',
    '--output',
  );
  const executionLock = phase !== 'plan'
    ? acquireExecutionLock(projectRoot, { runId, operation: `testcase-pom:${mode}` })
    : null;
  try {
    if (phase !== 'execute') writeJson(planPath, plan);

  const appBuild = getArg('--app-build');
  const uiInventoryArg = getArg('--ui-inventory', process.env.QA_UI_FUNCTION_INVENTORY || '');
  const diagnosticSkipUiCoverage = process.argv.includes('--diagnostic-skip-ui-coverage');
  if (diagnosticSkipUiCoverage && phase !== 'plan') {
    throw new Error('BLOCKED: --diagnostic-skip-ui-coverage is allowed only for plan diagnostics');
  }
  const requireUiCoverage = isUiMode && !diagnosticSkipUiCoverage;
  const requireExplicitUiCoverage = process.argv.includes('--require-explicit-ui-coverage')
    || String(process.env.QA_REQUIRE_EXPLICIT_UI_COVERAGE || '').toLowerCase() === 'true';
  const uiCoveragePath = resolveOutputFrom(
    projectRoot,
    getArg('--ui-coverage-output'),
    'reports/ui-function-coverage.json',
    '--ui-coverage-output',
  );
  let uiCoverage = null;
  if (isUiMode && (requireUiCoverage || uiInventoryArg)) {
    if (!uiInventoryArg) {
      const reason = 'UI function inventory is required for complete UI/POM coverage';
      if (phase === 'plan') {
        throw new Error('BLOCKED: UI/functional planning requires --ui-inventory <Browser MCP function inventory>');
      }
      const report = untestReport(plan, reason, runId, mode);
      report.ui_coverage = { status: 'BLOCKED', reason };
      writeJson(resultPath, report);
      console.log(JSON.stringify({ verdict: report.verdict, output: resultPath, ui_coverage: report.ui_coverage }, null, 2));
      process.exitCode = 2;
      return;
    }
    uiCoverage = buildUiCoverage({
      manifestPath,
      inventoryPath: resolveFrom(projectRoot, uiInventoryArg, ''),
      expectedAppBuild: appBuild,
      maxAgeHours: Number(getArg('--max-inventory-age-hours', '168')),
      testcaseIds: getArg('--testcase-id').split(',').map(value => value.trim()).filter(Boolean),
      group: getArg('--group'),
      requireExplicit: requireExplicitUiCoverage,
    });
    writeJson(uiCoveragePath, uiCoverage);
    if (uiCoverage.status !== 'PASS') {
      if (phase === 'plan') throw new Error(`BLOCKED: UI function coverage is incomplete; see ${uiCoveragePath}`);
      const report = untestReport(plan, 'UI function coverage is incomplete before browser execution', runId, mode);
      report.ui_coverage = uiCoveragePath;
      writeJson(resultPath, report);
      console.log(JSON.stringify({ verdict: report.verdict, output: resultPath, ui_coverage: uiCoveragePath }, null, 2));
      process.exitCode = 2;
      return;
    }
  }
  if (phase === 'plan') {
    console.log(JSON.stringify({
      status: 'READY_FOR_CODE',
      plan: planPath,
      testcase_count: plan.testcases.length,
      ui_coverage: uiCoveragePath && uiCoverage ? uiCoveragePath : null,
    }, null, 2));
    return;
  }


  let codegen = null;
  const codegenReportPath = resolveOutputFrom(
    projectRoot,
    getArg('--codegen-report'),
    'reports/pom-codegen.json',
    '--codegen-report',
  );
  if (phase === 'build' || phase === 'build-and-run') {
    const selectorEvidenceArgs = getArgs('--selector-evidence');
    const selectorEvidencePaths = selectorEvidenceArgs.length > 0
      ? selectorEvidenceArgs.map(value => resolveFrom(projectRoot, value, ''))
      : (isUiMode ? [resolveFrom(
        projectRoot,
        getArg('--selector-evidence-dir'),
        'selector-evidence',
      )] : []);
    try {
      codegen = generatePomCode({
        planPaths: [planPath],
        selectorEvidencePaths,
        projectRoot,
        surface: mode,
        reportPath: codegenReportPath,
      });
    } catch (error) {
      if (phase === 'build') throw error;
      const report = untestReport(plan, `Deterministic code generation BLOCKED: ${error.message}`, runId, mode);
      report.codegen = { status: 'BLOCKED', reason: error.message };
      writeJson(resultPath, report);
      console.log(JSON.stringify({ verdict: report.verdict, output: resultPath, codegen: report.codegen }, null, 2));
      process.exitCode = 2;
      return;
    }
    if (codegen.status !== 'PASS') {
      throw new Error(`BLOCKED: deterministic code generation failed; see ${codegenReportPath}`);
    }
  }

  const complexityPath = resolveOutputFrom(
    projectRoot,
    getArg('--complexity-output'),
    'reports/automation-complexity.json',
    '--complexity-output',
  );
  const complexity = verifyAutomationComplexity({
    planPaths: [planPath],
    projectRoot,
    configPath: resolveFrom(projectRoot, getArg('--complexity-config'), 'automation-complexity.json'),
    codegenReportPath,
  });
  writeJson(complexityPath, complexity);
  if (complexity.status !== 'PASS') {
    if (phase === 'build') throw new Error(`BLOCKED: automation complexity limit exceeded; see ${complexityPath}`);
    const report = untestReport(plan, 'Automation complexity limit exceeded before execution', runId, mode);
    report.complexity = complexityPath;
    writeJson(resultPath, report);
    console.log(JSON.stringify({ verdict: report.verdict, output: resultPath, complexity: complexityPath }, null, 2));
    process.exitCode = 2;
    return;
  }

  const moduleLayoutPath = resolveOutputFrom(
    projectRoot,
    getArg('--module-layout-output'),
    'reports/module-artifact-layout.json',
    '--module-layout-output',
  );
  const moduleLayout = verifyModuleArtifactLayout({
    manifestPath,
    projectRoot,
    surface: mode,
    planPaths: [planPath],
  });
  writeJson(moduleLayoutPath, moduleLayout);
  if (moduleLayout.status !== 'PASS') {
    if (phase === 'build') {
      throw new Error(`BLOCKED: module artifact layout is incomplete; see ${moduleLayoutPath}`);
    }
    const report = untestReport(plan, 'Module artifact layout is incomplete before execution', runId, mode);
    report.module_layout = moduleLayoutPath;
    writeJson(resultPath, report);
    console.log(JSON.stringify({ verdict: report.verdict, output: resultPath, module_layout: moduleLayoutPath }, null, 2));
    process.exitCode = 2;
    return;
  }

  let apiOperationCoverage = null;
  let apiOperationCoveragePath = null;
  if (['api', 'functional'].includes(mode)) {
    const inventoryPath = resolveFrom(
      projectRoot,
      getArg(
        '--api-operation-inventory',
        codegen?.api_operation_inventory?.path
          || path.relative(projectRoot, moduleOperationInventoryPath(projectRoot, plan.module)),
      ),
      '',
    );
    apiOperationCoveragePath = resolveOutputFrom(
      projectRoot,
      getArg('--api-operation-coverage-output'),
      'reports/api-operation-coverage.json',
      '--api-operation-coverage-output',
    );
    apiOperationCoverage = verifyApiOperationCoverage({
      projectRoot,
      inventoryPath,
      testcaseIds: plan.testcases.map(testcase => testcase.testcase_id),
    });
    writeJson(apiOperationCoveragePath, apiOperationCoverage);
    if (apiOperationCoverage.status !== 'PASS') {
      if (phase === 'build') {
        throw new Error(`BLOCKED: API operation coverage is incomplete; see ${apiOperationCoveragePath}`);
      }
      const report = untestReport(plan, 'API operation coverage is incomplete before execution', runId, mode);
      report.module_layout = moduleLayoutPath;
      report.api_operation_coverage = apiOperationCoveragePath;
      writeJson(resultPath, report);
      console.log(JSON.stringify({
        verdict: report.verdict,
        output: resultPath,
        api_operation_coverage: apiOperationCoveragePath,
      }, null, 2));
      process.exitCode = 2;
      return;
    }
  }

  if (phase === 'build') {
    const buildRuntimeScaffoldPath = resolveOutputFrom(
      projectRoot,
      getArg('--runtime-scaffold-output'),
      'reports/runtime-scaffold.json',
      '--runtime-scaffold-output',
    );
    const buildRuntimeScaffold = inspectRuntimeScaffold(projectRoot);
    writeJson(buildRuntimeScaffoldPath, buildRuntimeScaffold);
    if (buildRuntimeScaffold.status !== 'PASS') {
      throw new Error(`BLOCKED: runtime scaffold is incomplete; see ${buildRuntimeScaffoldPath}`);
    }
    console.log(JSON.stringify({
      status: 'READY_FOR_RUN',
      plan: planPath,
      codegen: codegen?.report || null,
      complexity: complexityPath,
      module_layout: moduleLayoutPath,
      api_operation_coverage: apiOperationCoveragePath,
      runtime_scaffold: buildRuntimeScaffoldPath,
      testcase_count: plan.testcases.length,
      surface: mode,
    }, null, 2));
    return;
  }

  const testcasePath = resolveFrom(projectRoot, getArg('--testcases'), '');
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
  if (VALID_MODES.has(mode)) {
    const runtimeScaffoldPath = resolveOutputFrom(
      projectRoot,
      getArg('--runtime-scaffold-output'),
      'reports/runtime-scaffold.json',
      '--runtime-scaffold-output',
    );
    runtimeScaffold = inspectRuntimeScaffold(projectRoot);
    writeJson(runtimeScaffoldPath, runtimeScaffold);
    if (runtimeScaffold.status !== 'PASS') {
      const report = untestReport(plan, 'Runtime fixture/evidence scaffold BLOCKED before Playwright execution', runId, mode);
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

  const traceabilityPath = resolveOutputFrom(
    projectRoot,
    getArg('--traceability-output'),
    'reports/testcase-automation-traceability.json',
    '--traceability-output',
  );
  let traceability;
  try {
    const traceabilityMode = ['ui', 'functional'].includes(mode) ? 'ui' : mode;
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
      requireBrowserMcp: ['ui', 'functional'].includes(mode),
      mode: traceabilityMode,
      testcaseIds: plan.testcases.map(testcase => testcase.testcase_id),
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

  const grep = testcaseGrep(plan.testcases.map(item => item.testcase_id));
  const playwrightArgs = [
    '--no-install',
    'playwright',
    'test',
    surfaceTestPath(mode),
    '--grep',
    grep,
  ];
  const project = getArg('--browser-project', 'chromium');
  if (project) playwrightArgs.push('--project', project);
  const playwrightReportPath = resolveOutputFrom(
    projectRoot,
    getArg('--playwright-report'),
    'reports/playwright.json',
    '--playwright-report',
  );
  const allureResultsPath = resolveOutputFrom(
    projectRoot,
    getArg('--allure-results'),
    'reports/allure-results',
    '--allure-results',
  );
  const allureContractPath = resolveOutputFrom(
    projectRoot,
    getArg('--allure-contract-output'),
    'reports/allure-contract.json',
    '--allure-contract-output',
  );
  // A previous JSON report must never be accepted as same-session evidence.
  fs.rmSync(playwrightReportPath, { force: true });
  // Allure raw results are also same-session evidence; stale result files must
  // not be merged into the current report.
  fs.rmSync(allureResultsPath, { recursive: true, force: true });
  fs.mkdirSync(allureResultsPath, { recursive: true });
  const execution = spawnSync(NPX, playwrightArgs, {
    cwd: projectRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      QA_UNIFIED_EVIDENCE: 'true',
      QA_SELECTOR_EVIDENCE_CAPTURE: process.env.QA_SELECTOR_EVIDENCE_CAPTURE ?? 'true',
      QA_RUN_ID: runId,
      RUN_ID: runId,
    },
    maxBuffer: 20 * 1024 * 1024,
  });
  if (!fs.existsSync(playwrightReportPath)) {
    const report = untestReport(plan, 'Playwright không tạo JSON report', runId, mode);
    const allureContract = verifyAllureContract({ resultsDir: allureResultsPath, mode });
    writeJson(allureContractPath, allureContract);
    report.traceability = traceabilityPath;
    report.allure_results = allureResultsPath;
    report.allure_contract = allureContractPath;
    report.runner_exit_code = execution.status;
    writeJson(resultPath, report);
    console.log(JSON.stringify({ verdict: report.verdict, output: resultPath }, null, 2));
    process.exitCode = 2;
    return;
  }

  const report = normalizePlaywrightReport(readJson(playwrightReportPath), plan, { projectRoot, mode, runId });
  const allureContract = verifyAllureContract({ resultsDir: allureResultsPath, mode });
  writeJson(allureContractPath, allureContract);
  report.traceability = traceabilityPath;
  report.ui_coverage = uiCoveragePath && uiCoverage ? uiCoveragePath : null;
  report.playwright_report = playwrightReportPath;
  report.allure_results = allureResultsPath;
  report.allure_contract = allureContractPath;
  report.bootstrap = runtimeBootstrap;
  report.runtime_scaffold = runtimeScaffold;
  report.codegen = codegen?.report || null;
  report.module_layout = moduleLayoutPath;
  report.api_operation_coverage = apiOperationCoveragePath;
  report.runner_exit_code = execution.status;
  applyRunnerProcessGate(report, execution);
  applyAllureContractGate(report, allureContract, mode);
  writeJson(resultPath, report);
  const sheetPlanArg = getArg('--sheet-plan');
  if (sheetPlanArg) {
    const sheetPlanPath = resolveFrom(projectRoot, sheetPlanArg, '');
    if (!fs.existsSync(sheetPlanPath)) throw new Error(`--sheet-plan không tồn tại: ${sheetPlanPath}`);
    const sheetResultsPath = resolveOutputFrom(
      projectRoot,
      getArg('--sheet-results-output'),
      'reports/sheet-worker-results.json',
      '--sheet-results-output',
    );
    writeJson(sheetResultsPath, buildSheetResults(report, readJson(sheetPlanPath)));
    report.sheet_results = sheetResultsPath;
    writeJson(resultPath, report);
  }
  console.log(JSON.stringify({ verdict: report.verdict, output: resultPath, summary: report.summary }, null, 2));
    process.exitCode = report.verdict === 'FAILED' ? 1 : report.verdict === 'UNTEST' ? 2 : 0;
  } finally {
    executionLock?.release();
  }
}

export {
  applyAllureContractGate,
  applyRunnerProcessGate,
  assertBoundedPlan,
  assertPlanSupportsMode,
  assertProjectOutputPath,
  loadImmutablePlan,
  resolveOutputFrom,
  surfaceTestPath,
  testcaseGrep,
};

const isDirectRun = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isDirectRun) {
  main().catch(error => {
    console.error(`[testcase-pom] BLOCKED: ${error.message}`);
    process.exitCode = 2;
  });
}
