#!/usr/bin/env node
/**
 * write-rbac-matrix.mjs — RBAC Permission Matrix Markdown Generator
 *
 * Đọc file permission-matrix.json (được sinh ra bởi permission-matrix-extractor.mjs)
 * và tạo ra báo cáo Markdown rbac-matrix.md dễ đọc cho con người (QA/BA/Dev/Security/PO).
 *
 * Báo cáo gồm 5 sections:
 *   1. Tổng quan Phân quyền (Roles Overview)
 *   2. Ma trận Phân quyền Endpoints (Endpoint × Role Matrix)
 *   3. Chi tiết Quyền theo Role (Detailed Grants by Role)
 *   4. Gợi ý Đánh giá Rủi ro & Kiểm thử cho QA (QA Risk & Test Recommendations)
 *   5. Tổng hợp Xung đột (CONFLICT Summary) — liệt kê các REQ_CODE_CONFLICT, RUNTIME_CONFLICT, RUNTIME_BYPASS
 *
 * NOTE: AI agent khi chạy tự động chỉ nên đọc permission-matrix.json.
 *       Script này dùng để tạo artifact báo cáo bàn giao cho con người.
 *
 * Usage:
 *   node write-rbac-matrix.mjs --input qa-knowledge/repositories/my-repo/permission-matrix.json --output rbac-matrix.md
 */

import fs from 'node:fs';
import path from 'node:path';

const args   = process.argv.slice(2);
const getArg = (flag, def) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : def; };

const INPUT_FILE  = getArg('--input', getArg('--permission-matrix', null));
const OUTPUT_FILE = getArg('--output', null);

if (!INPUT_FILE) {
  console.error('[write-rbac-matrix] ❌ Cần tham số --input <path/to/permission-matrix.json>');
  process.exit(1);
}

if (!fs.existsSync(INPUT_FILE)) {
  console.error(`[write-rbac-matrix] ❌ File không tồn tại: ${INPUT_FILE}`);
  process.exit(1);
}

