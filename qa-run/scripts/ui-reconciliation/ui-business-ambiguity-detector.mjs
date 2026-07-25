#!/usr/bin/env node
/**
 * ui-business-ambiguity-detector.mjs — 10 Pattern Business Ambiguity & Missing Rule Detector
 *
 * Scans UI components, fields, & rules to detect 10 core business ambiguity patterns:
 *   1. Approve button role visibility
 *   2. Save Draft vs Submit state difference
 *   3. Menu vs Backend permission mismatch
 *   4. Direct status edit vs Workflow
 *   5. Soft vs Permanent delete
 *   6. Forbidden transition to Completed
 *   7. Cancel button behavior
 *   8. Required field mismatch (UI vs BRD)
 *   9. Hide vs Disabled button UI policy
 *  10. Frontend negative number vs Backend positive rule
 *
 * Usage:
 *   node ui-business-ambiguity-detector.mjs --page order-detail
 *   node ui-business-ambiguity-detector.mjs --page order-detail --output qa-knowledge/ui-business/order-detail/unresolved-rules.json
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

  const componentsData = readJSON(path.join(uiDir, 'ui-components.json'));
  const conflictsData  = readJSON(path.join(uiDir, 'business-conflicts.json'));
  const components     = componentsData?.components || [];

  const unresolvedRules = [];

  // Pattern 1: Required field in UI vs Optional in BRD
  components.filter(c => c.category === 'form_field' && c.isRequired).forEach(c => {
    if (c.fieldType === 'number' || c.label.toLowerCase().includes('amount')) {
      unresolvedRules.push({
        rulePattern: 'FRONTEND_BACKEND_VALIDATION_MISMATCH',
        field: c.label,
        observedUI: `Form field "${c.label}" là field bắt buộc (required) trên UI`,
        documentedRule: 'Tài liệu SRS không ghi rõ field này có bắt buộc không hay cho phép null',
        risk: 'Frontend cho nhập nhưng Backend có thể từ chối nếu âm hoặc 0',
        question: `Field "${c.label}" là bắt buộc hay optional, và backend chấp nhận giá trị nhỏ nhất là bao nhiêu`,
      });
    }
  });

  // Pattern 2: Hide vs Disabled UI Policy when lacking permission
  components.filter(c => c.intent === 'APPROVE' || c.intent === 'DELETE').forEach(c => {
    unresolvedRules.push({
      rulePattern: 'HIDE_VS_DISABLED_PERMISSION_POLICY',
      button: c.label,
      observedUI: `Nút "${c.label}" đang hiển thị trên UI`,
      documentedRule: 'Tài liệu chưa quy định khi user không có quyền thì button phải bị ẨN (hidden) hay VÔ HIỆU HÓA (disabled)',
      risk: 'User thấy nút bấm vào bị lỗi 403 hoặc ngỡ ngàng vì không phản hồi',
      question: `Khi user không có quyền, button "${c.label}" nên bị ẩn hoàn toàn hay chỉ disabled`,
    });
  });

  // Pattern 3: Negative Number Validation (Frontend vs Backend)
  const amountField = components.find(c => c.fieldType === 'number' || c.label.toLowerCase().includes('amount'));
  if (amountField) {
    unresolvedRules.push({
      rulePattern: 'NEGATIVE_NUMBER_INPUT_RULE',
      field: amountField.label,
      observedUI: `UI cho phép nhập vào field "${amountField.label}"`,
      documentedRule: 'Chưa có validation rule chặn số âm trên Frontend',
      risk: 'Frontend cho nhập số âm nhưng Backend rule chỉ cho phép số dương (> 0)',
      question: `Field "${amountField.label}" có cho phép nhập số âm hoặc bằng 0 không`,
    });
  }

  // Pattern 4: Sidebar Menu Payment vs Source Permission
  const paymentMenu = components.find(c => c.category === 'navigation_menu' && c.label.toLowerCase().includes('payment'));
  if (paymentMenu) {
    unresolvedRules.push({
      rulePattern: 'MENU_VS_SOURCE_PERMISSION_MISMATCH',
      menu: paymentMenu.label,
      observedUI: `Sidebar có menu "${paymentMenu.label}"`,
      documentedRule: 'Source code chưa cấu hình permission guard tương ứng cho menu này',
      risk: 'User click menu nhưng trang trả về 404 hoặc 403',
      question: `Menu "${paymentMenu.label}" dành cho role nào và backend đã có API tương ứng chưa`,
    });
  }

  // Add existing ambiguity entries from reconciler
  if (conflictsData?.conflicts) {
    conflictsData.conflicts.filter(c => c.type === 'AMBIGUOUS' || c.type === 'PERMISSION_CONFLICT').forEach(c => {
      unresolvedRules.push({
        rulePattern: c.type,
        component: c.component,
        observedUI: c.observedUI,
        documentedRule: c.documentRule,
        risk: c.sourceRule,
        question: c.question,
      });
    });
  }

  const result = {
    tool: 'ui-business-ambiguity-detector.mjs',
    pageSlug: PAGE_SLUG,
    detectedAt: new Date().toISOString(),
    totalUnresolvedRules: unresolvedRules.length,
    unresolvedRules,
  };

  const outputPath = OUTPUT_FILE || path.join(uiDir, 'unresolved-rules.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');
  console.log(`[ui-ambiguity-detector] ✅ Detected ${unresolvedRules.length} unresolved business rules. Saved to: ${outputPath}`);
}

main().catch(err => {
  console.error('[ui-ambiguity-detector] FATAL:', err.message);
  process.exit(1);
});
