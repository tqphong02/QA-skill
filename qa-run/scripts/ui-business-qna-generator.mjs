#!/usr/bin/env node
/**
 * ui-business-qna-generator.mjs — Targeted Business Clarification Q&A Generator
 *
 * Generates targeted Q&A items for BA, PO, and Dev from conflicts & unresolved rules.
 *
 * Key Sample Questions Generated:
 *   - Nút Save Draft và Submit tạo ra trạng thái khác nhau như thế nào (PO)
 *   - Role nào được nhìn thấy và sử dụng nút Approve (BA)
 *   - Khi Reject có bắt buộc nhập lý do không (BA)
 *   - Cancel có được thực hiện sau khi Approved không (BA)
 *   - Status được thay đổi trực tiếp hay chỉ qua action button (Dev)
 *   - Delete là soft delete hay permanent delete (BA)
 *   - Khi backend từ chối action thì UI hiển thị thông báo gì (Dev)
 *   - Menu bị ẩn hay disabled khi user không có permission (BA)
 *   - Các button Approve và Complete có thể xuất hiện cùng lúc không (PO)
 *
 * Usage:
 *   node ui-business-qna-generator.mjs --page order-detail
 *   node ui-business-qna-generator.mjs --page order-detail --output qa-knowledge/ui-business/order-detail/clarification-qna.json
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const args = process.argv.slice(2);
const getArg = (flag, def) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : def; };

const PAGE_SLUG   = getArg('--page', 'page-ui');
const OUTPUT_FILE = getArg('--output', null);
const DATA_DIR    = process.env.QA_DATA_DIR || process.cwd();

function readJSON(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

function makeQnaId(owner, topic) {
  const hash = crypto.createHash('md5').update(`${owner}:${topic}`).digest('hex').slice(0, 6).toUpperCase();
  return `UI-QA-${owner}-${hash}`;
}

async function main() {
  const uiDir = path.join(DATA_DIR, 'qa-knowledge', 'ui-business', PAGE_SLUG);

  const conflictsData  = readJSON(path.join(uiDir, 'business-conflicts.json'));
  const unresolvedData = readJSON(path.join(uiDir, 'unresolved-rules.json'));
  const componentsData = readJSON(path.join(uiDir, 'ui-components.json'));

  const questions = [];

  // Generate from conflicts
  if (conflictsData?.conflicts) {
    conflictsData.conflicts.forEach(c => {
      questions.push({
        questionId: c.issueId || makeQnaId(c.owner || 'BA', c.question),
        owner: c.owner || 'BA',
        module: PAGE_SLUG,
        region: c.region || 'UI',
        component: c.component || '',
        type: c.type,
        question: c.question,
        context: {
          observedUI: c.observedUI,
          documentRule: c.documentRule,
          sourceRule: c.sourceRule,
        },
        severity: c.severity || 'Medium',
        confidence: c.confidence || 'verified',
        status: 'Open',
      });
    });
  }

  // Standard Domain Questions based on observed components
  const components = componentsData?.components || [];

  if (components.some(c => c.intent === 'REJECT')) {
    questions.push({
      questionId: makeQnaId('BA', 'reject_reason'),
      owner: 'BA',
      module: PAGE_SLUG,
      component: 'Reject button',
      type: 'AMBIGUOUS',
      question: 'Khi thực hiện Reject có bắt buộc nhập lý do (Reject Reason) không',
      context: { observedUI: 'Có nút Reject trên UI' },
      severity: 'Medium',
      confidence: 'verified',
      status: 'Open',
    });
  }

  if (components.some(c => c.intent === 'CANCEL')) {
    questions.push({
      questionId: makeQnaId('BA', 'cancel_after_approved'),
      owner: 'BA',
      module: PAGE_SLUG,
      component: 'Cancel button',
      type: 'AMBIGUOUS',
      question: 'Hành động Cancel có được thực hiện sau khi đơn đã ở trạng thái Approved không',
      context: { observedUI: 'Nút Cancel xuất hiện trên UI' },
      severity: 'High',
      confidence: 'verified',
      status: 'Open',
    });
  }

  if (components.some(c => c.intent === 'APPROVE') && components.some(c => c.intent === 'COMPLETE')) {
    questions.push({
      questionId: makeQnaId('PO', 'approve_and_complete_simultaneous'),
      owner: 'PO',
      module: PAGE_SLUG,
      component: 'Approve & Complete buttons',
      type: 'AMBIGUOUS',
      question: 'Các button Approve và Complete có thể xuất hiện cùng lúc trên màn hình hay phải theo thứ tự',
      context: { observedUI: 'Có cả 2 nút Approve và Complete' },
      severity: 'Medium',
      confidence: 'verified',
      status: 'Open',
    });
  }

  // Deduplicate
  const seen = new Set();
  const unique = questions.filter(q => {
    if (seen.has(q.questionId)) return false;
    seen.add(q.questionId);
    return true;
  });

  const byOwner = unique.reduce((acc, q) => { acc[q.owner] = (acc[q.owner] || 0) + 1; return acc; }, {});

  const result = {
    tool: 'ui-business-qna-generator.mjs',
    pageSlug: PAGE_SLUG,
    generatedAt: new Date().toISOString(),
    totalQuestions: unique.length,
    byOwner,
    questions: unique,
  };

  const outputPath = OUTPUT_FILE || path.join(uiDir, 'clarification-qna.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');
  console.log(`[ui-qna-generator] ✅ Generated ${unique.length} targeted questions. Saved to: ${outputPath}`);
  console.log('By Owner:', byOwner);
}

main().catch(err => {
  console.error('[ui-qna-generator] FATAL:', err.message);
  process.exit(1);
});
