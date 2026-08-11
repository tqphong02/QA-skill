#!/usr/bin/env node
/**
 * traceability-matrix-generator.mjs — Business Flow → Rule → API → DB → Testcase Tracer
 *
 * Sinh bảng Traceability Matrix:
 *   Business Flow → Business Rule → API Endpoint → DB Entity → Testcase Hint
 *
 * Đọc tất cả artifacts từ qa-knowledge/repositories/<repo>/ và
 * cross-reference để tạo bảng liên kết hoàn chỉnh.
 *
 * Usage:
 *   node traceability-matrix-generator.mjs --repo my-backend
 *   node traceability-matrix-generator.mjs --repo-knowledge /path/to/qa-knowledge/repositories/my-backend
 *   node traceability-matrix-generator.mjs --repo my-backend --output qa-knowledge/repositories/my-backend/traceability-matrix.md
 */

import fs from 'node:fs';
import path from 'node:path';

const args    = process.argv.slice(2);
const getArg  = (flag, def) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : def; };

const REPO_NAME   = getArg('--repo', null);
const KNOW_DIR    = getArg('--repo-knowledge', null);
const OUTPUT_FILE = getArg('--output', null);
const DATA_DIR    = process.env.QA_DATA_DIR || process.cwd();

function resolveKnowledgeDir() {
  if (KNOW_DIR) return KNOW_DIR;
  if (REPO_NAME) return path.join(DATA_DIR, 'qa-knowledge', 'repositories', REPO_NAME);
  console.error('[traceability-matrix-generator] ❌ Cần --repo <name> hoặc --repo-knowledge <path>');
  process.exit(1);
}

function readJSON(dir, filename) {
  const fp = path.join(dir, filename);
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch { return null; }
}

function matchRulesToFlow(flow, rules) {
  if (!rules) return [];
  // Match by module name
  return rules.filter(r =>
    r.module?.toLowerCase() === flow.module?.toLowerCase() ||
    r.source?.includes(flow.module)
  ).slice(0, 3).map(r => r.ruleId);
}

function matchAPIToFlow(flow, endpoints) {
  if (!endpoints) return [];
  // Match by HTTP method and path keywords from flow name
  return endpoints.filter(e =>
    e.module?.toLowerCase() === flow.module?.toLowerCase()
  ).slice(0, 3).map(e => `${e.method} ${e.path}`);
}

function matchEntitiesToFlow(flow, entities) {
  if (!entities) return [];
  // Simple heuristic: entity name appears in module name or flow name
  return entities.filter(e => {
    const eName = e.name.toLowerCase();
    const fModule = flow.module?.toLowerCase() || '';
    return fModule.includes(eName) || eName.includes(fModule.replace(/s$/, ''));
  }).slice(0, 2).map(e => e.name);
}

function generateTestcaseHints(flow, matchedRules, matchedAPIs) {
  const hints = [];

  if (matchedAPIs.length > 0) {
    hints.push('Happy path: request hợp lệ → response 2xx');
  }
  if (matchedRules.some(r => r.includes('PERMISSION'))) {
    hints.push('Auth: request không có token → 401, sai role → 403');
  }
  if (matchedRules.some(r => r.includes('STATE'))) {
    hints.push('State: trigger action ở trạng thái sai → lỗi rõ ràng');
  }
  if (matchedRules.some(r => r.includes('VALIDATION'))) {
    hints.push('Validation: missing/invalid field → 400 với message rõ');
  }
  if (flow.sideEffects?.includes('database_write')) {
    hints.push('Rollback: lỗi giữa chừng không được persist data');
  }
  if (flow.sideEffects?.includes('send_email') || flow.sideEffects?.includes('publish_event')) {
    hints.push('Side effect: notification được gửi đúng trigger');
  }
  if (hints.length === 0) hints.push('Verify response schema và HTTP status code');

  return hints;
}

