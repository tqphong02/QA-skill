#!/usr/bin/env node
/**
 * run-manifest.mjs — Test Run Manifest Initializer & Logger
 *
 * Khởi tạo và cập nhật file evidence/manifest-<run_id>.json chứa đầy đủ thông tin:
 *   - run_id
 *   - environment, base_url, git_commit, app_version
 *   - browser_driver, browser_observer, network_observer
 *   - browser_observability (3-track model)
 *   - test_data_namespace
 *   - started_time, finished_time, duration_ms
 *   - worker_count
 *   - knowledge_version
 *
 * Usage:
 *   # Start manifest
 *   node run-manifest.mjs start --workers 4 --mode SHEET_EXECUTION \
 *     --browser-driver ego-browser \
 *     --browser-observer ego-browser \
 *     --network-observer chrome-devtools-mcp
 *
 *   # Finish manifest
 *   node run-manifest.mjs finish <RUN_ID> --verdict PASS --total-cases 20 --passed 18 --failed 2
 *
 *   # Backward compat (deprecated, shows migration warning):
 *   node run-manifest.mjs start --browser-observer playwright-mcp
 */

import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { resolveModelUsage } from '../../lib/model-telemetry.mjs';
import {
  QA_RESULT_VERDICT_SET,
  normalizeQaResultVerdict,
} from '../../lib/verdicts.mjs';

const DATA = process.env.QA_DATA_DIR || process.cwd();
try { process.loadEnvFile(path.join(DATA, '.env')); } catch { /* optional */ }

const EVID = path.join(DATA, 'evidence');

const args = process.argv.slice(2);
const command = args[0] || 'start';
const getArg = (flag, def) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : def; };

function getGitCommit() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return process.env.QA_GIT_COMMIT || 'unknown';
  }
}

function getGitBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return process.env.QA_GIT_BRANCH || 'unknown';
  }
}

function deriveContextCardPath(briefPath) {
  const replaced = briefPath.replace(
    /business-execution-brief\.json$/i,
    'business-execution-card.json',
  );
  if (replaced !== briefPath) return replaced;
  return path.join(
    path.dirname(briefPath),
    `${path.basename(briefPath, path.extname(briefPath))}-card.json`,
  );
}

