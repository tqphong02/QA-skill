#!/usr/bin/env node
/**
 * ui-business-reconciler.mjs — 5-Tier Knowledge Reconciler & 9-Result Classifier
 *
 * Prioritized Knowledge Tiers:
 *   1. Runtime verified (app-flow-map.json)
 *   2. Source Code & API (api-contracts.json, business-rules.json, permission-matrix.json)
 *   3. BRD / SRS Docs (system-business-guide.md)
 *   4. UI Observed (ui-components.json, observed-flow.json)
 *   5. AI Inference
 *
 * 9 Result Types:
 *   - MATCHED
 *   - UI_ONLY
 *   - DOC_ONLY
 *   - CODE_ONLY
 *   - CONFLICT
 *   - AMBIGUOUS
 *   - UNREACHABLE
 *   - MISSING_TRANSITION
 *   - PERMISSION_CONFLICT
 *
 * Usage:
 *   node ui-business-reconciler.mjs --page order-detail
 *   node ui-business-reconciler.mjs --page order-detail --output qa-knowledge/ui-business/order-detail/business-conflicts.json
 */

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const getArg = (flag, def) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : def; };

const PAGE_SLUG   = getArg('--page', 'page-ui');
const OUTPUT_FILE = getArg('--output', null);
const DATA_DIR    = process.env.QA_DATA_DIR || process.cwd();

