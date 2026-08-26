#!/usr/bin/env node
/**
 * finding-reconciler.mjs — Runtime Evidence & KB Feedback Loop Reconciler
 *
 * Đóng vòng lặp QA ecosystem:
 *   1. Đọc file kết quả kiểm thử runtime (evidence/rbac-test-<run-id>.json hoặc từ dynamic-web-exploratory)
 *   2. Cập nhật trực tiếp trường runtime, status, và confidence trong permission-matrix.json
 *   3. Xuất/Cập nhật file runtime-findings.json trong bộ nhớ QA Knowledge
 *   4. Phản hồi các điểm xung đột (CONFLICT/BYPASS) về cho static-requirements-analysis bằng cách
 *      ghi thêm câu hỏi vào system-qna.json / business-qna.json mà không ghi đè câu đã CONFIRMED.
 *
 * Usage:
 *   node finding-reconciler.mjs --findings evidence/rbac-test-res.json --permission-matrix pm.json
 *   node finding-reconciler.mjs --findings res.json --permission-matrix pm.json --output-dir qa-knowledge/repositories/my-repo --dry-run
 */

import fs from 'node:fs';
import path from 'node:path';

const args   = process.argv.slice(2);
const getArg = (flag, def) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : def; };
const hasFlag = (flag) => args.includes(flag);

const FINDINGS_PATH = getArg('--findings', getArg('--input', null));
const MATRIX_PATH   = getArg('--permission-matrix', getArg('--pm', null));
const OUTPUT_DIR    = getArg('--output-dir', null);
const DRY_RUN       = hasFlag('--dry-run');

if (!FINDINGS_PATH || !fs.existsSync(FINDINGS_PATH)) {
  console.error(`[finding-reconciler] ❌ Cần --findings <path> (file tồn tại)`);
  process.exit(1);
}

if (!MATRIX_PATH || !fs.existsSync(MATRIX_PATH)) {
  console.error(`[finding-reconciler] ❌ Cần --permission-matrix <path> (file tồn tại)`);
  process.exit(1);
}

