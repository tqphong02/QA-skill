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
const intent = getArg('--intent', 'EXPLORATORY_ADHOC').toUpperCase();
const repoArg = getArg('--repo', '').trim();
const refreshSource = getArg('--refresh-source', 'auto').toLowerCase();
const output = path.resolve(getArg(
  '--output',
  path.join(dataDir, 'qa-knowledge', 'context', 'business-execution-brief.json'),
));

if (!scope) {
  console.error('[test-intelligence] BLOCKED: --scope is required');
  process.exit(2);
}
if (!['auto', 'always', 'never'].includes(refreshSource)) {
  console.error('[test-intelligence] BLOCKED: --refresh-source must be auto, always, or never');
  process.exit(2);
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
  if (
    currentCommit !== 'unknown'
    && metadata.commit
    && metadata.commit !== 'unknown'
    && metadata.commit !== currentCommit
  ) {
    return `source commit changed (${metadata.commit} -> ${currentCommit})`;
  }
  return '';
}

if (repoArg) {
  const repoPath = path.resolve(repoArg);
  if (!fs.existsSync(repoPath) || !fs.statSync(repoPath).isDirectory()) {
    console.error(`[test-intelligence] BLOCKED: repo directory does not exist: ${repoPath}`);
    process.exit(2);
  }

  const reason = sourceRefreshReason(repoPath);
  const shouldRefresh = refreshSource === 'always' || (refreshSource === 'auto' && Boolean(reason));
  if (shouldRefresh) {
    console.log(`[test-intelligence] Refreshing source knowledge: ${reason || 'forced refresh'}`);
    const discovery = spawnSync(process.execPath, [
      path.join(skillRoot, 'scripts', 'orchestrators', 'repo-business-discovery.mjs'),
      '--repo',
      repoPath,
      '--mode',
      refreshSource === 'always' ? 'full' : 'incremental',
    ], {
      cwd: dataDir,
      env: { ...process.env, QA_DATA_DIR: dataDir },
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
        : '[test-intelligence] Source knowledge is current',
    );
  }
}

const contextArgs = [
  path.join(skillRoot, 'scripts', 'helpers', 'context-builder.mjs'),
  '--intent',
  intent,
  '--scope',
  scope,
  '--output',
  output,
];
for (const flag of ['--target', '--expected', '--role', '--impact', '--ticket']) {
  const value = getArg(flag, '').trim();
  if (value) contextArgs.push(flag, value);
}

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
