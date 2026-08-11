#!/usr/bin/env node
/** Evaluate the ten required UI/business ambiguity patterns against traceability evidence. */

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const getArg = (flag, def = null) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : def; };
const PAGE_SLUG = getArg('--page', 'page-ui');
const OUTPUT_FILE = getArg('--output');
const DATA_DIR = process.env.QA_DATA_DIR || process.cwd();
const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8'));

const PATTERNS = [
  ['APPROVE_ROLE_VISIBILITY', 'Quyền hiển thị Approve'],
  ['SAVE_DRAFT_VS_SUBMIT', 'Khác biệt Save Draft và Submit'],
  ['MENU_PERMISSION', 'Permission của menu'],
  ['DIRECT_STATUS_EDIT', 'Sửa status trực tiếp so với workflow'],
  ['DELETE_CONFIRMATION_MODE', 'Confirmation và kiểu delete'],
  ['FORBIDDEN_COMPLETED_TRANSITION', 'Transition bị cấm tới COMPLETED'],
  ['CANCEL_BEHAVIOR', 'Cancel reset hay navigate'],
  ['REQUIRED_FIELD_MISMATCH', 'Required field UI so với requirement'],
  ['HIDE_VS_DISABLED_POLICY', 'Policy hide so với disabled'],
  ['NEGATIVE_NUMBER_RULE', 'Validation số âm'],
];

function findComponent(components, predicate) { return components.find(predicate); }
function rowsFor(mappings, component) { return component ? mappings.filter(row => row.uiItemId === component.uiItemId) : []; }
function unresolved(pattern, component, rows, question, risk) {
  const relevant = rows.filter(row => ['CONFLICT', 'AMBIGUOUS', 'UI_ONLY'].includes(row.mappingStatus));
  if (!component) return { patternId: pattern, status: 'not_applicable', reason: 'Không có UI item liên quan' };
  if (!relevant.length) return { patternId: pattern, status: 'not_detected', reason: 'Requirement và UI evidence hiện tại đã map, chưa thấy gap' };
  return {
    patternId: pattern, status: 'detected', reason: relevant.flatMap(row => row.reasons || []).join('; ') || 'UI item chưa có requirement',
    unresolvedRule: {
      rulePattern: pattern, uiItemId: component.uiItemId, component: component.label,
      observedUI: `Quan sát ${component.category} "${component.label}"`,
      documentedRule: relevant.map(row => row.requirement?.expected_behavior || row.requirement?.text).filter(Boolean).join('; ') || 'Chưa có requirement liên kết',
      sourceReferences: [...new Set(relevant.flatMap(row => row.sourceRefs || []))], risk, question,
    },
  };
}

async function main() {
  const uiDir = path.join(DATA_DIR, 'qa-knowledge', 'ui-business', PAGE_SLUG);
  const componentPath = path.join(uiDir, 'ui-components.json');
  const tracePath = path.join(uiDir, 'ui-requirement-traceability.json');
  if (!fs.existsSync(componentPath) || !fs.existsSync(tracePath)) throw new Error('Missing ui-components.json or ui-requirement-traceability.json');
  const components = readJSON(componentPath).components || [];
  const mappings = readJSON(tracePath).mappings || [];
  const byIntent = intent => findComponent(components, c => c.intent === intent);
  const amount = findComponent(components, c => c.category === 'form_field' && (c.fieldType === 'number' || /amount|số tiền/i.test(c.label || '')));
  const status = byIntent('STATUS_CHANGE');
  const approve = byIntent('APPROVE');
  const save = byIntent('SAVE_DRAFT');
  const submit = byIntent('SUBMIT');
  const menu = findComponent(components, c => c.category === 'navigation_menu' && mappings.some(row => row.uiItemId === c.uiItemId && row.mappingStatus === 'UI_ONLY'));
  const del = byIntent('DELETE');
  const cancel = byIntent('CANCEL');

  const coverage = [
    unresolved(PATTERNS[0][0], approve, rowsFor(mappings, approve), 'Role nào được thấy và thực hiện Approve', 'Lộ action trái quyền hoặc 403 ở runtime'),
    unresolved(PATTERNS[1][0], save || submit, [...rowsFor(mappings, save), ...rowsFor(mappings, submit)], 'Save Draft và Submit khác nhau ở validation, API và state nào', 'Hai action có thể tạo cùng kết quả ngoài ý muốn'),
    unresolved(PATTERNS[2][0], menu, rowsFor(mappings, menu), 'Menu này dành cho role nào và route/API nào hỗ trợ', 'Menu không được trace tới requirement permission'),
    unresolved(PATTERNS[3][0], status, rowsFor(mappings, status), 'Status được sửa trực tiếp hay chỉ chuyển qua action workflow', 'Bypass state machine'),
    unresolved(PATTERNS[4][0], del, rowsFor(mappings, del), 'Delete cần confirmation và là soft hay permanent delete', 'Mất dữ liệu hoặc thiếu khả năng khôi phục'),
    unresolved(PATTERNS[5][0], status, rowsFor(mappings, status).filter(row => (row.expected?.forbidden_values || []).some(v => String(v).toUpperCase() === 'COMPLETED')), 'Có được chuyển trực tiếp sang COMPLETED không', 'Bỏ qua approval'),
    unresolved(PATTERNS[6][0], cancel, rowsFor(mappings, cancel), 'Cancel reset dữ liệu, rollback hay navigate', 'Mất dữ liệu chưa lưu'),
    unresolved(PATTERNS[7][0], amount, rowsFor(mappings, amount).filter(row => row.reasons?.some(reason => reason.includes('required='))), 'Field là required hay optional theo trạng thái nào', 'Frontend và backend validation lệch nhau'),
    unresolved(PATTERNS[8][0], approve || del, [...rowsFor(mappings, approve), ...rowsFor(mappings, del)].filter(row => ['CONFLICT', 'AMBIGUOUS'].includes(row.mappingStatus)), 'Khi thiếu quyền phải hide hay disabled', 'UI permission policy không nhất quán'),
    unresolved(PATTERNS[9][0], amount, rowsFor(mappings, amount).filter(row => row.reasons?.some(reason => /giá trị bị cấm|allowed_values/.test(reason))), 'Giá trị âm hoặc bằng 0 có hợp lệ không', 'Validation không nhất quán'),
  ].map(item => ({ ...item, name: PATTERNS.find(([id]) => id === item.patternId)?.[1] }));

  const unresolvedRules = coverage.filter(item => item.status === 'detected').map(item => item.unresolvedRule);
  const result = {
    tool: 'ui-business-ambiguity-detector.mjs', pageSlug: PAGE_SLUG, detectedAt: new Date().toISOString(),
    requiredPatternCount: PATTERNS.length,
    patternSummary: coverage.reduce((acc, item) => { acc[item.status] = (acc[item.status] || 0) + 1; return acc; }, {}),
    patternCoverage: coverage.map(({ unresolvedRule: _omitted, ...item }) => item),
    totalUnresolvedRules: unresolvedRules.length, unresolvedRules,
  };
  const outputPath = OUTPUT_FILE || path.join(uiDir, 'unresolved-rules.json');
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');
  console.log(`[ui-ambiguity-detector] Evaluated all ${PATTERNS.length} patterns; ${unresolvedRules.length} need clarification`);
}

main().catch(err => { console.error('[ui-ambiguity-detector] FATAL:', err.message); process.exit(1); });
