#!/usr/bin/env node
/** Reconcile observed UI items with an explicit requirement registry and runtime evidence. */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const args = process.argv.slice(2);
const getArg = (flag, def = null) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : def; };
const PAGE_SLUG = getArg('--page', 'page-ui');
const REQUIREMENTS_FILE = getArg('--requirements');
const ROLE_ARG = getArg('--role');
const OUTPUT_FILE = getArg('--output');
const TRACE_OUTPUT = getArg('--trace-output');
const DATA_DIR = process.env.QA_DATA_DIR || process.cwd();

const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const norm = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/\s*[＊*:]\s*$/, '');
const list = value => Array.isArray(value) ? value : [];
const idFor = value => crypto.createHash('sha256').update(value).digest('hex').slice(0, 12).toUpperCase();

function validateRequirements(data) {
  if (!data || !Array.isArray(data.requirements)) throw new Error('Requirement registry must contain requirements[]');
  const seen = new Set();
  data.requirements.forEach((req, index) => {
    for (const field of ['id', 'text', 'source_ref']) {
      if (!String(req?.[field] || '').trim()) throw new Error(`requirements[${index}].${field} is required`);
    }
    if (seen.has(req.id)) throw new Error(`Duplicate requirement ID: ${req.id}`);
    seen.add(req.id);
  });
  return data.requirements.filter(req => !req.page || req.page === PAGE_SLUG);
}

function matches(component, requirement) {
  const ui = requirement.ui || {};
  const identityConfigured = list(ui.item_ids).length || list(ui.selectors).length || list(ui.labels).length;
  const identityChecks = [
    list(ui.item_ids).some(value => value === component.uiItemId),
    list(ui.selectors).some(value => value === component.selector),
    list(ui.labels).some(value => norm(value) === norm(component.label)),
  ];
  if (identityConfigured) return identityChecks.some(Boolean);
  if (list(ui.intents).length) return list(ui.intents).some(value => norm(value) === norm(component.intent));
  return list(ui.categories).some(value => norm(value) === norm(component.category));
}

function currentRole(components) {
  if (ROLE_ARG) return ROLE_ARG;
  const label = components.find(c => c.category === 'role_indicator')?.label || '';
  return label.replace(/^role\s*:\s*/i, '').trim() || 'unknown';
}

function runtimeFor(component, transitions) {
  return transitions.find(t => t.actionSelector === component.selector || norm(t.action) === norm(component.label));
}

function evaluate(component, requirement, role, runtime, allComponents) {
  const expected = requirement.expected || {};
  const reasons = [];
  let ambiguous = ['inferred', 'unresolved'].includes(requirement.fact_status);
  const roleName = norm(role);
  if (list(expected.visible_roles).length && !list(expected.visible_roles).some(item => norm(item) === roleName) && !component.isHidden) {
    reasons.push(`Role ${role} thấy UI item nhưng requirement chỉ cho phép: ${expected.visible_roles.join(', ')}`);
  }
  if (list(expected.hidden_roles).some(item => norm(item) === roleName) && !component.isHidden) {
    reasons.push(`Role ${role} phải bị ẩn UI item theo requirement`);
  }
  if (typeof expected.required === 'boolean' && typeof component.isRequired === 'boolean' && expected.required !== component.isRequired) {
    reasons.push(`required=${component.isRequired} trên UI, expected required=${expected.required}`);
  }
  const observedValues = [...list(component.allowedValues), component.defaultValue].filter(value => value !== undefined && value !== null);
  const forbidden = list(expected.forbidden_values);
  const forbiddenObserved = observedValues.filter(value => forbidden.some(item => norm(item) === norm(value)));
  if (forbiddenObserved.length) reasons.push(`UI cho phép/đang có giá trị bị cấm: ${forbiddenObserved.join(', ')}`);
  if (list(expected.allowed_values).length) {
    const outside = observedValues.filter(value => !list(expected.allowed_values).some(item => norm(item) === norm(value)));
    if (outside.length) reasons.push(`UI có giá trị ngoài allowed_values: ${outside.join(', ')}`);
  }
  if (expected.confirmation_required === true) {
    const confirmationObserved = allComponents.some(item => item.category === 'dialog' && /confirm|xác nhận/i.test(item.label || ''));
    if (!confirmationObserved) ambiguous = true;
  }
  if (runtime?.hasMismatch) reasons.push(`Runtime mismatch: UI success=${runtime.uiSuccessVisible}, HTTP=${runtime.responseStatus}, persisted=${runtime.persistenceVerified}`);
  if (expected.state_transition?.to && runtime && norm(runtime.postReloadStatus) !== norm(expected.state_transition.to)) {
    reasons.push(`Persisted state ${runtime.postReloadStatus || 'unknown'} khác expected ${expected.state_transition.to}`);
  }
  return { status: reasons.length ? 'CONFLICT' : (ambiguous ? 'AMBIGUOUS' : 'MAPPED'), reasons, ambiguous };
}