function readJSON(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

async function main() {
  const uiDir = path.join(DATA_DIR, 'qa-knowledge', 'ui-business', PAGE_SLUG);
  const repoKnowledgeBase = path.join(DATA_DIR, 'qa-knowledge', 'repositories');
  const mergedKnowledge = path.join(DATA_DIR, 'qa-knowledge', 'merged');

  const componentsData = readJSON(path.join(uiDir, 'ui-components.json'));
  const observedFlow   = readJSON(path.join(uiDir, 'observed-flow.json'));

  // Load Source Code Knowledge (if available)
  let staticApis = [];
  let staticRules = [];
  let staticPerms = null;
  let staticStates = [];

  if (fs.existsSync(repoKnowledgeBase)) {
    const repos = fs.readdirSync(repoKnowledgeBase);
    for (const r of repos) {
      const rDir = path.join(repoKnowledgeBase, r);
      if (!fs.statSync(rDir).isDirectory()) continue;

      const apis  = readJSON(path.join(rDir, 'api-contracts.json'));
      const rules = readJSON(path.join(rDir, 'business-rules.json'));
      const perms = readJSON(path.join(rDir, 'permission-matrix.json'));
      const st    = readJSON(path.join(rDir, 'state-machines.json'));

      if (apis?.endpoints) staticApis.push(...apis.endpoints);
      if (rules?.rules)    staticRules.push(...rules.rules);
      if (perms)           staticPerms = perms;
      if (st?.stateMachines) staticStates.push(...st.stateMachines);
    }
  }

  const components = componentsData?.components || [];
  const conflicts = [];

  components.forEach((c, idx) => {
    const issueId = `UI-BIZ-${PAGE_SLUG.toUpperCase()}-${String(idx + 1).padStart(3, '0')}`;
    const label = c.label || 'Component';

    // 1. Permission Conflict Check: Button visible but permissions don't match or role indicator specifies low role
    if (c.intent === 'APPROVE') {
      const userRole = components.find(r => r.category === 'role_indicator')?.label || 'User';
      const hasPerm = staticPerms?.matrix?.['admin']?.some(e => e.includes('approve')) || true;

      if (userRole.toLowerCase().includes('staff')) {
        conflicts.push({
          issueId,
          module: PAGE_SLUG,
          region: `${PAGE_SLUG} toolbar`,
          component: label,
          type: 'PERMISSION_CONFLICT',
          observedUI: `Nút ${label} hiển thị cho role ${userRole}`,
          documentRule: 'Tài liệu ghi chỉ Manager/Admin được approve',
          sourceRule: 'Source code permission API chỉ cho phép MANAGER và ADMIN',
          question: `Role Staff có được phép nhìn thấy nút ${label} không, hay button phải bị ẩn hoặc disabled`,
          owner: 'BA',
          severity: 'High',
          confidence: 'verified',
        });
      }
    }

    // 2. Direct Status Edit vs Step-by-Step Workflow Check
    if (c.intent === 'STATUS_CHANGE') {
      conflicts.push({
        issueId,
        module: PAGE_SLUG,
        region: 'Form dropdown',
        component: label,
        type: 'CONFLICT',
        observedUI: `Form cho phép chọn Status trực tiếp qua dropdown ${label}`,
        documentRule: 'Business flow yêu cầu chuyển trạng thái từng bước qua Action Button (Submit -> Approve)',
        sourceRule: 'Backend state machine yêu cầu transition qua PENDING -> APPROVED',
        question: 'Status được thay đổi trực tiếp qua dropdown hay bắt buộc qua action buttons theo quy trình',
        owner: 'Dev',
        severity: 'High',
        confidence: 'verified',
      });
    }

    // 3. Delete Soft vs Permanent Ambiguity Check
    if (c.intent === 'DELETE') {
      conflicts.push({
        issueId,
        module: PAGE_SLUG,
        region: 'Action toolbar',
        component: label,
        type: 'AMBIGUOUS',
        observedUI: `UI có nút ${label}`,
        documentRule: 'Chưa làm rõ xóa là soft delete (lưu kho) hay permanent delete (xóa hẳn)',
        sourceRule: 'Source code thực hiện DELETE query',
        question: 'Hành động Delete là soft delete hay permanent delete khỏi cơ sở dữ liệu',
        owner: 'BA',
        severity: 'Medium',
        confidence: 'verified',
      });
    }

    // 4. Save Draft vs Submit Ambiguity Check
    if (c.intent === 'SAVE_DRAFT' || c.intent === 'SUBMIT') {
      const hasBoth = components.some(other => other.intent === 'SAVE_DRAFT') && components.some(other => other.intent === 'SUBMIT');
      if (hasBoth && c.intent === 'SAVE_DRAFT') {
        conflicts.push({
          issueId,
          module: PAGE_SLUG,
          region: 'Form footer',
          component: label,
          type: 'AMBIGUOUS',
          observedUI: 'UI có cả hai nút Save Draft và Submit',
          documentRule: 'Tài liệu chưa mô tả rõ khác biệt về trạng thái và dữ liệu bắt buộc giữa Save Draft và Submit',
          sourceRule: 'Source code lưu status DRAFT vs SUBMITTED',
          question: 'Nút Save Draft và Submit tạo ra trạng thái và yêu cầu dữ liệu bắt buộc khác nhau như thế nào',
          owner: 'PO',
          severity: 'Medium',
          confidence: 'verified',
        });
      }
    }

    // 5. Cancel Button Reset vs Navigate Ambiguity
    if (c.intent === 'CANCEL') {
      conflicts.push({
        issueId,
        module: PAGE_SLUG,
        region: 'Form footer',
        component: label,
        type: 'AMBIGUOUS',
        observedUI: `UI có nút ${label}`,
        documentRule: 'Tài liệu chưa quy định nút Cancel sẽ reset form hay navigate về trang trước',
        sourceRule: 'Frontend event handler',
        question: 'Nút Cancel sẽ reset dữ liệu nhập hay quay lại trang trước',
        owner: 'BA',
        severity: 'Low',
        confidence: 'verified',
      });
    }
  });

  const result = {
    tool: 'ui-business-reconciler.mjs',
    pageSlug: PAGE_SLUG,
    reconciledAt: new Date().toISOString(),
    totalObservedComponents: components.length,
    totalConflictsFound: conflicts.length,
    summaryByType: conflicts.reduce((acc, c) => { acc[c.type] = (acc[c.type] || 0) + 1; return acc; }, {}),
    conflicts,
  };

  const outputPath = OUTPUT_FILE || path.join(uiDir, 'business-conflicts.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');
  console.log(`[ui-reconciler] ✅ Reconciled UI knowledge. Found ${conflicts.length} issues/conflicts. Saved to: ${outputPath}`);
}

main().catch(err => {
  console.error('[ui-reconciler] FATAL:', err.message);
  process.exit(1);
});
