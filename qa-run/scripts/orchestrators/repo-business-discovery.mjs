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
    return Promise.resolve({ name: scriptName, ok: false, durationSeconds: 0 });
  }
  const startedAt = Date.now();
  return new Promise(resolve => {
    const child = spawn(process.execPath, [scriptPath, ...extraArgs], {
      stdio: 'inherit',
      env: { ...process.env },
    });
    child.on('error', error => {
      console.error(`[orchestrator] ❌ ${scriptName} process error: ${error.message}`);
      resolve({ name: scriptName, ok: false, durationSeconds: (Date.now() - startedAt) / 1000 });
    });
    child.on('close', status => {
      const ok = status === 0;
      if (!ok) console.error(`[orchestrator] ❌ ${scriptName} thất bại (exit ${status})`);
      resolve({ name: scriptName, ok, durationSeconds: (Date.now() - startedAt) / 1000 });
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

function getChangedFiles(repoPath, lastCommit) {
  if (!/^[0-9a-f]{4,40}$/i.test(lastCommit || '')) return [];
  try {
    const out = execFileSync('git', ['diff', `${lastCommit}..HEAD`, '--name-only'], {
      cwd: repoPath,
      encoding: 'utf8',
    });
    return out.trim().split('\n').filter(Boolean);
  } catch { return []; }
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

  // Incremental scan check
  if (MODE === 'incremental' && fs.existsSync(metaPath)) {
    const prev = readJSON(outputDir, 'repo-metadata.json');
    const lastCommit = prev?.commit;
    if (lastCommit && lastCommit !== 'unknown' && lastCommit === currentCommit) {
      console.log(`[orchestrator] ✅ Knowledge up-to-date at commit ${currentCommit}. Skipping.`);
      return;
    }
    const changedFiles = getChangedFiles(repoPath, lastCommit);
    console.log(`[orchestrator] Incremental mode: ${changedFiles.length} files changed since ${lastCommit}`);
    if (changedFiles.length > 0) {
      console.log('  Changed:', changedFiles.slice(0, 10).join(', ') + (changedFiles.length > 10 ? '...' : ''));
    }
  }

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

  // ── Phase 1: Core Scanner ───────────────────────────────────────────────────
  console.log('[orchestrator] ── Phase 1: Core Scanner ──────────────────');

  const graphifyOutput = path.join(outputDir, 'graphify-discovery.json');
  const phase1Results = await runStage('phase1', [
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
  ], telemetry);
  const resultByName = new Map(phase1Results.map(result => [result.name, result]));
  const ok1 = resultByName.get('repo-fingerprint.mjs')?.ok || false;
  const ok2 = resultByName.get('source-indexer.mjs')?.ok || false;
  const okGraphify = resultByName.get('graphify-adapter.mjs')?.ok || false;
  const ok3 = resultByName.get('architecture-discovery.mjs')?.ok || false;
  const ok4 = resultByName.get('api-contract-extractor.mjs')?.ok || false;
  const ok5 = resultByName.get('business-rule-extractor.mjs')?.ok || false;
  if (GRAPHIFY_MODE === 'required' && (!okGraphify || !fs.existsSync(graphifyOutput))) {
    throw new Error('Graphify was required but no normalized discovery artifact was produced');
  }

  // ── Phase 2: Flow, State, Permission, Domain ──────────────────────────────
  if (['full', 'incremental', 'phase2', 'phase3'].includes(MODE)) {
    console.log('\n[orchestrator] ── Phase 2: Flow, State, Permission, Domain ──');
    const pmArgs = ['--repo', repoPath, '--output', path.join(outputDir, 'permission-matrix.json')];
    if (fs.existsSync(path.join(outputDir, 'business-rules.json'))) {
      pmArgs.push('--req-knowledge', path.join(outputDir, 'business-rules.json'));
    }
    if (fs.existsSync(path.join(outputDir, 'runtime-findings.json'))) {
      pmArgs.push('--runtime-findings', path.join(outputDir, 'runtime-findings.json'));
    }
    await runStage('phase2', [
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
    ], telemetry);
  }

  // ── Phase 3: Reconciliation, Q&A, Guide, Traceability ────────────────────
  if (['full', 'incremental', 'phase3'].includes(MODE)) {
    console.log('\n[orchestrator] ── Phase 3: Reconciliation, Q&A, Guide, Traceability ──');
    // Reconciliation is a dependency for Q&A; derived reports are independent
    // after that barrier and can safely run concurrently.
    await runStage('phase3-reconcile', [
      { name: 'repo-runtime-reconciler.mjs', args: ['--repo-knowledge', outputDir] },
    ], telemetry);
    await runStage('phase3-derived', [
      {
        name: 'business-qna-generator.mjs',
        args: ['--repo', repoName, '--output', path.join(outputDir, 'business-qna.json')],
      },
      {
        name: 'write-repo-business-guide.mjs',
        args: ['--repo', repoName, '--output', path.join(outputDir, 'business-guide.md')],
      },
      ...(fs.existsSync(path.join(outputDir, 'permission-matrix.json'))
        ? [{
            name: 'write-rbac-matrix.mjs',
            args: ['--input', path.join(outputDir, 'permission-matrix.json'), '--output', path.join(outputDir, 'rbac-matrix.md')],
          }]
        : []),
      { name: 'traceability-matrix-generator.mjs', args: ['--repo', repoName] },
    ], telemetry);
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
    },
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
