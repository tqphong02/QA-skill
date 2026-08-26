#!/usr/bin/env node
/**
 * ui-business-qna-generator.mjs — SHA256 Fingerprinted Q&A Lifecycle Manager
 *
 * Q&A Fingerprinting & Lifecycle:
 *   - SHA256(page | component | conflict_type | normalized_question) for deterministic questionId
 *   - Shared BA statuses: Open, Answered, Blocked, Cancelled
 *   - Promotes Answered human responses into Expected Business Rules in `resolved-business-rules.json`
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

function normalizeStatus(status) {
  const value = String(status || 'Open').toUpperCase();
  if (value === 'ANSWERED' || value === 'ACCEPTED') return 'Answered';
  if (value === 'BLOCKED') return 'Blocked';
  if (value === 'CANCELLED' || value === 'REJECTED' || value === 'OBSOLETE') return 'Cancelled';
  return 'Open';
}

async function main() {
  const uiDir = path.join(DATA_DIR, 'qa-knowledge', 'ui-business', PAGE_SLUG);
  const lifecyclePath = path.join(uiDir, 'question-lifecycle.json');
  const resolvedRulesPath = path.join(uiDir, 'resolved-business-rules.json');

  const conflictsData  = readJSON(path.join(uiDir, 'business-conflicts.json'));
  const unresolvedData = readJSON(path.join(uiDir, 'unresolved-rules.json'));

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
        confidence: c.confidence || 'document_supported',
        createdAt: new Date().toISOString(),
      });
    });
  }

  for (const rule of unresolvedData?.unresolvedRules || []) {
    const component = rule.component || rule.field || rule.button || rule.menu || '';
    const questionId = generateSha256Id(PAGE_SLUG, component, rule.rulePattern, rule.question);
    if (candidateQuestions.some(item => item.questionId === questionId)) continue;
    candidateQuestions.push({
      questionId, owner: 'BA', module: PAGE_SLUG, region: 'UI', component,
      type: rule.rulePattern, question: rule.question,
      affectedComponents: component ? [component] : [], affectedFlows: [`${PAGE_SLUG}_flow`],
      severity: 'Medium', confidence: 'ui_observed', createdAt: new Date().toISOString(),
    });
  }

  const updatedQuestions = [];
  const resolvedRules = [];

  candidateQuestions.forEach(cand => {
    const existing = existingMap.get(cand.questionId);

    const existingStatus = normalizeStatus(existing?.status);
    if (existing && existingStatus === 'Answered') {
      // Keep answered question & promote to expected rule
      updatedQuestions.push(existing);
      resolvedRules.push({
        ruleId: existing.questionId,
        owner: existing.owner,
        question: existing.question,
        confirmedAnswer: existing.answer,
        status: 'Answered',
        evidenceLevel: 'human_confirmed',
        promotedToRule: true,
        resolvedAt: existing.resolvedAt || new Date().toISOString(),
      });
    } else if (existing && existingStatus === 'Cancelled') {
      updatedQuestions.push({ ...existing, status: 'Cancelled' });
    } else {
      updatedQuestions.push({
        ...cand,
        status: existingStatus,
        answer: existing?.answer || null,
        resolvedAt: existing?.resolvedAt || null,
      });
    }
  });

  // Preserve obsolete / resolved questions no longer in candidates
  existingMap.forEach((q, qId) => {
    if (!updatedQuestions.some(uq => uq.questionId === qId)) {
      const oldStatus = normalizeStatus(q.status);
      if (oldStatus === 'Answered') {
        updatedQuestions.push({ ...q, status: 'Answered' });
        resolvedRules.push({
          ruleId: q.questionId,
          owner: q.owner,
          question: q.question,
          confirmedAnswer: q.answer,
          status: 'Answered',
          evidenceLevel: 'human_confirmed',
          promotedToRule: true,
          resolvedAt: q.resolvedAt || new Date().toISOString(),
        });
      } else {
        updatedQuestions.push({ ...q, status: 'Cancelled' });
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
