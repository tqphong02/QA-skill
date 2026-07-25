#!/usr/bin/env node
/**
 * repo-runtime-reconciler.mjs — Static Source vs Runtime Knowledge Reconciler
 *
 * So sánh 3 nguồn knowledge và phân loại từng artifact:
 *   1. Static source code (từ extractors Phase 1+2)
 *   2. Runtime observations (từ extract-flow.mjs, qa-knowledge/app-flow-map.json)
 *   3. Document knowledge (từ business-analysis/BRD/SRS nếu có)
 *
 * Phân loại kết quả theo reconciliation status:
 *   CONFIRMED    — có trong cả source lẫn runtime
 *   STATIC_ONLY  — chỉ thấy trong source code, chưa quan sát runtime
 *   RUNTIME_ONLY — chỉ thấy trong runtime, không tìm thấy trong source
 *   DOC_ONLY     — chỉ có trong BRD/SRS, không thấy trong source hay runtime
 *   CONFLICT     — source và runtime mâu thuẫn (ví dụ: auth required vs không cần auth)
 *   UNKNOWN      — không đủ thông tin để phân loại
 *
 * Đầu ra: reconciliation-report.json
 *
 * Usage:
 *   node repo-runtime-reconciler.mjs --repo my-backend
 *   node repo-runtime-reconciler.mjs --repo-knowledge /path/to/qa-knowledge/repositories/my-backend
 *   node repo-runtime-reconciler.mjs --repo-knowledge /path --runtime-knowledge /path/to/qa-knowledge
 */

import fs from 'node:fs';
import path from 'node:path';

const args    = process.argv.slice(2);
const getArg  = (flag, def) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : def; };

const REPO_NAME       = getArg('--repo', null);
const KNOW_DIR        = getArg('--repo-knowledge', null);
const RUNTIME_DIR     = getArg('--runtime-knowledge', null);
const OUTPUT_FILE     = getArg('--output', null);
const DATA_DIR        = process.env.QA_DATA_DIR || process.cwd();

function resolveKnowledgeDir() {
  if (KNOW_DIR) return KNOW_DIR;
  if (REPO_NAME) return path.join(DATA_DIR, 'qa-knowledge', 'repositories', REPO_NAME);
  console.error('[repo-runtime-reconciler] ❌ Cần --repo <name> hoặc --repo-knowledge <path>');
  process.exit(1);
}

