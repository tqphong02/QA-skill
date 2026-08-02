#!/usr/bin/env node
/**
 * repo-business-discovery.mjs — Orchestrator for REPO_BUSINESS_DISCOVERY
 *
 * Điều phối toàn bộ quy trình phân tích repository:
 *   Phase 1: Fingerprint → Source Index → Architecture → API Contracts → Business Rules
 *   Phase 2: Business Flows → State Machines → Permission Matrix → Domain Model
 *   Phase 3: Runtime Reconciliation → Q&A Generation → Business Guide → Traceability Matrix
 *
 * Chế độ scan (--mode):
 *   --mode full         Chạy toàn bộ Phase 1, 2 và 3 (mặc định)
 *   --mode incremental  Chỉ quét phần thay đổi theo git diff
 *   --mode phase1       Chỉ Phase 1 (scanner lõi)
 *
 * Chế độ phân tích (--analysis-mode):
 *   --analysis-mode deterministic  (Mặc định) Nhanh, 0 token AI, kết quả cấu trúc JSON/MD
 *   --analysis-mode semantic       Tự động gọi AI diễn giải ý nghĩa nghiệp vụ từ JSON đã rút gọn
 *
 * Lớp graph intelligence (--graphify):
 *   --graphify auto      Dùng Graphify code-only nếu runtime có sẵn (mặc định)
 *   --graphify required  Dừng nếu Graphify thiếu hoặc thất bại
 *   --graphify off       Không chạy Graphify
 *
 * Usage:
 *   node repo-business-discovery.mjs --repo /path/to/backend --mode full
 *   node repo-business-discovery.mjs --repo . --mode incremental
 *   node repo-business-discovery.mjs --workspace /path/to/project --repos frontend,backend --mode full
 */

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveScriptPath } from '../registry.mjs';
import {
  buildFullImpactPlan,
  buildIncrementalImpactPlan,
  planTaskNames,
} from '../../lib/change-impact.mjs';
import { collectChangedFiles } from '../../lib/git-changes.mjs';
import { assertDiscoveryStage } from '../../lib/discovery-gate.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args    = process.argv.slice(2);
const getArg  = (flag, def) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : def; };

const REPO_PATH     = path.resolve(getArg('--repo', '.'));
const WORKSPACE     = getArg('--workspace', null);
const REPOS_CSV     = getArg('--repos', null);
const MODE          = getArg('--mode', 'full');
const ANALYSIS_MODE = getArg('--analysis-mode', 'deterministic');
const GRAPHIFY_MODE = getArg('--graphify', 'auto').toLowerCase();
const SCOPE         = getArg('--scope', '').trim();
const PARALLEL_MODE = (args.includes('--no-parallel')
  ? 'off'
  : getArg('--parallel', process.env.QA_DISCOVERY_PARALLEL || 'auto')).toLowerCase();
const DATA_DIR      = process.env.QA_DATA_DIR || process.cwd();
const KNOW_BASE     = path.join(DATA_DIR, 'qa-knowledge', 'repositories');
const MERGED_DIR    = path.join(DATA_DIR, 'qa-knowledge', 'merged');

if (!['auto', 'required', 'off'].includes(GRAPHIFY_MODE)) {
  console.error('[repo-orchestrator] BLOCKED: --graphify must be auto, required, or off');
  process.exit(2);
}
if (!['auto', 'on', 'off'].includes(PARALLEL_MODE)) {
  console.error('[repo-orchestrator] BLOCKED: --parallel must be auto, on, or off');
  process.exit(2);
}
const PARALLEL_ENABLED = PARALLEL_MODE !== 'off';