function readJSON(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

function generateRBACMarkdown(data) {
  const now = data.extractedAt || new Date().toISOString();
  const repoName = path.basename(data.repoPath || 'repository');
  const roles = data.roles || [];
  const grants = data.rawGrants || [];
  const matrix = data.matrix || {};
  const entries = data.permissionEntries || [];
  const conflictSummary = data.conflictSummary || {};

  const allEndpoints = [...new Set(grants.map(g => g.endpoint))].sort();

  let md = `# RBAC Permission Matrix: ${repoName}\n\n`;
  md += `> **Được sinh tự động bởi write-rbac-matrix**\n`;
  md += `> Thời gian: ${now}\n`;
  md += `> Nguồn dữ liệu: \`${INPUT_FILE}\`\n`;
  if (data.sources) {
    if (data.sources.requirement) md += `> Nguồn Requirement: \`${data.sources.requirement}\`\n`;
    if (data.sources.runtime) md += `> Nguồn Runtime Findings: \`${data.sources.runtime}\`\n`;
  }
  md += `\n---\n\n`;

  // ── Section 1: Roles Overview ──────────────────────────────────────────────
  md += `## 1. Tổng quan Phân quyền (Roles Overview)\n\n`;
  if (roles.length === 0) {
    md += `_Không phát hiện role nào trong source code_\n\n`;
  } else {
    md += `| Role | Số Endpoints truy cập | Mô tả quyền hạn |\n`;
    md += `|:---|:---:|:---|\n`;
    roles.forEach(role => {
      const count = matrix[role]?.length || 0;
      let desc = 'Quyền hạn xác thực theo role';
      if (role === 'PUBLIC') desc = 'Truy cập công khai không cần xác thực (No Auth)';
      else if (role.toLowerCase().includes('admin')) desc = 'Quyền quản trị cao nhất hệ thống';
      else if (role.toLowerCase().includes('manager')) desc = 'Quyền quản lý nghiệp vụ và phê duyệt';
      else if (role.toLowerCase().includes('staff') || role.toLowerCase().includes('user')) desc = 'Quyền thao tác nghiệp vụ cơ bản';
      md += `| \`${role}\` | ${count} | ${desc} |\n`;
    });
    md += `\n`;
  }
  md += `---\n\n`;

  // ── Section 2: Endpoint × Role Matrix ──────────────────────────────────────
  md += `## 2. Ma trận Phân quyền Endpoints (Endpoint × Role Matrix)\n\n`;
  if (allEndpoints.length === 0) {
    md += `_Không phát hiện endpoint nào được gán quyền_\n\n`;
  } else {
    const roleHeaders = roles.map(r => ` \`${r}\` `).join('|');
    const alignHeaders = roles.map(() => `:---:`).join('|');
    md += `| Endpoint | Guard |${roleHeaders}|\n`;
    md += `|:---|:---:|${alignHeaders}|\n`;
    allEndpoints.forEach(ep => {
      const grant = grants.find(g => g.endpoint === ep);
      const guard = grant ? grant.guard : 'none';
      const rowCells = roles.map(r => {
        const hasAccess = matrix[r]?.includes(ep);
        return hasAccess ? 'ALLOW' : '-';
      }).join(' | ');
      md += `| \`${ep}\` | \`${guard}\` | ${rowCells} |\n`;
    });
    md += `\n`;
  }
  md += `---\n\n`;

  // ── Section 3: Detailed Grants by Role ─────────────────────────────────────
  md += `## 3. Chi tiết Quyền theo Role (Detailed Grants by Role)\n\n`;
  if (roles.length === 0) {
    md += `_Không có chi tiết_\n\n`;
  } else {
    roles.forEach(role => {
      md += `### Role: \`${role}\`\n`;
      const eps = matrix[role] || [];
      if (eps.length === 0) {
        md += `_Không có endpoint nào_\n\n`;
      } else {
        eps.forEach(ep => {
          const grant = grants.find(g => g.endpoint === ep && (g.roles.includes(role) || (role === 'AUTHENTICATED' && g.guard === 'authenticated')));
          const src = grant ? ` (nguồn: \`${grant.source}\`)` : '';
          md += `- \`${ep}\`${src}\n`;
        });
        md += `\n`;
      }
    });
  }
  md += `---\n\n`;

  // ── Section 4: QA Risk & Test Recommendations ──────────────────────────────
  md += `## 4. Gợi ý Đánh giá Rủi ro & Kiểm thử cho QA (QA Risk & Test Recommendations)\n\n`;
  md += `- **Privilege Escalation Test:** Kiểm tra việc dùng token của role có quyền thấp (ví dụ: Staff/User) gọi vào các endpoint của role cao (ví dụ: Admin/Manager) để xác nhận hệ thống trả HTTP 403 Forbidden\n`;
  md += `- **Unauthenticated Access Test:** Thử gọi các endpoint yêu cầu guard authenticated mà không truyền header Authorization (Bearer Token) để xác nhận hệ thống trả HTTP 401 Unauthorized\n`;
  md += `- **Public Endpoint Audit:** Kiểm tra rà soát lại toàn bộ các endpoint thuộc nhóm \`PUBLIC\` để đảm bảo không rò rỉ thông tin nhạy cảm (PII/Financial data) ra bên ngoài\n`;
  md += `- **IDOR / Broken Object Level Authorization:** Với các endpoint có tham số ID (ví dụ \`GET /orders/:id\`), kiểm tra user role hợp lệ có bị truy cập chéo dữ liệu của user khác hay không\n\n`;
  md += `---\n\n`;

  // ── Section 5: CONFLICT Summary ────────────────────────────────────────────
  md += `## 5. Tổng hợp Xung đột (CONFLICT Summary)\n\n`;
  const conflictEntries = entries.filter(e =>
    e.status === 'RUNTIME_BYPASS' ||
    e.status === 'RUNTIME_CONFLICT' ||
    e.status === 'REQ_CODE_CONFLICT'
  );

  if (conflictEntries.length === 0) {
    md += `✅ **Không phát hiện xung đột phân quyền nào giữa Requirement, Source Code và Runtime.**\n\n`;
  } else {
    md += `> [!WARNING]\n`;
    md += `> Phát hiện **${conflictEntries.length}** điểm xung đột phân quyền cần rà soát lại.\n\n`;

    md += `| Role | Endpoint | Requirement | Source Code | Runtime | Trạng thái (Status) | Độ tin cậy |\n`;
    md += `|:---|:---|:---:|:---:|:---:|:---:|:---:|\n`;
    conflictEntries.forEach(e => {
      const req = e.requirement || 'N/A';
      const code = e.sourceCode || 'N/A';
      const run = e.runtime || 'N/A';
      let icon = '⚠️';
      if (e.status === 'RUNTIME_BYPASS') icon = '🚨';
      md += `| \`${e.role}\` | \`${e.endpoint}\` | \`${req}\` | \`${code}\` | \`${run}\` | ${icon} \`${e.status}\` | \`${e.confidence}\` |\n`;
    });
    md += `\n`;
  }

  return md;
}

function main() {
  const data = readJSON(INPUT_FILE);
  if (!data) {
    console.error(`[write-rbac-matrix] ❌ Không thể parse JSON từ file: ${INPUT_FILE}`);
    process.exit(1);
  }

  const markdown = generateRBACMarkdown(data);

  const outPath = OUTPUT_FILE || INPUT_FILE.replace(/\.json$/i, '.md');
  if (outPath === INPUT_FILE) {
    console.error('[write-rbac-matrix] ❌ Output file không được trùng với input JSON');
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, markdown, 'utf8');
  console.log(`[write-rbac-matrix] ✅ Saved RBAC Markdown report to: ${outPath}`);
}

main();