function readJSON(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

function classifyStatus(reqIntent, codeAllows, runtimeAllows) {
  if (runtimeAllows === true && (reqIntent === 'deny' || codeAllows === false)) {
    return 'RUNTIME_BYPASS';
  }
  if (runtimeAllows === false && (reqIntent === 'allow' || codeAllows === true)) {
    return 'RUNTIME_CONFLICT';
  }
  if (reqIntent !== null && codeAllows !== null) {
    if ((reqIntent === 'allow') !== codeAllows) return 'REQ_CODE_CONFLICT';
  }
  if (runtimeAllows !== null) return 'RUNTIME_CONFIRMED';
  if (reqIntent !== null || codeAllows !== null) return 'STATIC_CONFIRMED';
  return 'UNVERIFIED';
}

function main() {
  console.log(`[finding-reconciler] 🔄 Reconciling runtime findings into Knowledge Base...`);
  const findingsReport = readJSON(FINDINGS_PATH);
  const matrixData = readJSON(MATRIX_PATH);

  const findings = findingsReport.findings || (Array.isArray(findingsReport) ? findingsReport : []);
  const allResults = findingsReport.allResults || [];
  const entries = matrixData.permissionEntries || [];

  console.log(`[finding-reconciler] Processing ${findings.length} findings from ${allResults.length || findings.length} runtime evaluations...`);

  let updatedCount = 0;
  let bypassCount = 0;
  let conflictCount = 0;

  // 1. Cập nhật permissionEntries trong permission-matrix.json
  entries.forEach(entry => {
    // Tìm trong allResults hoặc findings
    const res = allResults.find(r => r.role?.toLowerCase() === entry.role?.toLowerCase() && r.endpoint === entry.endpoint) ||
                findings.find(f => f.role?.toLowerCase() === entry.role?.toLowerCase() && f.evidence?.request === entry.endpoint);

    if (res) {
      const is2xx = res.responseStatus ? (res.responseStatus >= 200 && res.responseStatus < 300) : (res.actual && res.actual.includes('200'));
      entry.runtime = is2xx ? 'allow' : 'deny';
      entry.confidence = 'high';
      entry.status = classifyStatus(entry.requirement, entry.sourceCode === 'allow', is2xx);
      if (res.findingType || res.type) {
        entry.evidence.runtimeRef = {
          type: res.findingType || res.type,
          responseStatus: res.responseStatus,
          screenshot: res.evidence?.screenshot || null,
        };
      }
      updatedCount++;
      if (entry.status === 'RUNTIME_BYPASS') bypassCount++;
      if (entry.status === 'RUNTIME_CONFLICT' || entry.status === 'REQ_CODE_CONFLICT') conflictCount++;
    }
  });

  // Cập nhật conflictSummary
  matrixData.conflictSummary = {
    RUNTIME_BYPASS:    entries.filter(e => e.status === 'RUNTIME_BYPASS').length,
    RUNTIME_CONFLICT:  entries.filter(e => e.status === 'RUNTIME_CONFLICT').length,
    REQ_CODE_CONFLICT: entries.filter(e => e.status === 'REQ_CODE_CONFLICT').length,
    UNVERIFIED:        entries.filter(e => e.status === 'UNVERIFIED').length,
  };
  matrixData.lastReconciledAt = new Date().toISOString();

  // 2. Chuẩn bị file runtime-findings.json
  const outDir = OUTPUT_DIR || path.dirname(MATRIX_PATH);
  const runtimeFindingsPath = path.join(outDir, 'runtime-findings.json');
  let existingRuntimeData = readJSON(runtimeFindingsPath) || { version: '1', findings: [] };
  const existingFindings = existingRuntimeData.findings || [];

  // Merge findings mới mà không lặp lại
  findings.forEach(f => {
    const exists = existingFindings.some(ef => ef.role === f.role && ef.action === f.action && ef.type === f.type);
    if (!exists) {
      existingFindings.push({
        ...f,
        reconciledAt: new Date().toISOString(),
      });
    }
  });
  existingRuntimeData.findings = existingFindings;
  existingRuntimeData.updatedAt = new Date().toISOString();

  // 3. Phản hồi xung đột về hệ thống Q&A cho static-requirements-analysis (system-qna.json / business-qna.json)
  const qnaPath = path.join(outDir, 'business-qna.json');
  let qnaData = readJSON(qnaPath) || { version: '1', questions: [] };
  let newQnaCount = 0;

  findings.forEach((f, idx) => {
    if (['API_PERMISSION_BYPASS', 'PRIVILEGE_ESCALATION', 'IDOR', 'DATA_SCOPE_LEAK'].includes(f.type)) {
      const qId = `Q-RBAC-${Date.now()}-${idx}`;
      const exists = qnaData.questions.some(q => q.topic?.includes(f.evidence?.request || f.action));
      if (!exists) {
        qnaData.questions.push({
          questionId: qId,
          status: 'pending',
          priority: 'high',
          category: 'security_conflict',
          topic: `Phân quyền RBAC cho ${f.role} thao tác ${f.action || f.evidence?.request}`,
          question: `Phát hiện xung đột ${f.type}: Role '${f.role}' thực hiện '${f.action}' kết quả runtime là ${f.actual} trong khi expected là ${f.expected}. Nghiệp vụ xác nhận cho phép hay cấm thao tác này?`,
          assignee: 'PO/Security',
          proposedAnswer: `Kiểm tra lại phân quyền trên backend cho endpoint ${f.evidence?.request}.`,
          confirmedAnswer: null,
          sourceRef: 'runtime-findings.json',
        });
        newQnaCount++;
      }
    }
  });

  if (DRY_RUN) {
    console.log(`[finding-reconciler] ℹ️  DRY-RUN MODE — no files written.`);
    console.log(`  Would update ${updatedCount} entries in ${MATRIX_PATH}`);
    console.log(`  Would save ${existingFindings.length} total findings to ${runtimeFindingsPath}`);
    console.log(`  Would add ${newQnaCount} new security questions to ${qnaPath}`);
  } else {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(MATRIX_PATH, JSON.stringify(matrixData, null, 2), 'utf8');
    fs.writeFileSync(runtimeFindingsPath, JSON.stringify(existingRuntimeData, null, 2), 'utf8');
    if (newQnaCount > 0 || fs.existsSync(qnaPath)) {
      fs.writeFileSync(qnaPath, JSON.stringify(qnaData, null, 2), 'utf8');
    }
    console.log(`[finding-reconciler] ✅ Updated ${MATRIX_PATH}`);
    console.log(`[finding-reconciler] ✅ Saved runtime findings to ${runtimeFindingsPath}`);
    if (newQnaCount > 0) {
      console.log(`[finding-reconciler] ✅ Fed back ${newQnaCount} new security Q&A items to ${qnaPath} (closed loop to BA)`);
    }
  }

  console.log(`\n[finding-reconciler] Summary: Updated=${updatedCount} | RUNTIME_BYPASS=${bypassCount} | CONFLICTS=${conflictCount} | New Q&A=${newQnaCount}`);
}

main();