function runScriptAsync(scriptName, extraArgs = []) {
  const scriptPath = resolveScriptPath(scriptName);
  if (!fs.existsSync(scriptPath)) {
    console.warn(`[orchestrator] ⚠️  Script không tồn tại: ${scriptName} — bỏ qua`);
    return Promise.resolve({ name: scriptName, ok: false, status: null, durationSeconds: 0 });
  }
  const startedAt = Date.now();
  return new Promise(resolve => {
    const child = spawn(process.execPath, [scriptPath, ...extraArgs], {
      stdio: 'inherit',
      env: { ...process.env },
    });
    child.on('error', error => {
      console.error(`[orchestrator] ❌ ${scriptName} process error: ${error.message}`);
      resolve({ name: scriptName, ok: false, status: null, durationSeconds: (Date.now() - startedAt) / 1000 });
    });
    child.on('close', status => {
      const ok = status === 0;
      if (!ok) console.error(`[orchestrator] ❌ ${scriptName} thất bại (exit ${status})`);
      resolve({ name: scriptName, ok, status, durationSeconds: (Date.now() - startedAt) / 1000 });
    });
  });
}

async function runStage(stageName, tasks, telemetry) {
  const startedAt = Date.now();
  const results = PARALLEL_ENABLED
    ? await Promise.all(tasks.map(task => runScriptAsync(task.name, task.args)))
    : [];
  if (!PARALLEL_ENABLED) {
    for (const task of tasks) results.push(await runScriptAsync(task.name, task.args));
  }
  telemetry.phaseDurations[stageName] = (Date.now() - startedAt) / 1000;
  for (const result of results) telemetry.scriptDurations[result.name] = result.durationSeconds;
  return results;
}

function getGitCommit(repoPath) {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: repoPath,
      encoding: 'utf8',
    }).trim();
  } catch {
    return 'unknown';
  }
}

const BASELINE_ARTIFACTS = [
  'repo-metadata.json',
  'symbol-index.json',
  'architecture-map.json',
  'api-contracts.json',
  'business-rules.json',
  'business-flows.json',
  'state-machines.json',
  'permission-matrix.json',
  'domain-model.json',
  'reconciliation-report.json',
  'business-qna.json',
  'business-guide.md',
  'traceability-matrix.md',
  'rbac-matrix.md',
];

function hasCompleteBaseline(outputDir) {
  return BASELINE_ARTIFACTS.every(file => fs.existsSync(path.join(outputDir, file)));
}

function stageTaskDefinitions(outputDir, repoPath, repoName, graphifyOutput, pmArgs) {
  return {
    phase1: [
      {
        name: 'repo-fingerprint.mjs',
        args: ['--repo', repoPath, '--output', path.join(outputDir, 'repo-metadata.json')],
      },
      {
        name: 'source-indexer.mjs',
        args: ['--repo', repoPath, '--output', path.join(outputDir, 'symbol-index.json')],
      },
      {
        name: 'graphify-adapter.mjs',
        args: [
          '--repo', repoPath,
          '--output', graphifyOutput,
          '--graph-root', path.join(outputDir, 'graphify-code-only'),
          '--mode', GRAPHIFY_MODE,
        ],
      },
      {
        name: 'architecture-discovery.mjs',
        args: ['--repo', repoPath, '--output', path.join(outputDir, 'architecture-map.json')],
      },
      {
        name: 'api-contract-extractor.mjs',
        args: ['--repo', repoPath, '--output', path.join(outputDir, 'api-contracts.json')],
      },
      {
        name: 'business-rule-extractor.mjs',
        args: ['--repo', repoPath, '--output', path.join(outputDir, 'business-rules.json')],
      },
    ],
    phase2: [
      {
        name: 'business-flow-builder.mjs',
        args: ['--repo', repoPath, '--output', path.join(outputDir, 'business-flows.json')],
      },
      {
        name: 'state-machine-extractor.mjs',
        args: ['--repo', repoPath, '--output', path.join(outputDir, 'state-machines.json')],
      },
      { name: 'permission-matrix-extractor.mjs', args: pmArgs },
      {
        name: 'database-domain-extractor.mjs',
        args: ['--repo', repoPath, '--output', path.join(outputDir, 'domain-model.json')],
      },
    ],
    phase3Reconcile: [
      { name: 'repo-runtime-reconciler.mjs', args: ['--repo-knowledge', outputDir] },
    ],
    phase3Derived: [
      {
        name: 'business-qna-generator.mjs',
        args: ['--repo', repoName, '--output', path.join(outputDir, 'business-qna.json')],
      },
      {
        name: 'write-repo-business-guide.mjs',
        args: ['--repo', repoName, '--output', path.join(outputDir, 'business-guide.md')],
      },
      {
        name: 'write-rbac-matrix.mjs',
        args: ['--input', path.join(outputDir, 'permission-matrix.json'), '--output', path.join(outputDir, 'rbac-matrix.md')],
      },
      { name: 'traceability-matrix-generator.mjs', args: ['--repo', repoName] },
    ],
  };
}

