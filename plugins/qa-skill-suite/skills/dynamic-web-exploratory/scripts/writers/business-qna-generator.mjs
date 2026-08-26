#!/usr/bin/env node
/**
 * business-qna-generator.mjs — Business Q&A Generator for Business Analysts
 *
 * Sinh bộ Q&A nghiệp vụ có source reference để Business Analyst có thể:
 *   - Trả lời câu hỏi "Ai được phép duyệt đơn hàng" → Admin và Manager (với source file)
 *   - Trả lời "Điều kiện chuyển trạng thái là gì" → status === PENDING (với source line)
 *   - Trả lời "API nào thực hiện thanh toán" → POST /payments (với module)
 *   - Trả lời "Xóa Account ảnh hưởng module nào" → Order, Invoice, Profile (với cross-refs)
 *
 * Đầu ra: business-qna.json (per repo) + ghi thêm vào system-qna.json (merged)
 *
 * Q&A được sinh từ:
 *   - permission-matrix.json → Who can do what
 *   - state-machines.json → State transition conditions
 *   - api-contracts.json → What API does what
 *   - business-rules.json → What are the constraints
 *   - architecture-map.json → Module dependencies
 *   - reconciliation-report.json → What is confirmed vs inferred
 *
 * Usage:
 *   node business-qna-generator.mjs --repo my-backend
 *   node business-qna-generator.mjs --repo-knowledge /path/to/qa-knowledge/repositories/my-backend
 *   node business-qna-generator.mjs --repo my-backend --output qa-knowledge/repositories/my-backend/business-qna.json
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const args   = process.argv.slice(2);
const getArg = (flag, def) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : def; };

const REPO_NAME   = getArg('--repo', null);
const KNOW_DIR    = getArg('--repo-knowledge', null);
const OUTPUT_FILE = getArg('--output', null);
const DATA_DIR    = process.env.QA_DATA_DIR || process.cwd();

function resolveKnowledgeDir() {
  if (KNOW_DIR) return KNOW_DIR;
  if (REPO_NAME) return path.join(DATA_DIR, 'qa-knowledge', 'repositories', REPO_NAME);
  console.error('[business-qna-generator] ❌ Cần --repo <name> hoặc --repo-knowledge <path>');
  process.exit(1);
}

function readJSON(dir, filename) {
  const fp = path.join(dir, filename);
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch { return null; }
}

function makeId(prefix, text) {
  const hash = crypto.createHash('md5').update(text).digest('hex').slice(0, 6).toUpperCase();
  return `${prefix}-QA-${hash}`;
}

function generatePermissionQA(perms, module) {
  const questions = [];
  if (!perms?.roles?.length) return questions;

  // "Ai có quyền truy cập X"
  for (const role of perms.roles) {
    const endpoints = perms.matrix?.[role] || [];
    if (endpoints.length === 0) continue;
    const q = `Role "${role}" có quyền truy cập những endpoint nào`;
    questions.push({
      questionId: makeId(module?.toUpperCase() || 'GLOBAL', q),
      category: 'permission',
      module: module || 'global',
      question: q,
      answer: endpoints.slice(0, 10).join(', '),
      answerStatus: 'verified',
      confidence: 'verified',
      sources: perms.rawGrants?.filter(g => g.roles.includes(role)).slice(0, 3).map(g => ({
        file: g.source?.split(':')[0],
        line: parseInt(g.source?.split(':')[1]) || null,
        type: 'static_code',
      })) || [],
    });
  }

  // "Ai được phép thực hiện [action]"
  for (const grant of (perms.rawGrants || []).slice(0, 20)) {
    if (grant.roles.length > 0) {
      const action = grant.endpoint?.replace(/^(GET|POST|PUT|PATCH|DELETE)\s+/, '') || 'action';
      const q = `Ai được phép thực hiện ${grant.endpoint}`;
      questions.push({
        questionId: makeId('PERM', q),
        category: 'permission',
        module: module || 'global',
        question: q,
        answer: `${grant.roles.join(', ')} (${grant.guard === 'authenticated' ? 'phải đăng nhập' : 'public'})`,
        answerStatus: 'verified',
        confidence: 'verified',
        sources: [{ file: grant.source?.split(':')[0], line: parseInt(grant.source?.split(':')[1]) || null, type: 'static_code' }],
      });
    }
  }

  return questions;
}

function generateStateMachineQA(machines, module) {
  const questions = [];
  for (const machine of (machines || [])) {
    if (machine.states.length === 0 && machine.transitions.length === 0) continue;

    // States
    questions.push({
      questionId: makeId(machine.entity.toUpperCase(), `states of ${machine.entity}`),
      category: 'state_machine',
      module: module || machine.entity,
      question: `${machine.entity} có những trạng thái nào`,
      answer: machine.states.join(' → ') || 'Chưa xác định đầy đủ',
      answerStatus: machine.states.length > 0 ? 'verified' : 'open',
      confidence: machine.states.length > 0 ? 'verified' : 'inferred',
      sources: machine.sources?.slice(0, 2).map(s => ({ file: s.split(':')[0], line: parseInt(s.split(':')[1]) || null, type: 'static_code' })) || [],
    });

    // Transitions
    for (const t of machine.transitions.slice(0, 5)) {
      const q = `Điều kiện để ${machine.entity} chuyển từ trạng thái ${t.from} sang ${t.to} là gì`;
      questions.push({
        questionId: makeId(machine.entity.toUpperCase(), q),
        category: 'state_machine',
        module: module || machine.entity,
        question: q,
        answer: `Transition được thực hiện tại ${t.source}`,
        answerStatus: 'needs_review',
        confidence: 'inferred',
        sources: [{ file: t.source?.split(':')[0], line: parseInt(t.source?.split(':')[1]) || null, type: 'static_code' }],
      });
    }
  }
  return questions;
}

function generateApiQA(endpoints, module) {
  const questions = [];
  const byModule = {};
  for (const ep of (endpoints || [])) {
    if (!byModule[ep.module]) byModule[ep.module] = [];
    byModule[ep.module].push(ep);
  }

  for (const [mod, eps] of Object.entries(byModule)) {
    questions.push({
      questionId: makeId(mod.toUpperCase(), `apis in ${mod}`),
      category: 'api',
      module: mod,
      question: `Module "${mod}" có những API endpoint nào`,
      answer: eps.slice(0, 10).map(e => `${e.method} ${e.path}`).join(', '),
      answerStatus: 'verified',
      confidence: 'verified',
      sources: eps.slice(0, 3).map(e => ({ file: e.source?.split(':')[0], line: parseInt(e.source?.split(':')[1]) || null, type: 'static_code' })),
    });

    const authRequired = eps.filter(e => e.auth_required);
    if (authRequired.length > 0) {
      questions.push({
        questionId: makeId(mod.toUpperCase(), `auth apis in ${mod}`),
        category: 'api',
        module: mod,
        question: `API nào trong module "${mod}" yêu cầu xác thực`,
        answer: authRequired.map(e => `${e.method} ${e.path}`).join(', '),
        answerStatus: 'verified',
        confidence: 'verified',
        sources: authRequired.slice(0, 3).map(e => ({ file: e.source?.split(':')[0], line: parseInt(e.source?.split(':')[1]) || null, type: 'static_code' })),
      });
    }
  }

  return questions;
}

function generateBusinessRuleQA(rules) {
  const questions = [];
  const grouped = {};
  for (const rule of (rules || [])) {
    if (!grouped[rule.module]) grouped[rule.module] = {};
    if (!grouped[rule.module][rule.category]) grouped[rule.module][rule.category] = [];
    grouped[rule.module][rule.category].push(rule);
  }

  for (const [mod, categories] of Object.entries(grouped)) {
    for (const [cat, catRules] of Object.entries(categories)) {
      if (catRules.length === 0) continue;
      const q = `Những ràng buộc nghiệp vụ nào thuộc loại "${cat}" trong module "${mod}"`;
      questions.push({
        questionId: makeId(`${mod}_${cat}`.toUpperCase(), q),
        category: 'business_rule',
        module: mod,
        question: q,
        answer: catRules.slice(0, 5).map(r => `[${r.ruleId}] ${r.condition.slice(0, 80)} → ${r.failureResult}`).join(' | '),
        answerStatus: 'verified',
        confidence: catRules.every(r => r.confidence === 'verified') ? 'verified' : 'inferred',
        sources: catRules.slice(0, 3).map(r => ({ file: r.source?.split(':')[0], line: parseInt(r.source?.split(':')[1]) || null, type: 'static_code', ruleId: r.ruleId })),
      });
    }
  }
  return questions;
}

function generateIntegrationQA(arch) {
  const questions = [];
  const integrations = arch?.globalIntegrations || [];
  if (integrations.length === 0) return questions;

  questions.push({
    questionId: makeId('ARCH', 'global integrations'),
    category: 'integration',
    module: 'architecture',
    question: 'Hệ thống tích hợp với những external service nào',
    answer: integrations.join(', '),
    answerStatus: 'verified',
    confidence: 'verified',
    sources: [],
  });

  for (const mod of (arch?.modules || [])) {
    if (mod.integrations?.length > 0) {
      questions.push({
        questionId: makeId(mod.name.toUpperCase(), `integrations in ${mod.name}`),
        category: 'integration',
        module: mod.name,
        question: `Module "${mod.name}" kết nối với external service nào`,
        answer: mod.integrations.join(', '),
        answerStatus: 'verified',
        confidence: 'inferred',
        sources: [],
      });
    }
  }
  return questions;
}

async function main() {
  const knowledgeDir = resolveKnowledgeDir();

  if (!fs.existsSync(knowledgeDir)) {
    console.error(`[business-qna-generator] ❌ Knowledge dir không tồn tại: ${knowledgeDir}`);
    process.exit(1);
  }

  const perms      = readJSON(knowledgeDir, 'permission-matrix.json');
  const states     = readJSON(knowledgeDir, 'state-machines.json');
  const api        = readJSON(knowledgeDir, 'api-contracts.json');
  const rules      = readJSON(knowledgeDir, 'business-rules.json');
  const arch       = readJSON(knowledgeDir, 'architecture-map.json');
  const meta       = readJSON(knowledgeDir, 'repo-metadata.json');
  const recon      = readJSON(knowledgeDir, 'reconciliation-report.json');

  const repoName = meta?.repoName || REPO_NAME || path.basename(knowledgeDir);
  const allQA = [];

  // Generate Q&A from each source
  allQA.push(...generatePermissionQA(perms, null));
  allQA.push(...generateStateMachineQA(states?.stateMachines, null));
  allQA.push(...generateApiQA(api?.endpoints, null));
  allQA.push(...generateBusinessRuleQA(rules?.rules));
  allQA.push(...generateIntegrationQA(arch));

  // Add Q&A for gaps from reconciliation
  if (recon?.gaps) {
    for (const gap of recon.gaps.filter(g => g.severity === 'critical' || g.severity === 'high')) {
      allQA.push({
        questionId: makeId('GAP', gap.gapType),
        category: 'gap',
        module: 'reconciliation',
        question: gap.description,
        answer: '',
        answerStatus: 'open',
        confidence: 'unknown',
        recommendation: gap.recommendation,
        sources: [],
      });
    }
  }

  // Deduplicate by questionId
  const seen = new Set();
  const unique = allQA.filter(q => {
    if (seen.has(q.questionId)) return false;
    seen.add(q.questionId);
    return true;
  });

  const output = {
    tool: 'business-qna-generator.mjs',
    repoName,
    generatedAt: new Date().toISOString(),
    totalQuestions: unique.length,
    byCategory: unique.reduce((acc, q) => { acc[q.category] = (acc[q.category] || 0) + 1; return acc; }, {}),
    byStatus: unique.reduce((acc, q) => { acc[q.answerStatus] = (acc[q.answerStatus] || 0) + 1; return acc; }, {}),
    questions: unique,
  };

  const outputPath = OUTPUT_FILE || path.join(knowledgeDir, 'business-qna.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8');
  console.log(`[business-qna-generator] ✅ Saved ${unique.length} Q&A to: ${outputPath}`);

  // Merge into system-qna.json
  const mergedDir = path.join(DATA_DIR, 'qa-knowledge', 'merged');
  fs.mkdirSync(mergedDir, { recursive: true });
  const sysQnaPath = path.join(mergedDir, 'system-qna.json');

  let sysQna = { tool: 'merged', generatedAt: new Date().toISOString(), repos: {}, totalQuestions: 0, questions: [] };
  if (fs.existsSync(sysQnaPath)) {
    try { sysQna = JSON.parse(fs.readFileSync(sysQnaPath, 'utf8')); } catch {}
  }

  // Remove old entries for this repo, add new ones
  sysQna.questions = sysQna.questions.filter(q => q.repoName !== repoName);
  sysQna.questions.push(...unique.map(q => ({ ...q, repoName })));
  sysQna.repos[repoName] = { count: unique.length, updatedAt: new Date().toISOString() };
  sysQna.totalQuestions = sysQna.questions.length;
  sysQna.generatedAt = new Date().toISOString();

  fs.writeFileSync(sysQnaPath, JSON.stringify(sysQna, null, 2), 'utf8');
  console.log(`[business-qna-generator] ✅ Merged into: ${sysQnaPath} (total: ${sysQna.totalQuestions} Q&A)`);

  console.log('\nQ&A by category:');
  for (const [cat, count] of Object.entries(output.byCategory)) {
    console.log(`  ${String(cat).padEnd(20)} ${count}`);
  }
  console.log('\nQ&A by status:');
  for (const [status, count] of Object.entries(output.byStatus)) {
    const icon = status === 'verified' ? '✅' : status === 'open' ? '⚠️' : '🔍';
    console.log(`  ${icon} ${String(status).padEnd(20)} ${count}`);
  }
}

main().catch(err => {
  console.error('[business-qna-generator] FATAL:', err.message);
  process.exit(1);
});
