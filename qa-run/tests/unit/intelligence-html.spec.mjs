import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(testDir, '..', '..');
const graphAdapter = path.join(skillRoot, 'scripts', 'discovery', 'graphify-adapter.mjs');
const renderer = path.join(skillRoot, 'scripts', 'writers', 'render-intelligence-html.mjs');
const fixture = path.join(skillRoot, 'tests', 'fixtures', 'graphify-graph.json');
const whiteboxFixture = path.join(skillRoot, 'tests', 'fixtures', 'whitebox-call-graph.json');
const repo = path.join(skillRoot, 'tests', 'fixtures', 'nestjs-app');

test('Intelligence HTML renders a self-contained accessible Graphify companion', () => {
  const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'intelligence-html-'));
  const normalized = path.join(temporaryDir, 'graphify-discovery.json');
  const html = path.join(temporaryDir, 'graphify-discovery.html');

  const imported = spawnSync(process.execPath, [
    graphAdapter,
    '--repo', repo,
    '--graph', fixture,
    '--output', normalized,
  ], { encoding: 'utf8' });
  assert.equal(imported.status, 0, imported.stderr);

  const rendered = spawnSync(process.execPath, [
    renderer,
    '--input', normalized,
    '--output', html,
  ], { encoding: 'utf8' });
  assert.equal(rendered.status, 0, rendered.stderr);

  const output = fs.readFileSync(html, 'utf8');
  assert.match(output, /^<!doctype html>/i);
  assert.match(output, /<g id="svg-content"/);
  assert.match(output, /id="themeToggle"/);
  assert.match(output, /id="detailClose"/);
  assert.doesNotMatch(output, /<script[^>]+\bsrc=|<link[^>]+\bhref=/i);

  const checked = spawnSync(process.execPath, [renderer, '--check', html], { encoding: 'utf8' });
  assert.equal(checked.status, 0, checked.stderr);
  assert.equal(JSON.parse(checked.stdout).status, 'PASS');
});

test('Intelligence HTML renders whitebox bounded call graph without changing evidence level', () => {
  const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'whitebox-html-'));
  const html = path.join(temporaryDir, 'whitebox-call-graph.html');
  const rendered = spawnSync(process.execPath, [
    renderer,
    '--input', whiteboxFixture,
    '--output', html,
  ], { encoding: 'utf8' });

  assert.equal(rendered.status, 0, rendered.stderr);
  const output = fs.readFileSync(html, 'utf8');
  assert.match(output, /source-derived-candidate/);
  assert.match(output, /Resolved calls are not runtime coverage proof/);
  assert.match(output, /PaymentController\.create/);
});

test('Intelligence HTML renders the canonical architecture map when Graphify is unavailable', () => {
  const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'architecture-html-'));
  const input = path.join(temporaryDir, 'architecture-map.json');
  const html = path.join(temporaryDir, 'architecture-map.html');
  fs.writeFileSync(input, JSON.stringify({
    tool: 'architecture-discovery.mjs',
    repoPath: repo,
    totalModules: 1,
    totalFiles: 3,
    globalIntegrations: ['database'],
    modules: [{
      name: 'order',
      controllers: [{ file: 'src/order/order.controller.ts' }],
      services: [{ file: 'src/order/order.service.ts' }],
      repositories: [],
      gateways: [],
      guards: [],
      middlewares: [],
      dtos: [],
      entities: [],
      otherFiles: [],
      integrations: ['database'],
    }],
  }));

  const rendered = spawnSync(process.execPath, [
    renderer,
    '--input', input,
    '--output', html,
  ], { encoding: 'utf8' });
  assert.equal(rendered.status, 0, rendered.stderr);

  const output = fs.readFileSync(html, 'utf8');
  assert.match(output, /Repository architecture/);
  assert.match(output, /order\.controller\.ts/);
  assert.match(output, /Detected from static source patterns/);
  assert.match(output, /qa-diagram-node-count" content="4"/);
});

test('Intelligence HTML blocks an empty semantic diagram', () => {
  const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'empty-html-'));
  const input = path.join(temporaryDir, 'empty-whitebox.json');
  const html = path.join(temporaryDir, 'empty-whitebox.html');
  fs.writeFileSync(input, JSON.stringify({
    graphVersion: '1.0',
    nodes: [],
    edges: [],
  }));

  const rendered = spawnSync(process.execPath, [
    renderer,
    '--input', input,
    '--output', html,
  ], { encoding: 'utf8' });

  assert.equal(rendered.status, 2);
  assert.match(rendered.stderr, /empty semantic diagram/);
  assert.equal(fs.existsSync(html), false);
});

test('Intelligence HTML keeps a large multi-community graph within a readable column bound', () => {
  const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bounded-html-'));
  const input = path.join(temporaryDir, 'large-graphify.json');
  const html = path.join(temporaryDir, 'large-graphify.html');
  const nodes = Array.from({ length: 36 }, (_, index) => ({
    id: `node-${index}`,
    label: `Node ${index}`,
    fileType: 'code',
    source: `src/node-${index}.ts`,
    community: index,
    degree: 2,
  }));
  const candidates = Array.from({ length: 35 }, (_, index) => ({
    sourceId: `node-${index}`,
    source: `Node ${index}`,
    targetId: `node-${index + 1}`,
    target: `Node ${index + 1}`,
    relation: 'calls',
    confidence: 'EXTRACTED',
    sourceRef: `src/node-${index}.ts`,
  }));
  fs.writeFileSync(input, JSON.stringify({
    tool: 'graphify-adapter',
    status: 'generated',
    repository: { path: '/tmp/example', commit: 'abc123' },
    summary: {
      totalNodes: nodes.length,
      totalEdges: candidates.length,
      confidenceCounts: { EXTRACTED: candidates.length },
    },
    nodes,
    candidates,
  }));

  const rendered = spawnSync(process.execPath, [
    renderer,
    '--input', input,
    '--output', html,
  ], { encoding: 'utf8' });

  assert.equal(rendered.status, 0, rendered.stderr);
  const output = fs.readFileSync(html, 'utf8');
  const viewBox = output.match(/viewBox="0 0 (\d+) (\d+)"/);
  assert.ok(viewBox, 'Expected a numeric SVG viewBox');
  assert.ok(Number(viewBox[1]) <= 1260, 'Expected no more than four layout columns');
  assert.ok(Number(viewBox[2]) > 900, 'Expected nodes to wrap into readable rows');
});