function selectedTasks(definitions, plan, phase, { forceAll = false } = {}) {
  if (forceAll) {
    return definitions.filter(task => GRAPHIFY_MODE !== 'off' || task.name !== 'graphify-adapter.mjs');
  }
  const selected = new Set(planTaskNames(plan, phase));
  if (GRAPHIFY_MODE === 'off') selected.delete('graphify-adapter.mjs');
  return definitions.filter(task => selected.has(task.name));
}

function generateSystemBusinessMap() {
  fs.mkdirSync(MERGED_DIR, { recursive: true });
  const mapPath = path.join(MERGED_DIR, 'system-business-map.json');

  const systemMap = {
    generatedAt: new Date().toISOString(),
    repositories: {},
  };

  if (fs.existsSync(KNOW_BASE)) {
    const dirs = fs.readdirSync(KNOW_BASE);
    for (const d of dirs) {
      const dirPath = path.join(KNOW_BASE, d);
      if (!fs.statSync(dirPath).isDirectory()) continue;

      const meta  = readJSON(dirPath, 'repo-metadata.json');
      const api   = readJSON(dirPath, 'api-contracts.json');
      const rules = readJSON(dirPath, 'business-rules.json');
      const flows = readJSON(dirPath, 'business-flows.json');

      if (meta) {
        systemMap.repositories[d] = {
          repoName: meta.repoName || d,
          repoType: meta.repoType,
          frameworks: meta.frameworks,
          commit: meta.commit,
          totalEndpoints: api?.totalEndpoints || 0,
          totalRules: rules?.totalRules || 0,
          totalFlows: flows?.totalFlows || 0,
          scannedAt: meta.scannedAt,
        };
      }
    }
  }

  fs.writeFileSync(mapPath, JSON.stringify(systemMap, null, 2), 'utf8');
  console.log(`[orchestrator] ✅ System business map updated: ${mapPath}`);
}

