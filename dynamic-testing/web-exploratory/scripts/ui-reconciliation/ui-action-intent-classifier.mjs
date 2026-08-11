#!/usr/bin/env node
/**
 * ui-action-intent-classifier.mjs — UI Business Action Intent Classifier
 *
 * Classifies extracted UI components into standardized Business Action Intents:
 *   - CREATE, UPDATE, DELETE, APPROVE, REJECT, SUBMIT, SAVE_DRAFT, CANCEL,
 *     STATUS_CHANGE, FILTER, EXPORT, IMPORT, NAVIGATE
 *
 * Assigns expected state transitions and potential risk flags to each intent.
 *
 * Usage:
 *   node ui-action-intent-classifier.mjs --input qa-knowledge/ui-business/order-detail/ui-components.json
 */

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const getArg = (flag, def) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : def; };

const INPUT_FILE  = getArg('--input', null);
const PAGE_SLUG   = getArg('--page', 'page-ui');
const OUTPUT_FILE = getArg('--output', null);
const DATA_DIR    = process.env.QA_DATA_DIR || process.cwd();

function resolveInputFile() {
  if (INPUT_FILE && fs.existsSync(INPUT_FILE)) return INPUT_FILE;
  const defaultPath = path.join(DATA_DIR, 'qa-knowledge', 'ui-business', PAGE_SLUG, 'ui-components.json');
  if (fs.existsSync(defaultPath)) return defaultPath;
  console.error(`[ui-intent-classifier] ❌ Input file not found: ${INPUT_FILE || defaultPath}`);
  process.exit(1);
}

function classifyIntent(component) {
  const label = (component.label || '').toLowerCase();
  const cat = component.category || '';

  if (cat === 'navigation_menu') {
    return { intent: 'NAVIGATE', expectedState: null, risk: 'low' };
  }

  if (label.includes('approve') || label.includes('duyệt')) {
    return { intent: 'APPROVE', expectedState: 'APPROVED', risk: 'high', requiresPermission: true };
  }

  if (label.includes('reject') || label.includes('từ chối')) {
    return { intent: 'REJECT', expectedState: 'REJECTED', risk: 'high', requiresReason: true };
  }

  if (label.includes('save draft') || label.includes('lưu nháp')) {
    return { intent: 'SAVE_DRAFT', expectedState: 'DRAFT', risk: 'medium' };
  }

  if (label.includes('submit') || label.includes('gửi') || label.includes('đặt hàng')) {
    return { intent: 'SUBMIT', expectedState: 'SUBMITTED', risk: 'high' };
  }

  if (label.includes('cancel') || label.includes('hủy')) {
    return { intent: 'CANCEL', expectedState: 'CANCELLED', risk: 'medium', ambiguity: 'reset_vs_navigate' };
  }

  if (label.includes('delete') || label.includes('xóa') || label.includes('remove')) {
    return { intent: 'DELETE', expectedState: 'DELETED', risk: 'critical', ambiguity: 'soft_vs_permanent' };
  }

  if (label.includes('create') || label.includes('tạo mới') || label.includes('thêm')) {
    return { intent: 'CREATE', expectedState: 'DRAFT', risk: 'medium' };
  }

  if (label.includes('edit') || label.includes('sửa') || label.includes('update') || label.includes('cập nhật')) {
    return { intent: 'UPDATE', expectedState: null, risk: 'medium' };
  }

  if (cat === 'form_field' && label.includes('status')) {
    return { intent: 'STATUS_CHANGE', expectedState: 'DIRECT_SELECT', risk: 'high', ambiguity: 'direct_edit_vs_workflow' };
  }

  if (label.includes('filter') || label.includes('lọc') || label.includes('search')) {
    return { intent: 'FILTER', expectedState: null, risk: 'low' };
  }

  if (label.includes('export') || label.includes('xuất') || label.includes('download')) {
    return { intent: 'EXPORT', expectedState: null, risk: 'low' };
  }

  return { intent: 'OTHER', expectedState: null, risk: 'low' };
}

async function main() {
  const inputFile = resolveInputFile();
  console.log(`[ui-intent-classifier] Classifying action intents from: ${inputFile}`);

  const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  const components = data.components || [];

  const classified = components.map(c => {
    const classification = classifyIntent(c);
    return {
      ...c,
      ...classification,
    };
  });

  const intentSummary = classified.reduce((acc, c) => {
    acc[c.intent] = (acc[c.intent] || 0) + 1;
    return acc;
  }, {});

  const result = {
    ...data,
    tool: 'ui-action-intent-classifier.mjs',
    classifiedAt: new Date().toISOString(),
    intentSummary,
    components: classified,
  };

  const outputPath = OUTPUT_FILE || inputFile;
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');
  console.log(`[ui-intent-classifier] ✅ Classified ${classified.length} components. Saved to: ${outputPath}`);
  console.log('Intent summary:', intentSummary);
}

main().catch(err => {
  console.error('[ui-intent-classifier] FATAL:', err.message);
  process.exit(1);
});
