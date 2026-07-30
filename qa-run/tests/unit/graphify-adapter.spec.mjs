import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(testDir, '..', '..');
const adapter = path.join(skillRoot, 'scripts', 'discovery', 'graphify-adapter.mjs');
const contextBuilder = path.join(skillRoot, 'scripts', 'helpers', 'context-builder.mjs');
const fixture = path.join(skillRoot, 'tests', 'fixtures', 'graphify-graph.json');
const repo = path.join(skillRoot, 'tests', 'fixtures', 'nestjs-app');

test('Graphify adapter imports graph.json and preserves confidence provenance', () => {
  const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'graphify-adapter-'));
  const output = path.join(temporaryDir, 'graphify-discovery.json');
  const run = spawnSync(process.execPath, [
    adapter,
    '--repo',
    repo,
    '--graph',
    fixture,
    '--output',
    output,
  ], { encoding: 'utf8' });

  assert.equal(run.status, 0, run.stderr);
  const artifact = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.equal(artifact.tool, 'graphify-adapter');
  assert.equal(artifact.provenancePolicy.classification, 'source-derived-candidate');
  assert.equal(artifact.summary.totalNodes, 3);
  assert.equal(artifact.summary.totalEdges, 2);
  assert.deepEqual(
    artifact.candidates.map(candidate => candidate.confidence).sort(),
    ['EXTRACTED', 'INFERRED'],
  );
  assert.ok(artifact.candidates.every(candidate => candidate.crossFile));
});

test('Graphify adapter dry-run is code-only and disables query logging', () => {
  const output = path.join(os.tmpdir(), 'unused-graphify-discovery.json');
  const run = spawnSync(process.execPath, [
    adapter,
    '--repo',
    repo,
    '--output',
    output,
    '--command',
    process.execPath,
    '--dry-run',
  ], { encoding: 'utf8' });

  assert.equal(run.status, 0, run.stderr);
  const contract = JSON.parse(run.stdout);
  assert.ok(contract.args.includes('--code-only'));
  assert.equal(contract.env.GRAPHIFY_QUERY_LOG_DISABLE, '1');
});

test('Graphify adapter distinguishes optional and required missing runtimes', () => {
  const output = path.join(os.tmpdir(), 'missing-graphify-discovery.json');
  const baseArgs = [
    adapter,
    '--repo', repo,
    '--output', output,
    '--command', 'graphify-does-not-exist-for-test',
  ];
  const optional = spawnSync(process.execPath, [...baseArgs, '--mode', 'auto'], { encoding: 'utf8' });
  assert.equal(optional.status, 0, optional.stderr);
  assert.match(optional.stdout, /SKIPPED: Graphify runtime_missing/);

  const required = spawnSync(process.execPath, [...baseArgs, '--mode', 'required'], { encoding: 'utf8' });
  assert.equal(required.status, 2);
  assert.match(required.stderr, /Graphify runtime_missing/);
});

test('Test intelligence consumes Graphify only as dependency candidates', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'graphify-context-'));
  const knowledgeDir = path.join(dataDir, 'qa-knowledge');
  const repositoryDir = path.join(knowledgeDir, 'repositories', 'nestjs-app');
  fs.mkdirSync(repositoryDir, { recursive: true });
  const normalized = path.join(repositoryDir, 'graphify-discovery.json');

  const imported = spawnSync(process.execPath, [
    adapter,
    '--repo', repo,
    '--graph', fixture,
    '--output', normalized,
  ], { encoding: 'utf8' });
  assert.equal(imported.status, 0, imported.stderr);

  fs.writeFileSync(path.join(knowledgeDir, 'knowledge-index.json'), JSON.stringify({
    source_repositories: {
      'nestjs-app': {
        artifacts: ['qa-knowledge/repositories/nestjs-app/graphify-discovery.json'],
      },
    },
  }, null, 2));

  const output = path.join(knowledgeDir, 'context', 'business-execution-brief.json');
  const built = spawnSync(process.execPath, [
    contextBuilder,
    '--intent', 'EXPLORATORY_ADHOC',
    '--scope', 'order',
    '--output', output,
  ], {
    encoding: 'utf8',
    env: { ...process.env, QA_DATA_DIR: dataDir },
  });
  assert.equal(built.status, 3, built.stderr);

  const brief = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.ok(brief.business_context.impact_areas.includes('OrderController'));
  assert.ok(brief.source_evidence.some(evidence => (
    evidence.kind === 'dependency_candidate'
    && evidence.confidence === 'source-derived-candidate'
  )));
  assert.equal(
    brief.business_context.business_rules.some(rule => rule.includes('OrderController')),
    false,
  );
});
