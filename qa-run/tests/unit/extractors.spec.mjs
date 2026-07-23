import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = path.resolve(__dirname, '../../scripts');
const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');

function runExtractor(scriptName, repoPath) {
  const scriptPath = path.join(SCRIPTS_DIR, scriptName);
  const tempOut = path.join(FIXTURES_DIR, `temp-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const result = spawnSync('node', [scriptPath, '--repo', repoPath, '--output', tempOut], {
    encoding: 'utf8',
    env: { ...process.env },
  });
  let data = null;
  if (fs.existsSync(tempOut)) {
    data = JSON.parse(fs.readFileSync(tempOut, 'utf8'));
    try { fs.unlinkSync(tempOut); } catch {}
  }
  return { code: result.status, stdout: result.stdout, stderr: result.stderr, data };
}

// ── Test 1: NestJS decorator route extraction ─────────────────────────────────
test('Extractor Test 1: NestJS decorator route extraction', () => {
  const nestFixture = path.join(FIXTURES_DIR, 'nestjs-app');
  const res = runExtractor('api-contract-extractor.mjs', nestFixture);
  assert.equal(res.code, 0, `Script failed: ${res.stderr}`);
  assert.ok(res.data, 'Output JSON should be loaded');

  assert.equal(res.data.totalEndpoints, 5, 'Should find 5 endpoints in NestJS fixture');

  const paths = res.data.endpoints.map(e => `${e.method} ${e.path}`);
  assert.ok(paths.includes('GET /orders'), 'Should extract GET /orders');
  assert.ok(paths.includes('GET /orders/:id'), 'Should extract GET /orders/:id');
  assert.ok(paths.includes('POST /orders'), 'Should extract POST /orders');
  assert.ok(paths.includes('PUT /orders/:id/approve'), 'Should extract PUT /orders/:id/approve');
  assert.ok(paths.includes('DELETE /orders/:id'), 'Should extract DELETE /orders/:id');
});

// ── Test 2: Role guard & permission matrix extraction ────────────────────────
test('Extractor Test 2: Permission matrix extraction with @Roles', () => {
  const nestFixture = path.join(FIXTURES_DIR, 'nestjs-app');
  const res = runExtractor('permission-matrix-extractor.mjs', nestFixture);
  assert.equal(res.code, 0);
  assert.ok(res.data, 'Output JSON should be loaded');

  assert.ok(res.data.roles.includes('admin'), 'Should extract "admin" role');
  assert.ok(res.data.roles.includes('manager'), 'Should extract "manager" role');
  assert.ok(res.data.totalGrants > 0, 'Should find permission grants');
});

// ── Test 3: Express chained middleware route & auth extraction ───────────────
test('Extractor Test 3: Express chained middleware route & auth extraction', () => {
  const expressFixture = path.join(FIXTURES_DIR, 'express-app');
  const res = runExtractor('api-contract-extractor.mjs', expressFixture);
  assert.equal(res.code, 0);
  assert.ok(res.data, 'Output JSON should be loaded');

  assert.ok(res.data.totalEndpoints >= 5, 'Should find Express routes');

  const postProducts = res.data.endpoints.find(e => e.method === 'POST' && e.path === '/products');
  assert.ok(postProducts, 'Should find POST /products');
  assert.equal(postProducts.framework, 'Express');
});

// ── Test 4: Next.js pages/api & App Router route extraction ──────────────────
test('Extractor Test 4: Next.js pages/api and App Router route extraction', () => {
  const nextFixture = path.join(FIXTURES_DIR, 'nextjs-app');
  const res = runExtractor('api-contract-extractor.mjs', nextFixture);
  assert.equal(res.code, 0);
  assert.ok(res.data, 'Output JSON should be loaded');

  const paths = res.data.endpoints.map(e => e.path);

  assert.ok(paths.some(p => p.includes('/api/orders')), 'Should find pages/api/orders');
  assert.ok(paths.some(p => p.includes('/products')), 'Should find app/api/products');
});

// ── Test 5: Fastify schema & route extraction ─────────────────────────────────
test('Extractor Test 5: Fastify schema & route extraction', () => {
  const fastifyFixture = path.join(FIXTURES_DIR, 'fastify-app');
  const res = runExtractor('api-contract-extractor.mjs', fastifyFixture);
  assert.equal(res.code, 0);
  assert.ok(res.data, 'Output JSON should be loaded');

  assert.ok(res.data.totalEndpoints >= 4, 'Should find Fastify routes');
  assert.ok(res.data.endpoints.some(e => e.framework === 'Fastify'));
});

// ── Test 6: State machine transition extraction ──────────────────────────────
test('Extractor Test 6: State transition extraction from Enum & code', () => {
  const nestFixture = path.join(FIXTURES_DIR, 'nestjs-app');
  const res = runExtractor('state-machine-extractor.mjs', nestFixture);
  assert.equal(res.code, 0);
  assert.ok(res.data, 'Output JSON should be loaded');

  assert.ok(res.data.totalStateMachines > 0, 'Should find Order state machine');

  const orderMachine = res.data.stateMachines.find(m => m.entity.toLowerCase().includes('order'));
  assert.ok(orderMachine, 'Should find Order entity machine');
  assert.ok(orderMachine.states.includes('DRAFT'), 'Should detect DRAFT state');
  assert.ok(orderMachine.states.includes('APPROVED'), 'Should detect APPROVED state');
});

// ── Test 7: TypeORM entity domain model extraction ────────────────────────────
test('Extractor Test 7: TypeORM entity domain model extraction & ERD', () => {
  const nestFixture = path.join(FIXTURES_DIR, 'nestjs-app');
  const res = runExtractor('database-domain-extractor.mjs', nestFixture);
  assert.equal(res.code, 0);
  assert.ok(res.data, 'Output JSON should be loaded');

  assert.equal(res.data.totalEntities, 1, 'Should find Order entity');
  assert.equal(res.data.entities[0].name, 'Order');
  assert.ok(res.data.mermaidERD.includes('erDiagram'), 'Should generate Mermaid ERD header');
  assert.ok(res.data.mermaidERD.includes('Order {'), 'Should include Order entity in ERD');
});

// ── Test 8: Business rule category classification ─────────────────────────────
test('Extractor Test 8: Business rule category classification & confidence', () => {
  const nestFixture = path.join(FIXTURES_DIR, 'nestjs-app');
  const res = runExtractor('business-rule-extractor.mjs', nestFixture);
  assert.equal(res.code, 0);
  assert.ok(res.data, 'Output JSON should be loaded');

  assert.ok(res.data.totalRules > 0, 'Should extract business rules from NestJS service');

  const categories = Object.keys(res.data.summaryByCategory);
  assert.ok(categories.length > 0, 'Should classify rules into categories');
});

// ── Test 9: Source indexer quality metrics & parser tracking ──────────────────
test('Extractor Test 9: Source indexer quality report & parser tracking', () => {
  const nestFixture = path.join(FIXTURES_DIR, 'nestjs-app');
  const res = runExtractor('source-indexer.mjs', nestFixture);
  assert.equal(res.code, 0);
  assert.ok(res.data, 'Output JSON should be loaded');

  assert.ok(res.data.qualityReport, 'Should include qualityReport object');
  assert.equal(typeof res.data.qualityReport.filesScanned, 'number');
  assert.ok(res.data.qualityReport.astCoverage, 'Should calculate astCoverage string');
  assert.ok('ts-morph' in res.data.qualityReport.parsersAvailable, 'Should check ts-morph availability');
});

// ── Test 10: Full orchestrator discovery run on NestJS fixture ────────────────
test('Extractor Test 10: Full orchestrator discovery run on NestJS fixture', () => {
  const nestFixture = path.join(FIXTURES_DIR, 'nestjs-app');

  const scriptPath = path.join(SCRIPTS_DIR, 'repo-business-discovery.mjs');
  const result = spawnSync('node', [scriptPath, '--repo', nestFixture, '--mode', 'full'], {
    encoding: 'utf8',
    env: { ...process.env },
  });
  assert.equal(result.status, 0, `Orchestrator failed: ${result.stderr}`);

  const repoKnowledgeDir = path.join(process.cwd(), 'qa-knowledge/repositories/nestjs-app');
  assert.ok(fs.existsSync(repoKnowledgeDir), 'Should create nestjs-app knowledge folder');

  const expectedFiles = [
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
    'analysis-gaps.md',
    'traceability-matrix.md',
    'discovery-session.json',
  ];

  for (const f of expectedFiles) {
    assert.ok(fs.existsSync(path.join(repoKnowledgeDir, f)), `Missing expected output file: ${f}`);
  }

  const mergedDir = path.join(process.cwd(), 'qa-knowledge/merged');
  assert.ok(fs.existsSync(path.join(mergedDir, 'system-business-guide.md')), 'Should create system-business-guide.md');
  assert.ok(fs.existsSync(path.join(mergedDir, 'system-business-map.json')), 'Should create system-business-map.json');
  assert.ok(fs.existsSync(path.join(mergedDir, 'system-qna.json')), 'Should create system-qna.json');
});
