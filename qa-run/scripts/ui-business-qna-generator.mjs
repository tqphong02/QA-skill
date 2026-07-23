#!/usr/bin/env node
/**
 * ui-business-qna-generator.mjs — SHA256 Fingerprinted Q&A Lifecycle Manager
 *
 * Q&A Fingerprinting & Lifecycle:
 *   - SHA256(page | component | conflict_type | normalized_question) for deterministic questionId
 *   - Statuses: OPEN, ANSWERED, ACCEPTED, REJECTED, OBSOLETE
 *   - Promotes ACCEPTED/ANSWERED human responses into Expected Business Rules in `resolved-business-rules.json`
 *   - Prevents regenerating already resolved questions as OPEN
 *
 * Usage:
 *   node ui-business-qna-generator.mjs --page order-detail
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

function generateSha256Id(page, component, type, question) {
  const normQ = (question || '').toLowerCase().trim().replace(/\s+/g, ' ');
  const raw = `${page}|${component || ''}|${type || ''}|${normQ}`;
  const hash = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 10).toUpperCase();
  return `UI-QA-${hash}`;
}

async function main() {
  const uiDir = path.join(DATA_DIR, 'qa-knowledge', 'ui-business', PAGE_SLUG);
  const lifecyclePath = path.join(uiDir, 'question-lifecycle.json');
  const resolvedRulesPath = path.join(uiDir, 'resolved-business-rules.json');

  const conflictsData  = readJSON(path.join(uiDir, 'business-conflicts.json'));
  const componentsData = readJSON(path.join(uiDir, 'ui-components.json'));

  // Load existing lifecycle state
  let existingLifecycle = readJSON(lifecyclePath) || { questions: [] };
  const existingMap = new Map();
  (existingLifecycle.questions || []).forEach(q => existingMap.set(q.questionId, q));

  const candidateQuestions = [];

  // Candidates from conflicts
  if (conflictsData?.conflicts) {
    conflictsData.conflicts.forEach(c => {
      const questionId = generateSha256Id(PAGE_SLUG, c.component, c.type, c.question);
      candidateQuestions.push({
        questionId,
        owner: c.owner || 'BA',
        module: PAGE_SLUG,
        region: c.region || 'UI',
        component: c.component || '',
        type: c.type,
        question: c.question,
        affectedComponents: [c.component],
        affectedFlows: [`${PAGE_SLUG}_flow`],
        severity: c.severity || 'Medium',
        confidence: c.confidence || 'verified',
        createdAt: new Date().toISOString(),
      });
    });
  }

  // Standard domain questions
  const components = componentsData?.components || [];

  if (components.some(c => c.intent === 'REJECT')) {
    const qText = 'Khi thực hiện Reject có bắt buộc nhập lý do (Reject Reason) không';
    const qId = generateSha256Id(PAGE_SLUG, 'Reject button', 'AMBIGUOUS', qText);
    candidateQuestions.push({
      questionId: qId,
      owner: 'BA',
      module: PAGE_SLUG,
      component: 'Reject button',
      type: 'AMBIGUOUS',
      question: qText,
      affectedComponents: ['Reject button'],
      affectedFlows: ['order_reject_flow'],
      severity: 'Medium',
      confidence: 'verified',
      createdAt: new Date().toISOString(),
    });
  }

  if (components.some(c => c.intent === 'CANCEL')) {
    const qText = 'Hành động Cancel có được thực hiện sau khi đơn đã ở trạng thái Approved không';
    const qId = generateSha256Id(PAGE_SLUG, 'Cancel button', 'AMBIGUOUS', qText);
    candidateQuestions.push({
      questionId: qId,
      owner: 'BA',
      module: PAGE_SLUG,
      component: 'Cancel button',
      type: 'AMBIGUOUS',
      question: qText,
      affectedComponents: ['Cancel button'],
      affectedFlows: ['order_cancel_flow'],
      severity: 'High',
      confidence: 'verified',
      createdAt: new Date().toISOString(),
    });
  }

  const updatedQuestions = [];
  const resolvedRules = [];

  candidateQuestions.forEach(cand => {
    const existing = existingMap.get(cand.questionId);

    if (existing && (existing.status === 'ANSWERED' || existing.status === 'ACCEPTED')) {
      // Keep answered question & promote to expected rule
      updatedQuestions.push(existing);
      resolvedRules.push({
        ruleId: existing.questionId,
        owner: existing.owner,
        question: existing.question,
        confirmedAnswer: existing.answer,
        status: existing.status,
        promotedToRule: true,
        resolvedAt: existing.resolvedAt || new Date().toISOString(),
      });
    } else if (existing && existing.status === 'REJECTED') {
      updatedQuestions.push(existing);
    } else {
      updatedQuestions.push({
        ...cand,
        status: existing?.status || 'OPEN',
        answer: existing?.answer || null,
        resolvedAt: existing?.resolvedAt || null,
      });
    }
  });

  // Preserve obsolete / resolved questions no longer in candidates
  existingMap.forEach((q, qId) => {
    if (!updatedQuestions.some(uq => uq.questionId === qId)) {
      if (q.status === 'ANSWERED' || q.status === 'ACCEPTED') {
        updatedQuestions.push(q);
        resolvedRules.push({
          ruleId: q.questionId,
          owner: q.owner,
          question: q.question,
          confirmedAnswer: q.answer,
          status: q.status,
          promotedToRule: true,
          resolvedAt: q.resolvedAt || new Date().toISOString(),
        });
      } else {
        updatedQuestions.push({ ...q, status: 'OBSOLETE' });
      }
    }
  });

  const byStatus = updatedQuestions.reduce((acc, q) => { acc[q.status] = (acc[q.status] || 0) + 1; return acc; }, {});
  const byOwner  = updatedQuestions.reduce((acc, q) => { acc[q.owner] = (acc[q.owner] || 0) + 1; return acc; }, {});

  const result = {
    tool: 'ui-business-qna-generator.mjs',
    pageSlug: PAGE_SLUG,
    managedAt: new Date().toISOString(),
    totalQuestions: updatedQuestions.length,
    byStatus,
    byOwner,
    questions: updatedQuestions,
  };

  fs.writeFileSync(lifecyclePath, JSON.stringify(result, null, 2), 'utf8');

  const outputPath = OUTPUT_FILE || path.join(uiDir, 'clarification-qna.json');
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');

  fs.writeFileSync(resolvedRulesPath, JSON.stringify({
    pageSlug: PAGE_SLUG,
    updatedAt: new Date().toISOString(),
    totalResolvedRules: resolvedRules.length,
    resolvedRules,
  }, null, 2), 'utf8');

  console.log(`[ui-qna-generator] ✅ SHA256 Fingerprinted Q&A Managed (${updatedQuestions.length} questions, ${resolvedRules.length} promoted rules)`);
}

main().catch(err => {
  console.error('[ui-qna-generator] FATAL:', err.message);
  process.exit(1);
});