async function main() {
  const knowledgeDir = resolveKnowledgeDir();

  if (!fs.existsSync(knowledgeDir)) {
    console.error(`[traceability-matrix-generator] ❌ Knowledge dir không tồn tại: ${knowledgeDir}`);
    process.exit(1);
  }

  const flows  = readJSON(knowledgeDir, 'business-flows.json');
  const rules  = readJSON(knowledgeDir, 'business-rules.json');
  const api    = readJSON(knowledgeDir, 'api-contracts.json');
  const domain = readJSON(knowledgeDir, 'domain-model.json');
  const meta   = readJSON(knowledgeDir, 'repo-metadata.json');

  const repoName = meta?.repoName || REPO_NAME || path.basename(knowledgeDir);
  const allFlows = flows?.flows || [];
  const allRules = rules?.rules || [];
  const allEndpoints = api?.endpoints || [];
  const allEntities = domain?.entities || [];

  const matrix = allFlows.map(flow => ({
    flowId:    flow.flowId,
    flowName:  flow.name,
    module:    flow.module,
    actor:     flow.actor,
    trigger:   flow.trigger,
    rules:     matchRulesToFlow(flow, allRules),
    apis:      matchAPIToFlow(flow, allEndpoints),
    entities:  matchEntitiesToFlow(flow, allEntities),
    testHints: generateTestcaseHints(flow, matchRulesToFlow(flow, allRules), matchAPIToFlow(flow, allEndpoints)),
    confidence: flow.confidence,
  }));

  // Also add orphan rules (rules not tied to any flow)
  const coveredModules = new Set(allFlows.map(f => f.module));
  const orphanRules = allRules.filter(r => !coveredModules.has(r.module)).slice(0, 20);

  const md = `# Traceability Matrix: ${repoName}

> Sinh tự động bởi \`traceability-matrix-generator.mjs\` — ${new Date().toISOString()}  
> Dùng file này để đảm bảo mọi business flow đều có testcase tương ứng

---

## Flow → Rule → API → Entity → Testcase Hints

| Flow ID | Flow Name | Module | Rules | APIs | Entities | Test Hints | Confidence |
|:---|:---|:---|:---|:---|:---|:---|:---:|
${matrix.map(m => [
  `\`${m.flowId || '-'}\``,
  m.flowName?.slice(0, 40) || '-',
  m.module || '-',
  m.rules.join('<br>') || '-',
  m.apis.map(a => `\`${a}\``).join('<br>') || '-',
  m.entities.join(', ') || '-',
  m.testHints.slice(0, 2).join(' | ').slice(0, 80),
  m.confidence === 'verified' ? '✅' : '⚠️',
].join(' | ')).join('\n')}

---

## Orphan Business Rules (không gắn với flow nào)

> Các rule này tồn tại trong code nhưng chưa được ánh xạ vào flow — cần bổ sung testcase riêng

| Rule ID | Module | Category | Condition | Failure |
|:---|:---|:---|:---|:---|
${orphanRules.map(r =>
  `| \`${r.ruleId}\` | ${r.module} | ${r.category} | ${r.condition.slice(0, 70)} | ${r.failureResult} |`
).join('\n') || '| _Tất cả rules đã được ánh xạ_ | | | | |'}

---

## Coverage Summary

| Metric | Count |
|:---|:---:|
| Total flows | ${allFlows.length} |
| Flows với rules | ${matrix.filter(m => m.rules.length > 0).length} |
| Flows với APIs | ${matrix.filter(m => m.apis.length > 0).length} |
| Flows với entities | ${matrix.filter(m => m.entities.length > 0).length} |
| Orphan rules | ${orphanRules.length} |
| Total testcase hints | ${matrix.reduce((s, m) => s + m.testHints.length, 0)} |

---

_Cập nhật lại: \`node dynamic-testing/web-exploratory/scripts/repo-business-discovery.mjs --repo <path> --mode full\`_
`;

  const outputPath = OUTPUT_FILE || path.join(knowledgeDir, 'traceability-matrix.md');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, md, 'utf8');
  console.log(`[traceability-matrix-generator] ✅ Saved: ${outputPath}`);
  console.log(`  ${matrix.length} flows mapped, ${orphanRules.length} orphan rules`);
}

main().catch(err => {
  console.error('[traceability-matrix-generator] FATAL:', err.message);
  process.exit(1);
});
