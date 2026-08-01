#!/usr/bin/env node
/** Generate the 12-section UI business guide from validated traceability artifacts. */

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const getArg = (flag, def = null) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : def; };
const PAGE_SLUG = getArg('--page', 'page-ui');
const OUTPUT_FILE = getArg('--output');
const DATA_DIR = process.env.QA_DATA_DIR || process.cwd();
const read = file => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
const md = value => String(value ?? '-').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const bullets = (items, empty) => items.length ? items.map(item => `- ${item}`).join('\n') : `- ${empty}`;

async function main() {
  const uiDir = path.join(DATA_DIR, 'qa-knowledge', 'ui-business', PAGE_SLUG);
  const componentsData = read(path.join(uiDir, 'ui-components.json'));
  const trace = read(path.join(uiDir, 'ui-requirement-traceability.json'));
  if (!componentsData || !trace) throw new Error('Missing ui-components.json or ui-requirement-traceability.json');
  const flow = read(path.join(uiDir, 'observed-flow.json')) || {};
  const conflictsData = read(path.join(uiDir, 'business-conflicts.json')) || { conflicts: [] };
  const unresolvedData = read(path.join(uiDir, 'unresolved-rules.json')) || { unresolvedRules: [] };
  const qnaData = read(path.join(uiDir, 'clarification-qna.json')) || { questions: [] };
  const stateGraph = read(path.join(uiDir, 'ui-state-graph.json')) || { states: [], transitions: [] };
  const components = componentsData.components || [];
  const mappings = trace.mappings || [];
  const conflicts = conflictsData.conflicts || [];
  const unresolved = unresolvedData.unresolvedRules || [];
  const questions = qnaData.questions || [];
  const roles = [...new Set([trace.role, ...components.filter(c => c.category === 'role_indicator').map(c => c.label)].filter(Boolean))];
  const actions = components.filter(c => ['primary_action_button', 'secondary_action_button', 'navigation_menu', 'form_field'].includes(c.category));
  const requirementIds = [...new Set(mappings.map(row => row.requirementId).filter(Boolean))];
  const sourceRefs = [...new Set(mappings.flatMap(row => [row.requirement?.source_ref, ...(row.sourceRefs || [])]).filter(Boolean))];
  const affectedModules = [...new Set(mappings.map(row => row.requirementId?.split('-').slice(0, 2).join('-')).filter(Boolean))];

  const impactMap = {
    pageSlug: PAGE_SLUG, generatedAt: new Date().toISOString(), affectedModules,
    requirementIds, highRiskComponents: [...new Set(conflicts.filter(c => c.severity === 'High').map(c => c.component))],
    mappingSummary: trace.summary?.byStatus || {},
  };
  fs.writeFileSync(path.join(uiDir, 'ui-business-impact-map.json'), JSON.stringify(impactMap, null, 2), 'utf8');

  const mappingTable = mappings.map(row => `| ${md(row.uiItemId)} | ${md(row.ui?.label)} | ${md(row.requirementId)} | ${row.mappingStatus} | ${row.evidenceLevel} |`).join('\n');
  const conflictBlocks = conflicts.map(c => `### [${c.type}] ${md(c.component)}\n\n- Requirement: ${md(c.requirementId)}\n- Actual: ${md(c.angles?.actualBehavior)}\n- Expected: ${md(c.angles?.expectedBusinessBehavior)}\n- Source: ${md(c.angles?.implementedRule)}\n- Cần làm rõ: ${md(c.question)}`).join('\n\n');
  const proposedTests = conflicts.map((c, index) => `- TC-CAND-${String(index + 1).padStart(3, '0')}: Kiểm tra ${md(c.component)} theo ${md(c.requirementId)} và xác nhận ${md(c.question)}`);

  const guide = `# UI Business Reconciliation: ${PAGE_SLUG}

Sinh từ UI inventory và requirement registry có provenance lúc ${new Date().toISOString()}

## 1. Tổng quan mục tiêu trang

Trang được phân tích theo ${components.length} UI item và ${requirementIds.length} requirement trong phạm vi ${PAGE_SLUG}

## 2. Actor và role quan sát được

${bullets(roles.map(role => md(role)), 'Chưa quan sát hoặc chưa khai báo role')}

## 3. Action có ý nghĩa business

| UI Item ID | Label | Category | Intent | Selector |
|:---|:---|:---|:---|:---|
${actions.map(a => `| ${a.uiItemId} | ${md(a.label)} | ${a.category} | ${a.intent || 'OTHER'} | ${md(a.selector)} |`).join('\n') || '| - | - | - | - | - |'}

## 4. Business flow suy ra từ UI

- Flow: ${md(flow.flowName || 'Chưa dựng được flow')}
- State quan sát: ${md((flow.observedStates || []).join(' → ') || 'Chưa quan sát')}
- Action quan sát: ${md((flow.observedActions || []).join(', ') || 'Chưa quan sát')}

## 5. State và transition

${bullets((flow.transitions || []).map(t => `${md(t.from)} --${md(t.action)}--> ${md(t.to)} [source-derived candidate]`), 'Không suy ra transition')}

State inventory read-only: ${(stateGraph.states || []).length}, runtime transition đã đo: ${mappings.filter(row => row.evidenceLevels?.includes('runtime_verified')).length}

## 6. Permission quan sát được

Role hiện tại: ${md(trace.role)}

${bullets(conflicts.filter(c => c.type === 'PERMISSION_CONFLICT').map(c => `${md(c.component)}: ${md(c.question)}`), 'Không phát hiện permission conflict từ evidence hiện có')}

## 7. Mapping UI item với requirement

| UI Item ID | UI label | Requirement ID | Status | Evidence |
|:---|:---|:---|:---:|:---:|
${mappingTable || '| - | - | - | - | - |'}

## 8. Điểm mâu thuẫn

${conflictBlocks || 'Không phát hiện mâu thuẫn từ evidence hiện có'}

## 9. Rule chưa rõ

${bullets(unresolved.map(item => `[${item.rulePattern}] ${md(item.question)} — ${md(item.risk)}`), 'Không có ambiguity mở')}

## 10. Q&A cần BA, PO, Dev xác nhận

| Question ID | Owner | Requirement/UI | Question | Status | Severity |
|:---|:---:|:---|:---|:---:|:---:|
${questions.map(q => `| ${q.questionId} | ${q.owner} | ${md(q.component)} | ${md(q.question)} | ${q.status} | ${q.severity} |`).join('\n') || '| - | - | - | - | - | - |'}

## 11. Risk và testcase đề xuất

${proposedTests.join('\n') || '- Chưa có conflict để sinh test candidate'}

Test candidate chưa phải testcase chính thức và phải chuyển qua testcase-template sau khi Q&A quan trọng được trả lời

## 12. Evidence và source reference

- UI inventory: ui-components.json
- Traceability source of truth: ui-requirement-traceability.json
- Conflict review: business-conflicts.json
- Ambiguity coverage: unresolved-rules.json
- Runtime evidence nếu được duyệt: transition-evidence.json
- Requirement source: ${md(trace.requirementsSource)}

Source reference đã liên kết:

${bullets(sourceRefs.map(ref => md(ref)), 'Chưa có source reference bổ sung')}

## Coverage còn thiếu

- UI_ONLY: ${trace.summary?.byStatus?.UI_ONLY || 0}
- REQ_ONLY: ${trace.summary?.byStatus?.REQ_ONLY || 0}
- AMBIGUOUS: ${trace.summary?.byStatus?.AMBIGUOUS || 0}
- Runtime chưa verify: ${mappings.filter(row => row.requirementId && !row.evidenceLevels?.includes('runtime_verified')).length}
`;

  const outputPath = OUTPUT_FILE || path.join(uiDir, 'ui-business-guide.md');
  fs.writeFileSync(outputPath, guide, 'utf8');
  console.log(`[write-ui-business-guide] Generated guide and impact map: ${outputPath}`);
}

main().catch(err => { console.error('[write-ui-business-guide] FATAL:', err.message); process.exit(1); });