if (command === 'start') {
  const requestedMode = getArg('--mode', 'EXPLORATORY_BROWSER_QA').toUpperCase();
  const requestedProfile = String(
    getArg('--profile', getArg('--task-profile', '')),
  ).trim().toUpperCase();
  const fastProfile = requestedMode === 'BROWSER_TASK_FAST' || requestedProfile === 'FAST';
  const testMode = ['BROWSER_TASK_FAST', 'EXPLORATORY_ADHOC'].includes(requestedMode)
    ? 'EXPLORATORY_BROWSER_QA'
    : requestedMode;
  const executionProfile = fastProfile
    ? 'FAST'
    : requestedProfile === 'FULL' ? 'FULL' : 'EXPLORATORY';
  if (requestedProfile && !['FAST', 'EXPLORATORY', 'FULL'].includes(requestedProfile)) {
    console.error(`[run-manifest] BLOCKED: unsupported --profile value: ${requestedProfile}`);
    console.error('  Allowed: FAST, EXPLORATORY, FULL');
    process.exit(2);
  }
  if (requestedMode === 'BROWSER_TASK_FAST' && requestedProfile && requestedProfile !== 'FAST') {
    console.error('[run-manifest] BLOCKED: BROWSER_TASK_FAST can only use --profile FAST');
    console.error('  Use --mode EXPLORATORY_BROWSER_QA --profile EXPLORATORY for the full exploratory profile');
    process.exit(2);
  }
  // Generic and exploratory browser routes use the first-party Playwright
  // runtime by default. This avoids accidentally launching/attaching to the
  // user's system Chrome through a Chrome DevTools MCP auto-resolution path.
  // An explicit CLI flag or QA_* environment variable still opts into another
  // driver, including the legacy `auto` fallback policy.
  const nativeDefaultModes = new Set([
    'EXPLORATORY_BROWSER_QA',
    'APP_BASELINE_DISCOVERY',
  ]);
  const nativeDefault = nativeDefaultModes.has(testMode);
  const trackValue = (flag, envName, fallback) => {
    if (args.includes(flag)) return getArg(flag, fallback);
    const configured = String(process.env[envName] || '').trim();
    return configured || fallback;
  };
  const discoveryModes = new Set([
    'EXPLORATORY_BROWSER_QA',
    'APP_BASELINE_DISCOVERY',
    'REPO_BUSINESS_DISCOVERY',
    'UI_BUSINESS_RECONCILIATION',
    'SCOPED_BUSINESS_DISCOVERY',
  ]);
  const businessContextPath = path.resolve(getArg(
    '--business-context',
    path.join(DATA, 'qa-knowledge', 'context', 'business-execution-brief.json'),
  ));
  const contextCardPath = deriveContextCardPath(businessContextPath);
  const contextBudgetPath = path.join(path.dirname(contextCardPath), 'context-budget.json');
  // ── Browser 3-track resolution ─────────────────────────────────────────────
  //
  // Allowed values per track:
  const ALLOWED_DRIVER = new Set([
    'auto', 'playwright-mcp', 'ego-browser', 'chrome-devtools-mcp',
    'playwright-runtime', 'unavailable',
  ]);
  const ALLOWED_OBSERVER = new Set([
    'auto', 'playwright-mcp', 'ego-browser', 'chrome-devtools-mcp',
    'playwright-runtime', 'unavailable', 'not-applicable',
  ]);
  const ALLOWED_NETWORK = new Set([
    'auto', 'chrome-devtools-mcp', 'playwright-mcp', 'ego-browser',
    'playwright-runtime', 'unavailable', 'not-applicable',
  ]);

  // Backward-compat alias map: old --browser-observer values -> new driver value
  const COMPAT_ALIAS = {
    'playwright':         'playwright-mcp',
    'chrome-devtools':    'chrome-devtools-mcp',
    'playwright-mcp':     'playwright-mcp',
    'chrome-devtools-mcp':'chrome-devtools-mcp',
    'ego-browser':        'ego-browser',
    'playwright-runtime': 'playwright-runtime',
    'unavailable':        'unavailable',
    'not-applicable':     'not-applicable',
    'auto':               'auto',
  };

  // Detect legacy single --browser-observer usage
  const legacyObserverRaw = args.includes('--browser-observer') && !args.includes('--browser-driver')
    ? getArg('--browser-observer', null)
    : null;

  if (legacyObserverRaw !== null) {
    const migrated = COMPAT_ALIAS[legacyObserverRaw];
    if (migrated) {
      console.warn('[run-manifest] MIGRATION WARNING: --browser-observer is deprecated.');
      console.warn(`  Old: --browser-observer ${legacyObserverRaw}`);
      console.warn(`  New: --browser-driver ${migrated} --browser-observer ${migrated} --network-observer auto`);
      console.warn('  Update your command. Legacy alias accepted this run.');
    } else {
      console.error(`[run-manifest] BLOCKED: unknown legacy --browser-observer value: ${legacyObserverRaw}`);
      console.error('  --browser-observer has been replaced by 3 separate flags:');
      console.error('    --browser-driver <auto|playwright-mcp|playwright-runtime|ego-browser|chrome-devtools-mcp|unavailable>');
      console.error('    --browser-observer <auto|playwright-mcp|playwright-runtime|ego-browser|chrome-devtools-mcp|unavailable>');
      console.error('    --network-observer <auto|chrome-devtools-mcp|playwright-mcp|playwright-runtime|ego-browser|unavailable>');
      console.error('  See dynamic-testing/web-exploratory/references/BROWSER-DRIVER-RESOLUTION.md');
      process.exit(2);
    }
  }

  // Resolve the 3 tracks
  const browserDriver = legacyObserverRaw 
    ? COMPAT_ALIAS[legacyObserverRaw] 
    : trackValue('--browser-driver', 'QA_BROWSER_DRIVER', nativeDefault ? 'playwright-runtime' : 'auto');

  const browserObserver = legacyObserverRaw 
    ? COMPAT_ALIAS[legacyObserverRaw] 
    : trackValue('--browser-observer', 'QA_BROWSER_OBSERVER', nativeDefault ? 'playwright-runtime' : 'auto');

  const networkObserver = legacyObserverRaw 
    ? 'auto' 
    : trackValue('--network-observer', 'QA_NETWORK_OBSERVER', nativeDefault ? 'playwright-runtime' : 'auto');

  if (!ALLOWED_DRIVER.has(browserDriver)) {
    console.error(`[run-manifest] BLOCKED: unsupported --browser-driver value: ${browserDriver}`);
    console.error(`  Allowed: ${[...ALLOWED_DRIVER].join(', ')}`);
    process.exit(2);
  }
  if (!ALLOWED_OBSERVER.has(browserObserver)) {
    console.error(`[run-manifest] BLOCKED: unsupported --browser-observer value: ${browserObserver}`);
    console.error(`  Allowed: ${[...ALLOWED_OBSERVER].join(', ')}`);
    process.exit(2);
  }
  if (!ALLOWED_NETWORK.has(networkObserver)) {
    console.error(`[run-manifest] BLOCKED: unsupported --network-observer value: ${networkObserver}`);
    console.error(`  Allowed: ${[...ALLOWED_NETWORK].join(', ')}`);
    process.exit(2);
  }

  // ego-browser is macOS only; warn on other platforms
  if (browserDriver === 'ego-browser' && process.platform !== 'darwin') {
    console.error(`[run-manifest] BLOCKED: --browser-driver ego-browser is macOS only (current: ${process.platform})`);
    console.error('  Resolve to playwright-mcp or chrome-devtools-mcp on this platform.');
    process.exit(2);
  }

  // Compute network capability flags
  const networkBodyAvailable = ['chrome-devtools-mcp', 'playwright-mcp', 'playwright-runtime'].includes(networkObserver);
  const networkConfidence = (() => {
    if (['chrome-devtools-mcp', 'playwright-mcp', 'playwright-runtime'].includes(networkObserver)) return 'high';
    if (networkObserver === 'ego-browser') return 'medium';
    return 'low';
  })();
  const observabilityEnabled = !['unavailable', 'not-applicable'].includes(browserDriver);

  let businessContext = null;
  if (fs.existsSync(businessContextPath)) {
    try {
      businessContext = JSON.parse(fs.readFileSync(businessContextPath, 'utf8'));
    } catch {
      console.error(`[run-manifest] BLOCKED: invalid business context JSON at ${businessContextPath}`);
      process.exit(2);
    }
  }
  let contextCard = null;
  let contextBudget = null;
  const modelUsage = resolveModelUsage(DATA);
  if (fs.existsSync(contextCardPath)) {
    try {
      contextCard = JSON.parse(fs.readFileSync(contextCardPath, 'utf8'));
    } catch {
      console.warn(`[run-manifest] Warning: context card is invalid at ${contextCardPath}`);
    }
  }
  if (fs.existsSync(contextBudgetPath)) {
    try {
      contextBudget = JSON.parse(fs.readFileSync(contextBudgetPath, 'utf8'));
    } catch {
      console.warn(`[run-manifest] Warning: context budget is invalid at ${contextBudgetPath}`);
    }
  }

  if (!discoveryModes.has(testMode)) {
    if (!businessContext) {
      console.error(`[run-manifest] BLOCKED: business execution brief is missing at ${businessContextPath}`);
      console.error('Run scripts/helpers/context-builder.mjs and resolve the brief before browser testing');
      process.exit(2);
    }
    if (businessContext.status !== 'READY') {
      console.error(`[run-manifest] BLOCKED: business execution brief status=${businessContext.status}`);
      console.error(`Missing: ${(businessContext.missing_required || []).join(', ') || 'unknown'}`);
      process.exit(2);
    }
    if (
      contextCard
      && contextCard.retrieval?.full_brief_sha256_12
      && crypto.createHash('sha256')
        .update(fs.readFileSync(businessContextPath))
        .digest('hex')
        .slice(0, 12) !== contextCard.retrieval.full_brief_sha256_12
    ) {
      console.error('[run-manifest] BLOCKED: business execution card is stale relative to the full brief');
      console.error('Run scripts/helpers/prepare-test-intelligence.mjs --no-cache to rebuild the card');
      process.exit(2);
    }
    if (
      !Array.isArray(businessContext.risk_inventory)
      || businessContext.risk_inventory.length === 0
      || !Array.isArray(businessContext.exploratory_charters)
      || businessContext.exploratory_charters.length === 0
    ) {
      console.error('[run-manifest] BLOCKED: READY brief lacks ranked risks or exploratory charters');
      console.error('Run scripts/helpers/prepare-test-intelligence.mjs before browser testing');
      process.exit(2);
    }
  }

  const explicitDriver = args.includes('--browser-driver') || Boolean(String(process.env.QA_BROWSER_DRIVER || '').trim());
  const explicitObserver = args.includes('--browser-observer') || Boolean(String(process.env.QA_BROWSER_OBSERVER || '').trim());
  const explicitNetworkObserver = args.includes('--network-observer') || Boolean(String(process.env.QA_NETWORK_OBSERVER || '').trim());
  const nativeDefaultApplied = nativeDefault
    && !legacyObserverRaw
    && browserDriver === 'playwright-runtime'
    && !explicitDriver;

  fs.mkdirSync(EVID, { recursive: true });
  const requestedRunId = String(getArg('--run-id', '') || '').trim();
  const runId = requestedRunId
    ? requestedRunId.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90)
    : `run-${Date.now()}`;
  if (!runId) {
    console.error('[run-manifest] BLOCKED: --run-id resolves to an empty identifier');
    process.exit(2);
  }
  const manifest = {
    run_id: runId,
    status: 'RUNNING',
    environment: process.env.QA_ENV || 'UAT',
    base_url: process.env.QA_BASE_URL || 'N/A',
    git_commit: getGitCommit(),
    git_branch: getGitBranch(),
    app_version: process.env.QA_APP_VERSION || '1.0.0',
    browser: `${browserDriver === 'ego-browser' ? 'chromium-ego-lite' : 'chromium-headless'}`,
    browser_resolution: {
      policy: nativeDefaultApplied ? 'playwright-runtime-default' : 'explicit-or-auto',
      explicit_driver: explicitDriver,
      explicit_observer: explicitObserver,
      explicit_network_observer: explicitNetworkObserver,
      system_chrome_auto_attach_possible: browserDriver === 'chrome-devtools-mcp' || browserDriver === 'auto',
    },
    browser_driver: browserDriver,
    browser_observer: browserObserver,
    network_observer: networkObserver,
    browser_observability: {
      driver: browserDriver,
      observer: browserObserver,
      network_observer: networkObserver,
      same_session_required: true,
      network_body_available: networkBodyAvailable,
      network_body_scope: networkObserver === 'playwright-runtime'
        ? 'redacted response preview for HTTP failures/GraphQL errors; request bodies are not persisted'
        : null,
      network_confidence: networkConfidence,
      enabled: observabilityEnabled,
      scope: ['document', 'xhr', 'fetch', 'websocket', 'console', 'pageerror'],
      redaction_required: true,
      ego_browser_notes: browserDriver === 'ego-browser'
        ? 'drainEvents() provides basic events only; no request/response body; use chrome-devtools-mcp as network_observer for full detail'
        : null,
      native_runtime_notes: browserDriver === 'playwright-runtime' || networkObserver === 'playwright-runtime'
        ? 'Native Playwright/CDP runtime attaches AX tree and the redacted runtime observer to the same page; session daemon and worker evidence live under evidence/native-browser/'
        : null,
    },
    viewport: '1440x900',
    account_roles: [process.env.QA_EMAIL || 'default_user'],
    test_data_namespace: `ns-${Date.now().toString(36)}`,
    worker_count: parseInt(getArg('--workers', '1'), 10),
    requested_mode: requestedMode,
    test_mode: testMode,
    execution_profile: executionProfile,
    fast_task: fastProfile,
    knowledge_version: businessContext?.source_files?.map(source => source.sha256_12).join(',') || 'discovery',
    business_context: businessContext ? {
      path: path.relative(DATA, businessContextPath),
      status: businessContext.status,
      scope: businessContext.scope,
      sha256_12: crypto.createHash('sha256')
        .update(fs.readFileSync(businessContextPath))
        .digest('hex')
        .slice(0, 12),
    } : null,
    test_intelligence: businessContext ? {
      knowledge_confidence: businessContext.knowledge_health?.confidence || 'unknown',
      run_mode: businessContext.run_mode || 'auto',
      runtime_evidence_present: Boolean(businessContext.knowledge_health?.runtime_evidence_present),
      source_evidence_count: businessContext.source_evidence?.length || 0,
      high_risk_ids: (businessContext.risk_inventory || [])
        .filter(risk => ['critical', 'high'].includes(risk.priority))
        .map(risk => risk.risk_id),
      charter_ids: (businessContext.exploratory_charters || []).map(charter => charter.charter_id),
      context_card: contextCard ? {
        path: path.relative(DATA, contextCardPath),
        status: contextCard.status || 'unknown',
        sha256_12: crypto.createHash('sha256')
          .update(fs.readFileSync(contextCardPath))
          .digest('hex')
          .slice(0, 12),
        estimated_tokens: contextCard.budget?.estimated_tokens || null,
        max_estimated_tokens: contextCard.budget?.max_estimated_tokens || null,
        within_budget: contextCard.budget?.within_budget ?? null,
        deferred_risk_count: contextCard.retrieval?.deferred_risk_ids?.length || 0,
        deferred_charter_count: contextCard.retrieval?.deferred_charter_ids?.length || 0,
      } : null,
      context_budget: contextBudget ? {
        path: path.relative(DATA, contextBudgetPath),
        cache_hit: Boolean(contextBudget.cache_hit),
        cache_mode: contextBudget.cache_mode || 'unknown',
        estimator: contextBudget.estimator || 'utf8_bytes_div_4_estimate',
        token_measurement: contextBudget.token_measurement || 'deterministic_estimate',
        provider_token_usage: contextBudget.provider_token_usage || modelUsage,
        estimated_tokens: contextBudget.model_context_card?.estimated_tokens || null,
        max_estimated_tokens: contextBudget.model_context_card?.max_estimated_tokens || null,
        within_budget: contextBudget.model_context_card?.within_budget ?? null,
      } : null,
    } : null,
    started_time: new Date().toISOString(),
    finished_time: null,
    duration_ms: null,
    summary: {
      total_cases: 0,
      passed: 0,
      failed: 0,
      untested: 0,
    },
  };

  const manifestPath = path.join(EVID, `manifest-${runId}.json`);
  const latestLink    = path.join(EVID, 'manifest-latest.json');
  if (fs.existsSync(manifestPath)) {
    console.error(`[run-manifest] BLOCKED: manifest already exists for runId ${runId}`);
    process.exit(2);
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  fs.writeFileSync(latestLink, JSON.stringify(manifest, null, 2), 'utf8');

  console.log(`[run-manifest] Manifest initialized: ${runId}`);
  console.log(`  File:   ${manifestPath}`);
  console.log(`  Commit: ${manifest.git_commit} (${manifest.git_branch})`);
  console.log(`  Base:   ${manifest.base_url}`);
  console.log(`  Data NS: ${manifest.test_data_namespace}`);
  console.log(runId); // Output runId for script capture

} else if (command === 'finish') {
  const runId = args[1] || getArg('--run-id', '');
  let manifestPath = path.join(EVID, `manifest-${runId}.json`);
  if (!fs.existsSync(manifestPath)) {
    manifestPath = path.join(EVID, 'manifest-latest.json');
  }

  if (!fs.existsSync(manifestPath)) {
    console.error(`[run-manifest] ❌ Cannot find manifest for runId ${runId}`);
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const finishedTime = new Date();
  const startTime = new Date(manifest.started_time);

  const requestedVerdict = String(getArg('--verdict', '') || '').trim().toUpperCase();
  const exploratoryManifest = [
    'EXPLORATORY_BROWSER_QA',
    'APP_BASELINE_DISCOVERY',
  ].includes(manifest.test_mode);
  const normalizedVerdict = exploratoryManifest
    ? normalizeQaResultVerdict(requestedVerdict)
    : requestedVerdict;
  if (exploratoryManifest) {
    if (!QA_RESULT_VERDICT_SET.has(normalizedVerdict)) {
      console.error('[run-manifest] Invalid exploratory result: use PASS, FAILED, N/A or UNTEST');
      process.exit(2);
    }
    manifest.status = normalizedVerdict;
  } else {
    manifest.status = normalizedVerdict || 'COMPLETED';
  }
  manifest.finished_time = finishedTime.toISOString();
  manifest.duration_ms = finishedTime.getTime() - startTime.getTime();
  manifest.summary = {
    total_cases: parseInt(getArg('--total-cases', '0'), 10),
    passed: parseInt(getArg('--passed', '0'), 10),
    failed: parseInt(getArg('--failed', '0'), 10),
    untested: parseInt(getArg('--untested', '0'), 10),
  };

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  fs.writeFileSync(path.join(EVID, 'manifest-latest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  console.log(`[run-manifest] Manifest finalized: ${manifest.run_id}`);
  console.log(`  Verdict:  ${manifest.status}`);
  console.log(`  Duration: ${(manifest.duration_ms / 1000).toFixed(2)}s`);
  console.log(`  Summary:  ${manifest.summary.passed}/${manifest.summary.total_cases} passed`);
}