function updateKnowledgeIndex() {
  fs.mkdirSync(path.join(DATA_DIR, 'qa-knowledge'), { recursive: true });
  const indexPath = path.join(DATA_DIR, 'qa-knowledge', 'knowledge-index.json');
  let index = {};
  try {
    index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    if (!index || typeof index !== 'object' || Array.isArray(index)) index = {};
  } catch {
    index = {};
  }

  const sourceRepositories = {
    ...(index.source_repositories && typeof index.source_repositories === 'object'
      ? index.source_repositories
      : {}),
  };
  const artifactNames = [
    'repo-metadata.json',
    'architecture-map.json',
    'api-contracts.json',
    'business-rules.json',
    'business-flows.json',
    'state-machines.json',
    'permission-matrix.json',
    'domain-model.json',
    'reconciliation-report.json',
    'business-qna.json',
    'business-guide.md',
    'graphify-discovery.json',
  ];

  if (fs.existsSync(KNOW_BASE)) {
    for (const repoName of fs.readdirSync(KNOW_BASE)) {
      const repoDir = path.join(KNOW_BASE, repoName);
      if (!fs.statSync(repoDir).isDirectory()) continue;
      const metadata = readJSON(repoDir, 'repo-metadata.json');
      const artifacts = artifactNames
        .map(name => path.join(repoDir, name))
        .filter(file => fs.existsSync(file))
        .map(file => path.relative(DATA_DIR, file));
      sourceRepositories[repoName] = {
        repo_path: metadata?.repoPath || null,
        commit: metadata?.commit || 'unknown',
        modules: (metadata?.modules || []).map(module => module.name || module).filter(Boolean),
        artifacts,
        updated_at: new Date().toISOString(),
      };
    }
  }

  const nextIndex = {
    ...index,
    schema_version: Math.max(Number(index.schema_version) || 0, 1),
    updated_at: new Date().toISOString(),
    source_repositories: sourceRepositories,
  };
  const tempPath = `${indexPath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(nextIndex, null, 2), 'utf8');
  fs.renameSync(tempPath, indexPath);
  console.log(`[orchestrator] ✅ Knowledge index updated: ${indexPath}`);
}

function readJSON(dir, filename) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, filename), 'utf8')); } catch { return null; }
}

async function analyzeRepo(repoPath) {
  const repoName = path.basename(repoPath);
  const outputDir = path.join(KNOW_BASE, repoName);
  fs.mkdirSync(outputDir, { recursive: true });

  const currentCommit = getGitCommit(repoPath);
  const metaPath = path.join(outputDir, 'repo-metadata.json');
  const previousMetadata = readJSON(outputDir, 'repo-metadata.json');
  const lastCommit = previousMetadata?.commit || '';
  const baselineComplete = fs.existsSync(metaPath) && hasCompleteBaseline(outputDir);
  let changedFiles = [];
  let impactPlan;

  // Incremental scan check
  if (MODE === 'incremental' && fs.existsSync(metaPath)) {
    changedFiles = collectChangedFiles(repoPath, lastCommit);
    if (
      lastCommit
      && lastCommit !== 'unknown'
      && currentCommit !== 'unknown'
      && lastCommit === currentCommit
      && changedFiles.length === 0
      && baselineComplete
    ) {
      console.log(`[orchestrator] ✅ Knowledge up-to-date at commit ${currentCommit}. Skipping.`);
      return;
    }
    const stableDelta = currentCommit !== 'unknown'
      && lastCommit
      && lastCommit !== 'unknown'
      && (lastCommit === currentCommit || changedFiles.length > 0);
    impactPlan = buildIncrementalImpactPlan(changedFiles, {
      hasBaseline: baselineComplete && stableDelta,
    });
    console.log(
      `[orchestrator] Incremental mode: ${changedFiles.length} changed files; `
      + `plan=${impactPlan.mode}; ${impactPlan.reason}`,
    );
    if (changedFiles.length > 0) {
      console.log('  Changed:', changedFiles.slice(0, 10).join(', ') + (changedFiles.length > 10 ? '...' : ''));
    }
  } else {
    impactPlan = buildFullImpactPlan(
      MODE === 'full' ? 'full mode requested' : `mode=${MODE} uses the canonical full baseline`,
    );
  }

  if (!impactPlan) impactPlan = buildFullImpactPlan('no safe incremental baseline');

  const uaVendorDir = path.join(DATA_DIR, 'qa-run', 'vendor', 'Understand-Anything');
  const isUABundled = fs.existsSync(uaVendorDir);

  console.log('\n' + '═'.repeat(60));
  console.log(`[repo-orchestrator] 🚀 REPO_BUSINESS_DISCOVERY Pipeline`);
  console.log(`  Target Repo:    ${repoPath}`);
  console.log(`  Mode:           ${MODE}`);
  console.log(`  Scope:          ${SCOPE || '(all)'}`);
  console.log(`  Parallel:       ${PARALLEL_ENABLED ? 'on' : 'off'}`);
  console.log(`  Analysis Mode:  ${ANALYSIS_MODE}`);
  console.log(`  Graphify:       ${GRAPHIFY_MODE}`);
  console.log(`  Semantic Engine: ${isUABundled ? '🟢 BUNDLED (Egonex-AI Understand-Anything)' : '⚪ AST Default'}`);
  console.log(`  Output:         ${outputDir}`);
  console.log(`  Commit:         ${currentCommit}`);
  console.log('═'.repeat(60) + '\n');

  const startTime = Date.now();
  const telemetry = { phaseDurations: {}, scriptDurations: {} };
  let phase2Tasks = [];
  let phase3ReconcileTasks = [];
  let phase3DerivedTasks = [];

  // ── Phase 1: Core Scanner ───────────────────────────────────────────────────
  console.log('[orchestrator] ── Phase 1: Core Scanner ──────────────────');

  const graphifyOutput = path.join(outputDir, 'graphify-discovery.json');
  const pmArgs = ['--repo', repoPath, '--output', path.join(outputDir, 'permission-matrix.json')];
  if (fs.existsSync(path.join(outputDir, 'business-rules.json'))) {
    pmArgs.push('--req-knowledge', path.join(outputDir, 'business-rules.json'));
  }
  if (fs.existsSync(path.join(outputDir, 'runtime-findings.json'))) {
    pmArgs.push('--runtime-findings', path.join(outputDir, 'runtime-findings.json'));
  }
  const definitions = stageTaskDefinitions(outputDir, repoPath, repoName, graphifyOutput, pmArgs);
  const forceAllPhase1 = MODE !== 'incremental' || impactPlan.mode === 'full';
  const phase1Tasks = selectedTasks(definitions.phase1, impactPlan, 'phase1', { forceAll: forceAllPhase1 });
  const phase1Results = await runStage('phase1', phase1Tasks, telemetry);
  assertDiscoveryStage({
    stage: 'phase1',
    outputDir,
    tasks: phase1Tasks,
    results: phase1Results,
    optional: GRAPHIFY_MODE === 'auto' || GRAPHIFY_MODE === 'off' ? ['graphify-adapter.mjs'] : [],
  });
  const resultByName = new Map(phase1Results.map(result => [result.name, result]));
  const ok1 = resultByName.get('repo-fingerprint.mjs')?.ok || fs.existsSync(path.join(outputDir, 'repo-metadata.json'));
  const ok2 = resultByName.get('source-indexer.mjs')?.ok || fs.existsSync(path.join(outputDir, 'symbol-index.json'));
  const okGraphify = resultByName.get('graphify-adapter.mjs')?.ok || false;
  const ok3 = resultByName.get('architecture-discovery.mjs')?.ok || fs.existsSync(path.join(outputDir, 'architecture-map.json'));
  const ok4 = resultByName.get('api-contract-extractor.mjs')?.ok || fs.existsSync(path.join(outputDir, 'api-contracts.json'));
  const ok5 = resultByName.get('business-rule-extractor.mjs')?.ok || fs.existsSync(path.join(outputDir, 'business-rules.json'));
  if (GRAPHIFY_MODE === 'required' && (!okGraphify || !fs.existsSync(graphifyOutput))) {
    throw new Error('Graphify was required but no normalized discovery artifact was produced');
  }

  // ── Phase 2: Flow, State, Permission, Domain ──────────────────────────────
  if (['full', 'incremental', 'phase2', 'phase3'].includes(MODE)) {
    console.log('\n[orchestrator] ── Phase 2: Flow, State, Permission, Domain ──');
    const forceAllPhase2 = MODE !== 'incremental' || impactPlan.mode === 'full';
    phase2Tasks = selectedTasks(definitions.phase2, impactPlan, 'phase2', { forceAll: forceAllPhase2 });
    const phase2Results = await runStage('phase2', phase2Tasks, telemetry);
    assertDiscoveryStage({
      stage: 'phase2',
      outputDir,
      tasks: phase2Tasks,
      results: phase2Results,
    });
  }

  // ── Phase 3: Reconciliation, Q&A, Guide, Traceability ────────────────────
  if (
    ['full', 'phase3'].includes(MODE)
    || (MODE === 'incremental' && impactPlan.refresh_derived)
  ) {
    console.log('\n[orchestrator] ── Phase 3: Reconciliation, Q&A, Guide, Traceability ──');
    // Reconciliation is a dependency for Q&A; derived reports are independent
    // after that barrier and can safely run concurrently.
    phase3ReconcileTasks = definitions.phase3Reconcile;
    const phase3ReconcileResults = await runStage(
      'phase3-reconcile',
      phase3ReconcileTasks,
      telemetry,
    );
    assertDiscoveryStage({
      stage: 'phase3-reconcile',
      outputDir,
      tasks: phase3ReconcileTasks,
      results: phase3ReconcileResults,
    });
    phase3DerivedTasks = definitions.phase3Derived.filter(task => (
      task.name !== 'write-rbac-matrix.mjs'
      || fs.existsSync(path.join(outputDir, 'permission-matrix.json'))
    ));
    const phase3DerivedResults = await runStage('phase3-derived', phase3DerivedTasks, telemetry);
    assertDiscoveryStage({
      stage: 'phase3-derived',
      outputDir,
      tasks: phase3DerivedTasks,
      results: phase3DerivedResults,
    });
  }

  // ── Semantic Enrichment Mode (Optional) ──────────────────────────────────
  if (ANALYSIS_MODE === 'semantic') {
    console.log('\n[orchestrator] ── Semantic Enrichment Mode ──');
    console.log('[orchestrator] ℹ️  Semantic mode enabled: compact JSON prepared for LLM semantic interpretation');
    const semanticSummary = {
      repoName,
      commit: currentCommit,
      note: 'Semantic enrichment enabled. Feed business-guide.md or business-qna.json to AI for natural language domain reasoning.',
      timestamp: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(outputDir, 'semantic-enrichment.json'), JSON.stringify(semanticSummary, null, 2), 'utf8');
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  // ── Write session manifest ────────────────────────────────────────────────
  const sessionManifest = {
    repoName,
    repoPath,
    mode: MODE,
    analysisMode: ANALYSIS_MODE,
    scope: SCOPE || null,
    optimization: {
      parallel_mode: PARALLEL_MODE,
      parallel_enabled: PARALLEL_ENABLED,
      phase_durations_seconds: telemetry.phaseDurations,
      script_durations_seconds: telemetry.scriptDurations,
      selected_tasks: {
        phase1: phase1Tasks.map(task => task.name),
        phase2: phase2Tasks.map(task => task.name),
        phase3_reconcile: phase3ReconcileTasks.map(task => task.name),
        phase3_derived: phase3DerivedTasks.map(task => task.name),
      },
    },
    change_impact: impactPlan,
    commit: currentCommit,
    phase1: {
      fingerprint: ok1,
      sourceIndex: ok2,
      graphify: {
        mode: GRAPHIFY_MODE,
        attempted: GRAPHIFY_MODE !== 'off',
        completed: okGraphify && fs.existsSync(graphifyOutput),
        outcome: fs.existsSync(graphifyOutput)
          ? 'generated'
          : GRAPHIFY_MODE === 'off'
            ? 'disabled'
            : 'skipped_or_unavailable',
        artifact: fs.existsSync(graphifyOutput) ? graphifyOutput : null,
      },
      architecture: ok3,
      apiContracts: ok4,
      businessRules: ok5,
    },
    outputDir,
    completedAt: new Date().toISOString(),
    durationSeconds: parseFloat(duration),
  };

  fs.writeFileSync(
    path.join(outputDir, 'discovery-session.json'),
    JSON.stringify(sessionManifest, null, 2), 'utf8'
  );

  console.log('\n' + '═'.repeat(60));
  console.log(`[orchestrator] ✅ DISCOVERY COMPLETE in ${duration}s`);
  console.log(`  Output directory: ${outputDir}`);
  console.log(`  Files generated:`);
  fs.readdirSync(outputDir).forEach(f => {
    const stat = fs.statSync(path.join(outputDir, f));
    console.log(`    📄 ${f.padEnd(35)} ${(stat.size / 1024).toFixed(1)}KB`);
  });
  console.log('═'.repeat(60));
}

async function main() {
  if (WORKSPACE && REPOS_CSV) {
    const repos = REPOS_CSV.split(',').map(r => r.trim());
    console.log(`[orchestrator] Multi-repo mode: ${repos.join(', ')}`);
    for (const repo of repos) {
      const repoPath = path.resolve(WORKSPACE, repo);
      if (!fs.existsSync(repoPath)) {
        console.warn(`[orchestrator] ⚠️  Repo không tồn tại: ${repoPath} — skip`);
        continue;
      }
      await analyzeRepo(repoPath);
    }
  } else {
    if (!fs.existsSync(REPO_PATH)) {
      console.error(`[orchestrator] ❌ Repo path không tồn tại: ${REPO_PATH}`);
      process.exit(1);
    }
    await analyzeRepo(REPO_PATH);
  }

  // Always update global system-business-map.json
  generateSystemBusinessMap();
  updateKnowledgeIndex();
}

main().catch(err => {
  console.error('[orchestrator] FATAL:', err.message);
  process.exit(1);
});