function evidenceLevels(requirement, runtime) {
  const levels = ['ui_observed', 'document_supported'];
  if (list(requirement.source_refs).length) levels.push('source_derived');
  if (runtime) levels.push('runtime_verified');
  if (requirement.human_confirmed) levels.push('human_confirmed');
  return levels;
}

async function main() {
  if (!REQUIREMENTS_FILE) throw new Error('Missing --requirements. UI-to-requirement mapping is fail-closed');
  if (!fs.existsSync(REQUIREMENTS_FILE)) throw new Error(`Requirement registry not found: ${REQUIREMENTS_FILE}`);
  const uiDir = path.join(DATA_DIR, 'qa-knowledge', 'ui-business', PAGE_SLUG);
  const componentsPath = path.join(uiDir, 'ui-components.json');
  if (!fs.existsSync(componentsPath)) throw new Error(`UI component inventory not found: ${componentsPath}`);

  const components = readJSON(componentsPath).components || [];
  const requirements = validateRequirements(readJSON(REQUIREMENTS_FILE));
  const transitionsPath = path.join(uiDir, 'transition-evidence.json');
  const transitions = fs.existsSync(transitionsPath) ? (readJSON(transitionsPath).transitions || []) : [];
  const role = currentRole(components);
  const mappings = [];
  const matchedRequirementIds = new Set();

  for (const component of components) {
    const matched = requirements.filter(req => matches(component, req));
    if (!matched.length) {
      mappings.push({
        mappingId: `MAP-${idFor(`${component.uiItemId}|UI_ONLY`)}`, uiItemId: component.uiItemId,
        ui: component, requirementId: null, requirement: null, mappingStatus: 'UI_ONLY',
        evidenceLevel: 'ui_observed', evidenceLevels: ['ui_observed'], reasons: ['Không có requirement liên kết rõ ràng'],
      });
      continue;
    }
    for (const requirement of matched) {
      matchedRequirementIds.add(requirement.id);
      const runtime = runtimeFor(component, transitions);
      const evaluation = evaluate(component, requirement, role, runtime, components);
      const levels = evidenceLevels(requirement, runtime);
      mappings.push({
        mappingId: `MAP-${idFor(`${component.uiItemId}|${requirement.id}`)}`,
        uiItemId: component.uiItemId, ui: component,
        requirementId: requirement.id,
        requirement: { id: requirement.id, text: requirement.text, source_ref: requirement.source_ref, expected_behavior: requirement.expected_behavior || null },
        mappingStatus: evaluation.status, evidenceLevel: levels.at(-1), evidenceLevels: levels,
        reasons: evaluation.reasons,
        expected: requirement.expected || null, sourceRefs: list(requirement.source_refs), testcaseIds: list(requirement.testcase_ids),
        runtimeEvidence: runtime || null,
      });
    }
  }

  for (const requirement of requirements.filter(req => !matchedRequirementIds.has(req.id))) {
    mappings.push({
      mappingId: `MAP-${idFor(`REQ_ONLY|${requirement.id}`)}`, uiItemId: null, ui: null,
      requirementId: requirement.id,
      requirement: { id: requirement.id, text: requirement.text, source_ref: requirement.source_ref, expected_behavior: requirement.expected_behavior || null },
      mappingStatus: 'REQ_ONLY', evidenceLevel: 'document_supported', evidenceLevels: ['document_supported'],
      reasons: ['Requirement chưa có UI item quan sát được'], expected: requirement.expected || null,
      sourceRefs: list(requirement.source_refs), testcaseIds: list(requirement.testcase_ids), runtimeEvidence: null,
    });
  }

  const byStatus = mappings.reduce((acc, row) => { acc[row.mappingStatus] = (acc[row.mappingStatus] || 0) + 1; return acc; }, {});
  const traceability = {
    schemaVersion: '1.0', tool: 'ui-business-reconciler.mjs', pageSlug: PAGE_SLUG, role,
    requirementsSource: path.resolve(REQUIREMENTS_FILE), generatedAt: new Date().toISOString(),
    summary: { uiItems: components.length, requirements: requirements.length, mappings: mappings.length, byStatus }, mappings,
  };
  const tracePath = TRACE_OUTPUT || path.join(uiDir, 'ui-requirement-traceability.json');
  fs.writeFileSync(tracePath, JSON.stringify(traceability, null, 2), 'utf8');

  const conflicts = mappings.filter(row => ['CONFLICT', 'AMBIGUOUS', 'REQ_ONLY'].includes(row.mappingStatus)).map(row => {
    const component = row.ui?.label || row.requirement?.id || 'Requirement';
    const type = row.mappingStatus === 'CONFLICT' && row.expected?.visible_roles ? 'PERMISSION_CONFLICT' : row.mappingStatus;
    return {
      issueId: `UI-BIZ-${idFor(row.mappingId)}`, mappingId: row.mappingId, requirementId: row.requirementId,
      module: PAGE_SLUG, region: row.ui?.region || 'UI', component, type,
      question: row.mappingStatus === 'REQ_ONLY'
        ? `Requirement ${row.requirementId} được hiển thị ở đâu trên UI`
        : (row.reasons[0] || `Cần xác nhận expected behavior cho ${component}`),
      owner: type === 'PERMISSION_CONFLICT' ? 'BA' : (row.runtimeEvidence ? 'Dev' : 'BA'),
      severity: row.mappingStatus === 'CONFLICT' ? 'High' : 'Medium',
      confidence: row.runtimeEvidence ? 'runtime_verified' : (row.sourceRefs.length ? 'source_derived' : 'document_supported'),
      angles: {
        actualBehavior: row.ui ? JSON.stringify({ label: row.ui.label, required: row.ui.isRequired, values: row.ui.allowedValues, role }) : 'Không quan sát thấy UI item',
        implementedRule: row.sourceRefs.length ? row.sourceRefs.join(', ') : 'Chưa có source evidence',
        expectedBusinessBehavior: row.requirement?.expected_behavior || row.requirement?.text,
      },
      evidenceBundle: {
        selector: row.ui?.selector || null, uiItemId: row.uiItemId, role,
        docSection: row.requirement?.source_ref || null, sourceRefs: row.sourceRefs,
        runtimeEvidence: row.runtimeEvidence, missingEvidence: [
          ...(!row.ui ? ['ui'] : []), ...(!row.sourceRefs.length ? ['source'] : []), ...(!row.runtimeEvidence ? ['runtime'] : []),
        ],
      },
    };
  });
  const conflictResult = {
    tool: 'ui-business-reconciler.mjs', pageSlug: PAGE_SLUG, reconciledAt: new Date().toISOString(),
    traceabilityFile: tracePath, totalObservedComponents: components.length, totalRequirements: requirements.length,
    totalConflictsFound: conflicts.length,
    summary: { matched: byStatus.MAPPED || 0, conflicts: byStatus.CONFLICT || 0, ambiguous: byStatus.AMBIGUOUS || 0, requirementOnly: byStatus.REQ_ONLY || 0, uiOnly: byStatus.UI_ONLY || 0 },
    conflicts,
  };
  const outputPath = OUTPUT_FILE || path.join(uiDir, 'business-conflicts.json');
  fs.writeFileSync(outputPath, JSON.stringify(conflictResult, null, 2), 'utf8');
  console.log(`[ui-reconciler] Saved ${mappings.length} mappings (${conflicts.length} review items) to: ${tracePath}`);
}

main().catch(err => { console.error('[ui-reconciler] FATAL:', err.message); process.exit(1); });
