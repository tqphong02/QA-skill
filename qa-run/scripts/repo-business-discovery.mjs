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
 * Usage:
 *   node repo-business-discovery.mjs --repo /path/to/backend --mode full
 *   node repo-business-discovery.mjs --repo . --mode incremental
 *   node repo-business-discovery.mjs --workspace /path/to/project --repos frontend,backend --mode full
 */

import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args    = process.argv.slice(2);
const getArg  = (flag, def) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : def; };

const REPO_PATH     = path.resolve(getArg('--repo', '.'));
const WORKSPACE     = getArg('--workspace', null);
const REPOS_CSV     = getArg('--repos', null);
const MODE          = getArg('--mode', 'full');
const ANALYSIS_MODE = getArg('--analysis-mode', 'deterministic');
const DATA_DIR      = process.env.QA_DATA_DIR || process.cwd();
const KNOW_BASE     = path.join(DATA_DIR, 'qa-knowledge', 'repositories');
const MERGED_DIR    = path.join(DATA_DIR, 'qa-knowledge', 'merged');

function runScript(scriptName, extraArgs = []) {
  const scriptPath = path.join(__dirname, scriptName);
  if (!fs.existsSync(scriptPath)) {
    console.warn(`[orchestrator] ⚠️  Script không tồn tại: ${scriptName} — bỏ qua`);
    return false;
  }
  const result = spawnSync('node', [scriptPath, ...extraArgs], {
    stdio: 'inherit',
    env: { ...process.env },
  });
  if (result.status !== 0) {
    console.error(`[orchestrator] ❌ ${scriptName} thất bại (exit ${result.status})`);
    return false;
  }
  return true;
}

function getGitCommit(repoPath) {
  try { return execSync('git rev-parse --short HEAD', { cwd: repoPath, encoding: 'utf8' }).trim(); } catch { return 'unknown'; }
}

function getChangedFiles(repoPath, lastCommit) {
  try {
    const out = execSync(`git diff ${lastCommit}..HEAD --name-only`, { cwd: repoPath, encoding: 'utf8' });
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

  console.log('\n' + '═'.repeat(60));
  console.log(`[orchestrator] 🚀 REPO_BUSINESS_DISCOVERY`);
  console.log(`  Repo:           ${repoPath}`);
  console.log(`  Mode:           ${MODE}`);
  console.log(`  Analysis Mode:  ${ANALYSIS_MODE}`);
  console.log(`  Output:         ${outputDir}`);
  console.log(`  Commit:         ${currentCommit}`);
  console.log('═'.repeat(60) + '\n');

  const startTime = Date.now();

  // ── Phase 1: Core Scanner ───────────────────────────────────────────────────
  console.log('[orchestrator] ── Phase 1: Core Scanner ──────────────────');

  const ok1 = runScript('repo-fingerprint.mjs', [
    '--repo', repoPath,
    '--output', path.join(outputDir, 'repo-metadata.json'),
  ]);

  const ok2 = runScript('source-indexer.mjs', [
    '--repo', repoPath,
    '--output', path.join(outputDir, 'symbol-index.json'),
  ]);

  const ok3 = runScript('architecture-discovery.mjs', [
    '--repo', repoPath,
    '--output', path.join(outputDir, 'architecture-map.json'),
  ]);

  const ok4 = runScript('api-contract-extractor.mjs', [
    '--repo', repoPath,
    '--output', path.join(outputDir, 'api-contracts.json'),
  ]);

  const ok5 = runScript('business-rule-extractor.mjs', [
    '--repo', repoPath,
    '--output', path.join(outputDir, 'business-rules.json'),
  ]);

  // ── Phase 2: Flow, State, Permission, Domain ──────────────────────────────
  if (['full', 'phase2', 'phase3'].includes(MODE)) {
    console.log('\n[orchestrator] ── Phase 2: Flow, State, Permission, Domain ──');
    runScript('business-flow-builder.mjs',       ['--repo', repoPath, '--output', path.join(outputDir, 'business-flows.json')]);
    runScript('state-machine-extractor.mjs',     ['--repo', repoPath, '--output', path.join(outputDir, 'state-machines.json')]);
    runScript('permission-matrix-extractor.mjs', ['--repo', repoPath, '--output', path.join(outputDir, 'permission-matrix.json')]);
    runScript('database-domain-extractor.mjs',   ['--repo', repoPath, '--output', path.join(outputDir, 'domain-model.json')]);
  }

  // ── Phase 3: Reconciliation, Q&A, Guide, Traceability ────────────────────
  if (['full', 'phase3'].includes(MODE)) {
    console.log('\n[orchestrator] ── Phase 3: Reconciliation, Q&A, Guide, Traceability ──');
    runScript('repo-runtime-reconciler.mjs',     ['--repo-knowledge', outputDir]);
    runScript('business-qna-generator.mjs',      ['--repo', repoName, '--output', path.join(outputDir, 'business-qna.json')]);
    runScript('write-repo-business-guide.mjs',   ['--repo', repoName, '--output', path.join(outputDir, 'business-guide.md')]);
    runScript('traceability-matrix-generator.mjs', ['--repo', repoName]);
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
    commit: currentCommit,
    phase1: { fingerprint: ok1, sourceIndex: ok2, architecture: ok3, apiContracts: ok4, businessRules: ok5 },
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
}

main().catch(err => {
  console.error('[orchestrator] FATAL:', err.message);
  process.exit(1);
});