function readJSON(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

function reconcileEndpoints(staticEndpoints, runtimeFlows, docApis) {
  const entries = [];

  // Normalize runtime flows into endpoint-like objects
  const runtimeEndpoints = [];
  if (runtimeFlows) {
    const flows = Array.isArray(runtimeFlows) ? runtimeFlows : (runtimeFlows.flows || []);
    flows.forEach(f => {
      if (f.api_endpoint || f.trigger) {
        runtimeEndpoints.push({
          path: f.api_endpoint || f.trigger,
          method: f.http_method || 'UNKNOWN',
          auth_required: f.requires_auth || false,
        });
      }
    });
  }

  // Process static endpoints
  const staticSet = new Set(staticEndpoints.map(e => `${e.method}:${e.path}`));
  const runtimeSet = new Set(runtimeEndpoints.map(e => `${e.method}:${e.path}`.toLowerCase()));

  for (const ep of staticEndpoints) {
    const key = `${ep.method}:${ep.path}`.toLowerCase();
    const inRuntime = runtimeSet.has(key);

    // Detect conflict: auth_required mismatch
    const rtMatch = runtimeEndpoints.find(r => `${r.method}:${r.path}`.toLowerCase() === key);
    const authConflict = rtMatch && rtMatch.auth_required !== ep.auth_required;

    let result;
    let conflicts = [];
    if (inRuntime && !authConflict) {
      result = 'CONFIRMED';
    } else if (inRuntime && authConflict) {
      result = 'CONFLICT';
      conflicts.push({
        field: 'auth_required',
        sourceValue: ep.auth_required,
        runtimeValue: rtMatch.auth_required,
        description: `Source code: auth_required=${ep.auth_required}, Runtime observed: auth_required=${rtMatch.auth_required}`,
      });
    } else {
      result = 'STATIC_ONLY';
    }

    entries.push({
      entity: `${ep.method} ${ep.path}`,
      type: 'api_endpoint',
      module: ep.module,
      sourceStatus: 'FOUND',
      runtimeStatus: inRuntime ? 'FOUND' : 'NOT_OBSERVED',
      documentStatus: docApis?.some(d => d.path === ep.path) ? 'FOUND' : 'NOT_DOCUMENTED',
      result,
      conflicts,
      confidence: ep.confidence || 'verified',
      sources: [{ file: ep.source, type: 'static_code' }],
    });
  }

  // RUNTIME_ONLY — in runtime but not in source
  for (const re of runtimeEndpoints) {
    const key = `${re.method}:${re.path}`.toLowerCase();
    if (!staticSet.has(key)) {
      entries.push({
        entity: `${re.method} ${re.path}`,
        type: 'api_endpoint',
        module: 'unknown',
        sourceStatus: 'NOT_FOUND',
        runtimeStatus: 'FOUND',
        documentStatus: 'NOT_DOCUMENTED',
        result: 'RUNTIME_ONLY',
        conflicts: [],
        confidence: 'inferred',
        sources: [{ type: 'runtime_observation' }],
      });
    }
  }

  return entries;
}

function reconcileRules(staticRules, runtimeObservations) {
  return staticRules.map(rule => {
    // Try to correlate rule with runtime observations
    const runtimeConfirmed = runtimeObservations?.some(obs =>
      obs.errorType?.includes(rule.category) ||
      obs.message?.toLowerCase().includes(rule.condition.toLowerCase().slice(0, 20))
    );

    return {
      entity: rule.ruleId,
      type: 'business_rule',
      module: rule.module,
      category: rule.category,
      condition: rule.condition.slice(0, 100),
      sourceStatus: 'FOUND',
      runtimeStatus: runtimeConfirmed ? 'FOUND' : 'NOT_OBSERVED',
      documentStatus: 'UNKNOWN',
      result: runtimeConfirmed ? 'CONFIRMED' : 'STATIC_ONLY',
      conflicts: [],
      confidence: rule.confidence,
      sources: [{ file: rule.source, type: 'static_code' }],
    };
  });
}

function buildGapsList(entries) {
  const gaps = [];

  const staticOnlyApis = entries.filter(e => e.type === 'api_endpoint' && e.result === 'STATIC_ONLY');
  const runtimeOnly = entries.filter(e => e.result === 'RUNTIME_ONLY');
  const conflicts = entries.filter(e => e.result === 'CONFLICT');
  const inferredRules = entries.filter(e => e.type === 'business_rule' && e.confidence === 'inferred');

  if (staticOnlyApis.length > 0) {
    gaps.push({
      gapType: 'unobserved_api',
      severity: 'medium',
      description: `${staticOnlyApis.length} API endpoints trong source code chưa được quan sát trong runtime`,
      items: staticOnlyApis.slice(0, 10).map(e => e.entity),
      recommendation: 'Chạy qa-run baseline discovery để observe các endpoint này',
    });
  }

  if (runtimeOnly.length > 0) {
    gaps.push({
      gapType: 'undocumented_runtime_behavior',
      severity: 'high',
      description: `${runtimeOnly.length} hành vi runtime không tìm thấy trong source code`,
      items: runtimeOnly.slice(0, 10).map(e => e.entity),
      recommendation: 'Kiểm tra xem đây có phải proxy/gateway ngoài repo này không',
    });
  }

  if (conflicts.length > 0) {
    gaps.push({
      gapType: 'source_runtime_conflict',
      severity: 'critical',
      description: `${conflicts.length} xung đột giữa source code và runtime`,
      items: conflicts.map(e => ({ entity: e.entity, conflicts: e.conflicts })),
      recommendation: 'Cần xác nhận version code đang chạy có khớp với commit đang scan không',
    });
  }

  if (inferredRules.length > 0) {
    gaps.push({
      gapType: 'inferred_business_rules',
      severity: 'low',
      description: `${inferredRules.length} business rules được suy luận từ tên/pattern, chưa xác nhận`,
      items: inferredRules.slice(0, 10).map(e => e.entity),
      recommendation: 'Con người xác nhận các rule này trước khi đưa vào testcase',
    });
  }

  return gaps;
}

async function main() {
  const knowledgeDir = resolveKnowledgeDir();

  if (!fs.existsSync(knowledgeDir)) {
    console.error(`[repo-runtime-reconciler] ❌ Knowledge dir không tồn tại: ${knowledgeDir}`);
    console.error('  Chạy repo-business-discovery.mjs --mode phase1 trước');
    process.exit(1);
  }

  console.log(`[repo-runtime-reconciler] Reconciling: ${knowledgeDir}`);

  // Load static artifacts
  const apiContracts  = readJSON(path.join(knowledgeDir, 'api-contracts.json'));
  const businessRules = readJSON(path.join(knowledgeDir, 'business-rules.json'));
  const meta          = readJSON(path.join(knowledgeDir, 'repo-metadata.json'));

  // Load runtime observations (from qa-knowledge/app-flow-map.json or merged)
  const runtimeDir = RUNTIME_DIR || DATA_DIR;
  const runtimeFlows = readJSON(path.join(runtimeDir, 'qa-knowledge', 'app-flow-map.json'))
                    || readJSON(path.join(DATA_DIR, 'qa-knowledge', 'app-flow-map.json'))
                    || null;

  if (!runtimeFlows) {
    console.log('[repo-runtime-reconciler] ℹ️  No runtime observations found — all static entries will be STATIC_ONLY');
    console.log('   Run qa-run baseline discovery first to get runtime observations');
  }

  const staticEndpoints = apiContracts?.endpoints || [];
  const staticRules     = businessRules?.rules || [];

  // Reconcile
  const endpointEntries = reconcileEndpoints(staticEndpoints, runtimeFlows, null);
  const ruleEntries     = reconcileRules(staticRules, runtimeFlows?.errorObservations || []);

  const allEntries = [...endpointEntries, ...ruleEntries];

  // Summarize
  const summary = {};
  for (const e of allEntries) {
    summary[e.result] = (summary[e.result] || 0) + 1;
  }

  const gaps = buildGapsList(allEntries);

  const report = {
    tool: 'repo-runtime-reconciler.mjs',
    repoName: meta?.repoName || REPO_NAME || path.basename(knowledgeDir),
    commit: meta?.commit || 'unknown',
    reconciledAt: new Date().toISOString(),
    hasRuntimeData: !!runtimeFlows,
    totalEntries: allEntries.length,
    summary,
    gaps,
    entries: allEntries,
  };

  const outputPath = OUTPUT_FILE || path.join(knowledgeDir, 'reconciliation-report.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`[repo-runtime-reconciler] ✅ Saved to: ${outputPath}`);

  // Also write analysis-gaps.md
  const gapsMdPath = path.join(knowledgeDir, 'analysis-gaps.md');
  const gapsMd = `# Analysis Gaps: ${report.repoName}

> Sinh tự động bởi \`repo-runtime-reconciler.mjs\` — ${report.reconciledAt}  
> Runtime data: ${report.hasRuntimeData ? 'Có' : 'Chưa có (chạy baseline discovery để bổ sung)'}

## Reconciliation Summary

| Status | Count |
|:---|:---:|
${Object.entries(summary).map(([k, v]) => `| ${k} | ${v} |`).join('\n')}

## Gaps Cần Xử lý

${gaps.length === 0 ? '_Không phát hiện gap đáng kể_' : gaps.map(g => `### [${g.severity.toUpperCase()}] ${g.gapType}

${g.description}

**Recommendation:** ${g.recommendation}

${g.items.slice(0, 5).map(item => typeof item === 'string' ? `- \`${item}\`` : `- \`${item.entity}\``).join('\n')}
${g.items.length > 5 ? `\n_...và ${g.items.length - 5} items khác_` : ''}
`).join('\n---\n')}

---
_Cập nhật lại: \`node qa-run/scripts/repo-business-discovery.mjs --repo <path> --mode full\`_
`;

  fs.writeFileSync(gapsMdPath, gapsMd, 'utf8');
  console.log(`[repo-runtime-reconciler] ✅ Gaps written to: ${gapsMdPath}`);

  console.log(`\nReconciliation summary:`);
  for (const [status, count] of Object.entries(summary)) {
    const icon = status === 'CONFIRMED' ? '✅' : status === 'CONFLICT' ? '❌' : status === 'RUNTIME_ONLY' ? '⚠️' : '📋';
    console.log(`  ${icon} ${String(status).padEnd(18)} ${count}`);
  }
  if (gaps.length > 0) {
    console.log(`\nGaps detected: ${gaps.length} (${gaps.filter(g => g.severity === 'critical').length} critical, ${gaps.filter(g => g.severity === 'high').length} high)`);
  }
}

main().catch(err => {
  console.error('[repo-runtime-reconciler] FATAL:', err.message);
  process.exit(1);
});
