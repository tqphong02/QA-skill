#!/usr/bin/env node
/**
 * Run Graphify as an optional, code-only repository intelligence provider and
 * normalize its complete graph into a QA artifact with a separate compact
 * context slice.
 *
 * Graphify is supplemental. Its output never upgrades a business rule,
 * expected result, runtime observation, or measured coverage state.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const UPSTREAM = {
  repository: 'https://github.com/Graphify-Labs/graphify',
  auditedCommit: 'ecfcd160d56b420eb8241430fa7b5b1951c7829f',
  auditedVersion: '0.9.30',
};

const args = process.argv.slice(2);
const hasFlag = flag => args.includes(flag);
const getArg = (flag, fallback = '') => {
  const index = args.indexOf(flag);
  return index !== -1 ? args[index + 1] || fallback : fallback;
};

const mode = getArg('--mode', 'auto').toLowerCase();
const command = getArg('--command', 'graphify');
const repoArg = getArg('--repo', '').trim();
const graphArg = getArg('--graph', '').trim();
const outputArg = getArg('--output', '').trim();
const graphRootArg = getArg('--graph-root', '').trim();
const maxNodes = Number(getArg('--max-nodes', '0'));
const maxEdges = Number(getArg('--max-edges', '0'));
const contextMaxNodes = Number(getArg('--context-max-nodes', '300'));
const contextMaxEdges = Number(getArg('--context-max-edges', '600'));

function usage() {
  console.log(`Usage:
  node graphify-adapter.mjs --doctor [--command graphify]
  node graphify-adapter.mjs --repo <path> --output <file.json> [--mode auto|required|off]
  node graphify-adapter.mjs --repo <path> --graph <graph.json> --output <file.json>

Options:
  --graph-root <dir>  Graphify output parent; Graphify writes <dir>/graphify-out/
  --max-nodes <n>    Optional canonical node cap; 0 keeps all (default 0)
  --max-edges <n>    Optional canonical edge cap; 0 keeps all (default 0)
  --context-max-nodes <n>  High-degree nodes exposed to AI context (default 300)
  --context-max-edges <n>  Ranked candidates exposed to AI context (default 600)
  --dry-run          Print the resolved extraction command without running it
  --doctor           Report runtime availability without writing files`);
}

function fail(message, code = 2) {
  console.error(`[graphify-adapter] BLOCKED: ${message}`);
  process.exit(code);
}

function commandProbe() {
  const probe = spawnSync(command, ['--version'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const missing = probe.error?.code === 'ENOENT';
  return {
    available: !missing && probe.status === 0,
    command,
    version: (probe.stdout || probe.stderr || '').trim() || null,
    status: missing ? 'runtime_missing' : probe.status === 0 ? 'runtime_available' : 'runtime_broken',
    exitCode: probe.status,
    error: probe.error?.message || (probe.status === 0 ? null : (probe.stderr || '').trim() || null),
  };
}

if (hasFlag('--help') || hasFlag('-h')) {
  usage();
  process.exit(0);
}

if (!['auto', 'required', 'off'].includes(mode)) {
  fail('--mode must be auto, required, or off');
}
if (!Number.isInteger(maxNodes) || maxNodes < 0 || maxNodes > 1000000) {
  fail('--max-nodes must be an integer from 0 to 1000000');
}
if (!Number.isInteger(maxEdges) || maxEdges < 0 || maxEdges > 2000000) {
  fail('--max-edges must be an integer from 0 to 2000000');
}
if (!Number.isInteger(contextMaxNodes) || contextMaxNodes < 1 || contextMaxNodes > 5000) {
  fail('--context-max-nodes must be an integer from 1 to 5000');
}
if (!Number.isInteger(contextMaxEdges) || contextMaxEdges < 1 || contextMaxEdges > 10000) {
  fail('--context-max-edges must be an integer from 1 to 10000');
}

if (hasFlag('--doctor')) {
  console.log(JSON.stringify({
    tool: 'graphify-adapter',
    upstream: UPSTREAM,
    runtime: commandProbe(),
    privacyDefault: 'code-only',
    queryLogDisabledDuringExtraction: true,
  }, null, 2));
  process.exit(0);
}

if (mode === 'off') {
  console.log('[graphify-adapter] disabled by --mode off');
  process.exit(0);
}
if (!repoArg) fail('--repo is required');
if (!outputArg) fail('--output is required');

const repoPath = path.resolve(repoArg);
const outputPath = path.resolve(outputArg);
if (!fs.existsSync(repoPath) || !fs.statSync(repoPath).isDirectory()) {
  fail(`repo directory does not exist: ${repoPath}`);
}

function gitCommit(directory) {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: directory,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'unknown';
  }
}

let runtime = null;
let graphPath;
if (graphArg) {
  graphPath = path.resolve(graphArg);
} else {
  runtime = commandProbe();
  if (!runtime.available) {
    if (mode === 'required') {
      fail(`Graphify ${runtime.status}: ${runtime.error || command}`);
    }
    console.log(`[graphify-adapter] SKIPPED: Graphify ${runtime.status}`);
    process.exit(0);
  }

  const graphRoot = path.resolve(
    graphRootArg || path.join(path.dirname(outputPath), 'graphify-code-only'),
  );
  const extractionArgs = [
    'extract',
    repoPath,
    '--code-only',
    '--out',
    graphRoot,
  ];
  if (hasFlag('--force')) extractionArgs.push('--force');

  if (hasFlag('--dry-run')) {
    console.log(JSON.stringify({
      command,
      args: extractionArgs,
      cwd: repoPath,
      env: {
        GRAPHIFY_QUERY_LOG_DISABLE: '1',
      },
      expectedGraph: path.join(graphRoot, 'graphify-out', 'graph.json'),
    }, null, 2));
    process.exit(0);
  }

  const run = spawnSync(command, extractionArgs, {
    cwd: repoPath,
    env: {
      ...process.env,
      GRAPHIFY_QUERY_LOG_DISABLE: '1',
    },
    stdio: 'inherit',
  });
  if (run.error || run.status !== 0) {
    fail(`Graphify extraction failed with exit ${run.status ?? 'unknown'}: ${run.error?.message || ''}`);
  }
  graphPath = path.join(graphRoot, 'graphify-out', 'graph.json');
}

if (!fs.existsSync(graphPath) || !fs.statSync(graphPath).isFile()) {
  fail(`graph.json was not found: ${graphPath}`);
}

let graph;
try {
  graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
} catch (error) {
  fail(`invalid graph.json: ${error.message}`);
}

const rawNodes = Array.isArray(graph.nodes) ? graph.nodes : [];
const rawEdges = Array.isArray(graph.links)
  ? graph.links
  : Array.isArray(graph.edges)
    ? graph.edges
    : [];
const nodeById = new Map(rawNodes.map(node => [String(node.id), node]));
const degrees = new Map();

function endpointId(value) {
  if (value && typeof value === 'object') return String(value.id ?? value.label ?? '');
  return String(value ?? '');
}

for (const edge of rawEdges) {
  const source = endpointId(edge.source ?? edge.from);
  const target = endpointId(edge.target ?? edge.to);
  if (source) degrees.set(source, (degrees.get(source) || 0) + 1);
  if (target) degrees.set(target, (degrees.get(target) || 0) + 1);
}

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function sourceRef(node, edge) {
  const file = text(edge?.source_file || node?.source_file);
  const location = text(edge?.source_location || node?.source_location);
  return [file, location].filter(Boolean).join(':');
}

const allNodes = rawNodes
  .map(node => ({
    id: text(node.id),
    label: text(node.label || node.name || node.id),
    fileType: text(node.file_type || node.type || 'unknown'),
    source: sourceRef(node),
    community: node.community ?? null,
    degree: degrees.get(String(node.id)) || 0,
  }))
  .filter(node => node.id && node.label)
  .sort((a, b) => b.degree - a.degree || a.label.localeCompare(b.label));
const nodes = maxNodes > 0 ? allNodes.slice(0, maxNodes) : allNodes;

const confidenceRank = { EXTRACTED: 0, INFERRED: 1, AMBIGUOUS: 2 };
const allCandidates = rawEdges
  .map(edge => {
    const sourceId = endpointId(edge.source ?? edge.from);
    const targetId = endpointId(edge.target ?? edge.to);
    const sourceNode = nodeById.get(sourceId);
    const targetNode = nodeById.get(targetId);
    const confidence = text(edge.confidence || 'AMBIGUOUS').toUpperCase();
    const sourceFile = text(sourceNode?.source_file);
    const targetFile = text(targetNode?.source_file);
    return {
      sourceId,
      source: text(sourceNode?.label || sourceId),
      targetId,
      target: text(targetNode?.label || targetId),
      relation: text(edge.relation || edge.type || 'related_to'),
      confidence: ['EXTRACTED', 'INFERRED', 'AMBIGUOUS'].includes(confidence)
        ? confidence
        : 'AMBIGUOUS',
      confidenceScore: Number.isFinite(Number(edge.confidence_score ?? edge.weight))
        ? Number(edge.confidence_score ?? edge.weight)
        : null,
      sourceRef: sourceRef(sourceNode, edge) || sourceRef(targetNode),
      crossFile: Boolean(sourceFile && targetFile && sourceFile !== targetFile),
      sourceCommunity: sourceNode?.community ?? null,
      targetCommunity: targetNode?.community ?? null,
    };
  })
  .filter(edge => edge.source && edge.target)
  .sort((a, b) => (
    Number(b.crossFile) - Number(a.crossFile)
    || confidenceRank[a.confidence] - confidenceRank[b.confidence]
    || a.relation.localeCompare(b.relation)
  ));
const candidates = maxEdges > 0 ? allCandidates.slice(0, maxEdges) : allCandidates;
const retainedNodeIds = new Set(nodes.map(node => node.id));
const retainedCandidates = candidates.filter(candidate => (
  retainedNodeIds.has(candidate.sourceId) && retainedNodeIds.has(candidate.targetId)
));
const contextNodes = nodes.slice(0, contextMaxNodes);
const contextNodeIds = new Set(contextNodes.map(node => node.id));
const contextCandidates = retainedCandidates
  .filter(candidate => (
    contextNodeIds.has(candidate.sourceId) || contextNodeIds.has(candidate.targetId)
  ))
  .slice(0, contextMaxEdges);

function counts(values) {
  return values.reduce((acc, value) => {
    const key = text(value) || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

const normalized = {
  schemaVersion: 2,
  tool: 'graphify-adapter',
  status: 'generated',
  generatedAt: new Date().toISOString(),
  upstream: {
    ...UPSTREAM,
    runtimeVersion: runtime?.version || 'imported-existing-graph',
  },
  repository: {
    path: repoPath,
    commit: gitCommit(repoPath),
  },
  sourceGraph: graphPath,
  extractionMode: graphArg ? 'imported-existing-graph' : 'code-only',
  graphBuiltAtCommit: graph.graph?.built_at_commit
    || graph.built_at_commit
    || graph.metadata?.built_at_commit
    || null,
  provenancePolicy: {
    classification: 'source-derived-candidate',
    extracted: 'Explicit static relationship reported by Graphify; still not runtime proof',
    inferred: 'Candidate relationship that requires source or runtime verification',
    ambiguous: 'Unresolved candidate that must not drive a verdict without review',
  },
  retentionPolicy: {
    canonical: maxNodes === 0 && maxEdges === 0
      ? 'full-project'
      : 'explicitly-capped',
    context: 'bounded-ranked-slice',
    canonicalNodeLimit: maxNodes || null,
    canonicalEdgeLimit: maxEdges || null,
    contextNodeLimit: contextMaxNodes,
    contextEdgeLimit: contextMaxEdges,
  },
  summary: {
    totalNodes: rawNodes.length,
    totalEdges: rawEdges.length,
    normalizedNodes: nodes.length,
    normalizedCandidates: retainedCandidates.length,
    truncatedNodes: allNodes.length > nodes.length,
    truncatedEdges: allCandidates.length > retainedCandidates.length,
    confidenceCounts: counts(rawEdges.map(edge => text(edge.confidence || 'AMBIGUOUS').toUpperCase())),
    relationCounts: counts(rawEdges.map(edge => edge.relation || edge.type || 'related_to')),
    communityCounts: counts(rawNodes.map(node => node.community ?? 'unassigned')),
  },
  nodes,
  candidates: retainedCandidates,
  contextSlice: {
    purpose: 'token-bounded AI retrieval only; never project completeness',
    nodes: contextNodes,
    candidates: contextCandidates,
  },
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
const temporaryPath = `${outputPath}.tmp`;
fs.writeFileSync(temporaryPath, JSON.stringify(normalized, null, 2), 'utf8');
fs.renameSync(temporaryPath, outputPath);

console.log(
  `[graphify-adapter] generated ${outputPath}`
  + ` nodes=${rawNodes.length} edges=${rawEdges.length}`
  + ` retained=${nodes.length}/${retainedCandidates.length}`
  + ` context=${contextNodes.length}/${contextCandidates.length}`,
);
