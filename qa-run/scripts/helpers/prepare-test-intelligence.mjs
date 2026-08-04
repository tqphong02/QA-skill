#!/usr/bin/env node
/**
 * Refresh source-derived knowledge when needed, then build one risk-ranked
 * Business Execution Brief for exploratory, ad-hoc, retest, or regression work.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const getArg = (flag, fallback = '') => {
  const index = args.indexOf(flag);
  return index !== -1 ? args[index + 1] || fallback : fallback;
};

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(scriptDir, '..', '..');
const dataDir = path.resolve(process.env.QA_DATA_DIR || process.cwd());
const scope = getArg('--scope', getArg('--module', '')).trim();
const intent = getArg('--intent', 'EXPLORATORY_BROWSER_QA').toUpperCase();
const repoArg = getArg('--repo', '').trim();
const refreshSource = getArg('--refresh-source', 'auto').toLowerCase();
const runMode = getArg('--run-mode', process.env.QA_RUN_MODE || 'auto').toLowerCase();
const discoveryParallel = getArg(
  '--discovery-parallel',
  process.env.QA_DISCOVERY_PARALLEL || 'auto',
).toLowerCase();
const cardMaxTokens = getArg('--card-max-tokens', '').trim();
const noCache = args.includes('--no-cache');
const output = path.resolve(getArg(
  '--output',
  path.join(dataDir, 'qa-knowledge', 'context', 'business-execution-brief.json'),
));
const uiFirstIntent = ['EXPLORATORY_BROWSER_QA', 'EXPLORATORY_ADHOC'].includes(intent);
const optionalContextCandidates = [
  path.join(dataDir, 'qa-knowledge', 'knowledge-index.json'),
  path.join(dataDir, 'qa-knowledge', 'app-flow-map.json'),
  path.join(dataDir, 'qa-knowledge', 'app-business-guide.md'),
  output,
];

if (!scope) {
  console.error('[test-intelligence] BLOCKED: --scope is required');
  process.exit(2);
}
if (!['auto', 'always', 'never'].includes(refreshSource)) {
  console.error('[test-intelligence] BLOCKED: --refresh-source must be auto, always, or never');
  process.exit(2);
}
if (!['auto', 'fast', 'scoped', 'deep'].includes(runMode)) {
  console.error('[test-intelligence] BLOCKED: --run-mode must be auto, fast, scoped, or deep');
  process.exit(2);
}
if (!['auto', 'on', 'off'].includes(discoveryParallel)) {
  console.error('[test-intelligence] BLOCKED: --discovery-parallel must be auto, on, or off');
  process.exit(2);
}

if (uiFirstIntent && !repoArg && !optionalContextCandidates.some(candidate => fs.existsSync(candidate))) {
  console.log('[test-intelligence] UI_FIRST: no optional source, requirement or saved knowledge; continue from live browser UI');
  process.exit(0);
}

function gitCommit(repoPath) {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: repoPath,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'unknown';
  }
}

function gitWorkingTreeChanged(repoPath) {
  try {
    return Boolean(execFileSync('git', [
      'status', '--porcelain', '--untracked-files=all', '--', '.',
    ], {
      cwd: repoPath,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim());
  } catch {
    return false;
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function sourceRefreshReason(repoPath) {
  const repoName = path.basename(repoPath);
  const knowledgeDir = path.join(dataDir, 'qa-knowledge', 'repositories', repoName);
  const metadataPath = path.join(knowledgeDir, 'repo-metadata.json');
  const requiredArtifacts = [
    'api-contracts.json',
    'business-rules.json',
    'business-flows.json',
    'state-machines.json',
    'permission-matrix.json',
    'business-guide.md',
  ];
  const metadata = readJson(metadataPath);

  if (!metadata) return 'source knowledge is missing';
  if (requiredArtifacts.some(file => !fs.existsSync(path.join(knowledgeDir, file)))) {
    return 'source knowledge is incomplete';
  }
  const currentCommit = gitCommit(repoPath);
  if (currentCommit === 'unknown') {
    return 'source freshness cannot be proven without git metadata';
  }
  if (!metadata.commit || metadata.commit === 'unknown') {
    return 'source knowledge has no stable source commit';
  }
  if (
    metadata.commit !== currentCommit
  ) {
    return `source commit changed (${metadata.commit} -> ${currentCommit})`;
  }
  if (gitWorkingTreeChanged(repoPath)) return 'source working tree has uncommitted changes';
  return '';
}

if (repoArg) {
  const repoPath = path.resolve(repoArg);
  if (!fs.existsSync(repoPath) || !fs.statSync(repoPath).isDirectory()) {
    console.error(`[test-intelligence] BLOCKED: repo directory does not exist: ${repoPath}`);
    process.exit(2);
  }

  const reason = sourceRefreshReason(repoPath);
  const shouldRefresh = refreshSource !== 'never' && (
    refreshSource === 'always'
    || runMode === 'deep'
    || (refreshSource === 'auto' && Boolean(reason))
  );
  if (shouldRefresh) {
    const needsFullBaseline = /missing|incomplete|cannot be proven|no stable source commit/i.test(reason);
    const discoveryMode = refreshSource === 'always'
      || runMode === 'deep'
      || needsFullBaseline
      ? 'full'
      : 'incremental';
    console.log(
      `[test-intelligence] Refreshing source knowledge: ${reason || 'forced refresh'}`
      + ` mode=${discoveryMode} parallel=${discoveryParallel}`,
    );
    const discovery = spawnSync(process.execPath, [
      path.join(skillRoot, 'scripts', 'orchestrators', 'repo-business-discovery.mjs'),
      '--repo',
      repoPath,
      '--mode',
      discoveryMode,
      '--scope',
      scope,
      '--parallel',
      discoveryParallel,
    ], {
      cwd: dataDir,
      env: {
        ...process.env,
        QA_DATA_DIR: dataDir,
        QA_DISCOVERY_PARALLEL: discoveryParallel,
      },
      stdio: 'inherit',
    });
    if (discovery.status !== 0) {
      console.error(`[test-intelligence] BLOCKED: source discovery failed with exit ${discovery.status}`);
      process.exit(2);
    }
  } else {
    console.log(
      refreshSource === 'never'
        ? '[test-intelligence] Source refresh disabled by --refresh-source never'
        : `[test-intelligence] Source knowledge is current; run-mode=${runMode}`,
    );
  }
}

const contextArgs = [
  path.join(skillRoot, 'scripts', 'helpers', 'context-builder.mjs'),
  '--intent',
  intent,
  '--scope',
  scope,
  '--run-mode',
  runMode,
  '--output',
  output,
];
for (const flag of ['--target', '--expected', '--role', '--impact', '--ticket']) {
  const value = getArg(flag, '').trim();
  if (value) contextArgs.push(flag, value);
}
if (cardMaxTokens) contextArgs.push('--card-max-tokens', cardMaxTokens);
if (noCache) contextArgs.push('--no-cache');

const build = spawnSync(process.execPath, contextArgs, {
  cwd: dataDir,
  env: { ...process.env, QA_DATA_DIR: dataDir },
  encoding: 'utf8',
});
if (build.stdout) process.stdout.write(build.stdout);
if (build.stderr) process.stderr.write(build.stderr);

const brief = readJson(output);
if (brief) {
  console.log(
    `[test-intelligence] risks=${brief.risk_inventory?.length || 0}`
    + ` charters=${brief.exploratory_charters?.length || 0}`
    + ` confidence=${brief.knowledge_health?.confidence || 'unknown'}`,
  );
}

process.exit(build.status ?? 2);
