#!/usr/bin/env node
/**
 * permission-matrix-extractor.mjs — 3-Source Role × Permission Matrix Builder
 *
 * Tổng hợp RBAC từ 3 nguồn và phân loại xung đột:
 *   1. Requirement   — đọc từ business-rules.json (sinh bởi static-requirements-analysis)
 *   2. Source Code   — quét @Roles() / @UseGuards() / middleware (NestJS, Express, Fastify)
 *   3. Runtime       — đọc từ runtime-findings.json (ghi bởi finding-reconciler sau dynamic-web-exploratory)
 *
 * Schema mỗi grant:
 *   { role, resource, action, endpoint, requirement, sourceCode, runtime,
 *     status, confidence, evidence }
 *
 * Status enum:
 *   STATIC_CONFIRMED  — requirement và sourceCode khớp; runtime chưa có
 *   RUNTIME_CONFIRMED — cả 3 nguồn khớp
 *   REQ_CODE_CONFLICT — requirement và sourceCode mâu thuẫn
 *   RUNTIME_CONFLICT  — runtime mâu thuẫn với requirement hoặc sourceCode
 *   RUNTIME_BYPASS    — runtime cho phép nhưng requirement/sourceCode cấm (lỗi bảo mật)
 *   UNVERIFIED        — chỉ có 1 nguồn, chưa đủ để kết luận
 *
 * NOTE: File này chỉ sinh permission-matrix.json (machine-readable).
 *       Để sinh rbac-matrix.md (human-readable), chạy write-rbac-matrix.mjs.
 *
 * Usage:
 *   node permission-matrix-extractor.mjs --repo /path/to/project --output pm.json
 *   node permission-matrix-extractor.mjs --repo . --output pm.json \
 *     --req-knowledge qa-knowledge/repositories/my-repo/business-rules.json \
 *     --runtime-findings qa-knowledge/repositories/my-repo/runtime-findings.json
 */

import fs from 'node:fs';
import path from 'node:path';

const args   = process.argv.slice(2);
const getArg = (flag, def) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : def; };

const REPO_PATH       = path.resolve(getArg('--repo', '.'));
const OUTPUT_FILE     = getArg('--output', null);
const REQ_KNOWLEDGE   = getArg('--req-knowledge', null);    // path to business-rules.json
const RUNTIME_FINDINGS = getArg('--runtime-findings', null); // path to runtime-findings.json
const MAX_FILE_SIZE   = 150 * 1024;

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.nuxt', 'coverage', '__mocks__', 'vendor', 'generated']);

function readJSON(filePath) {
  if (!filePath) return null;
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

function walkDir(dir, onFile, depth = 0) {
  if (depth > 10) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const fullPath = path.join(dir, e.name);
    if (e.isDirectory()) walkDir(fullPath, onFile, depth + 1);
    else if (e.isFile() && /\.(ts|js|tsx|jsx|mjs)$/.test(e.name) && !/\.(spec|test)\./.test(e.name)) {
      const stat = fs.statSync(fullPath);
      if (stat.size < MAX_FILE_SIZE) onFile(fullPath);
    }
  }
}

// ── Source 2: Extract grants from source code ──────────────────────────────────

function extractSourceCodeGrants(repoPath) {
  const allRoles = new Set();
  const grants = [];
  let fileCount = 0;

  walkDir(repoPath, (filePath) => {
    const relativePath = path.relative(repoPath, filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    let controllerPath = '';
    let controllerGuard = false;
    let controllerRoles = [];

    lines.forEach((line, i) => {
      const trim = line.trim();
      let m;

      if ((m = trim.match(/@Controller\(['"` ]([^'"` ]*)/))) {
        controllerPath = m[1];
        controllerGuard = false;
        controllerRoles = [];
      }
      if (/@UseGuards\(/.test(trim)) controllerGuard = true;
      if ((m = trim.match(/@Roles\(([^)]+)\)/))) {
        const roles = m[1].split(',').map(r => r.replace(/['"`\s]/g, '')).filter(Boolean);
        roles.forEach(r => allRoles.add(r));

        for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
          const methodMatch = lines[j].match(/@(Get|Post|Put|Patch|Delete)\(['"` ]?([^'"`) \s]*)/i);
          if (methodMatch) {
            grants.push({
              roles,
              endpoint: `${methodMatch[1].toUpperCase()} ${controllerPath ? '/' + controllerPath : ''}${methodMatch[2] ? '/' + methodMatch[2] : ''}`,
              guard: controllerGuard ? 'authenticated' : 'none',
              source: `${relativePath}:${i + 1}`,
              confidence: 'verified',
            });
            break;
          }
        }
        if (!grants.some(g => g.source === `${relativePath}:${i + 1}`)) {
          controllerRoles = roles;
        }
      }

      if (/@Public\(\)/.test(trim)) {
        grants.push({
          roles: ['PUBLIC'],
          endpoint: `(next endpoint at ${relativePath}:${i + 1})`,
          guard: 'none',
          source: `${relativePath}:${i + 1}`,
          confidence: 'verified',
        });
        allRoles.add('PUBLIC');
      }

      if ((m = trim.match(/(?:export\s+)?enum\s+(\w*[Rr]ole\w*)/))) {
        for (let j = i + 1; j < Math.min(i + 20, lines.length); j++) {
          if (lines[j].trim() === '}') break;
          const valMatch = lines[j].trim().match(/^(\w+)/);
          if (valMatch) allRoles.add(valMatch[1]);
        }
      }
    });

    fileCount++;
  });

  return { allRoles, grants, fileCount };
}

// ── Source 1: Extract requirement rules from business-rules.json ───────────────

function extractRequirementPermissions(businessRulesPath) {
  const data = readJSON(businessRulesPath);
  if (!data) return [];

  const rules = data.rules || [];
  // Permission rules thường có category = 'permission' hoặc keyword role/allow/deny trong condition
  return rules
    .filter(r => r.category === 'permission' || /\b(role|allow|deny|forbidden|unauthorized)\b/i.test(r.condition || ''))
    .map(r => ({
      ruleId: r.ruleId,
      module: r.module,
      condition: r.condition,
      result: r.successResult || r.failureResult || '',
      source: r.source,
      // Suy ra intent: nếu có "deny" / "forbidden" / "not allowed" → deny; ngược lại → allow
      intent: /\b(deny|forbidden|not allowed|unauthorized|must not)\b/i.test(r.condition + ' ' + (r.failureResult || '')) ? 'deny' : 'allow',
    }));
}

// ── Source 3: Load runtime findings ────────────────────────────────────────────

function loadRuntimeFindings(runtimePath) {
  const data = readJSON(runtimePath);
  if (!data) return [];
  const findings = data.findings || (Array.isArray(data) ? data : []);
  return findings.map(f => ({
    type: f.type,
    role: f.role,
    action: f.action,
    endpoint: f.evidence?.request || null,
    expected: f.expected,
    actual: f.actual,
    responseStatus: f.evidence?.responseStatus || null,
    screenshot: f.evidence?.screenshot || null,
  }));
}

// ── Reconcile 3 sources per grant ─────────────────────────────────────────────

function classifyStatus(reqIntent, codeAllows, runtimeAllows) {
  // 1. Runtime vượt quyền nghiêm trọng nhất
  if (runtimeAllows === true && (reqIntent === 'deny' || codeAllows === false)) {
    return 'RUNTIME_BYPASS';
  }
  // 2. Runtime mâu thuẫn với code/req (cho phép bị cấm runtime)
  if (runtimeAllows === false && (reqIntent === 'allow' || codeAllows === true)) {
    return 'RUNTIME_CONFLICT';
  }
  // 3. Req và Code mâu thuẫn nhau (không có runtime)
  if (reqIntent !== null && codeAllows !== null) {
    const reqAllows = reqIntent === 'allow';
    if (reqAllows !== codeAllows) return 'REQ_CODE_CONFLICT';
  }
  // 4. Runtime xác nhận
  if (runtimeAllows !== null) return 'RUNTIME_CONFIRMED';
  // 5. Static confirmed (req + code khớp, runtime chưa có)
  if (reqIntent !== null || codeAllows !== null) return 'STATIC_CONFIRMED';
  return 'UNVERIFIED';
}

function buildPermissionEntries(allRoles, grants, reqRules, runtimeFindings) {
  const entries = [];

  for (const role of allRoles) {
    const codeGrants = grants.filter(g => g.roles.includes(role) || (role === 'AUTHENTICATED' && g.guard === 'authenticated'));
    const endpointsWithAccess = new Set(codeGrants.map(g => g.endpoint));

    // Combine all endpoints seen in grants
    const allEndpoints = [...new Set(grants.map(g => g.endpoint))];

    for (const endpoint of allEndpoints) {
      const codeAllows = endpointsWithAccess.has(endpoint);
      const codeGrant = codeGrants.find(g => g.endpoint === endpoint);

      // Match requirement rule by endpoint path keywords
      const matchedReqRule = reqRules.find(r => {
        const ep = endpoint.toLowerCase();
        const mod = (r.module || '').toLowerCase();
        return ep.includes(mod) || (r.condition || '').toLowerCase().includes(role.toLowerCase());
      });
      const reqIntent = matchedReqRule ? matchedReqRule.intent : null;

      // Match runtime finding
      const runtimeFinding = runtimeFindings.find(f =>
        f.role?.toLowerCase() === role.toLowerCase() &&
        (f.endpoint?.includes(endpoint.split(' ')[1]) || f.action?.includes(endpoint.toLowerCase()))
      );
      let runtimeAllows = null;
      if (runtimeFinding) {
        runtimeAllows = runtimeFinding.actual?.startsWith('HTTP 2') ||
                        (runtimeFinding.responseStatus >= 200 && runtimeFinding.responseStatus < 300);
      }

      const status = classifyStatus(reqIntent, codeAllows, runtimeAllows);

      // Parse resource and action from endpoint
      const epParts = endpoint.split(' ');
      const method = epParts[0] || 'UNKNOWN';
      const epPath = epParts[1] || endpoint;
      const pathParts = epPath.split('/').filter(Boolean);
      const resource = pathParts[0] || 'unknown';
      const action = method === 'GET' ? 'read' :
                     method === 'POST' ? 'create' :
                     method === 'PUT' || method === 'PATCH' ? 'update' :
                     method === 'DELETE' ? 'delete' : 'unknown';

      // Confidence: high nếu runtime xác nhận, medium nếu chỉ có code, low nếu chỉ có req
      const confidence = runtimeAllows !== null ? 'high' :
                         (codeAllows !== null ? 'medium' : 'low');

      entries.push({
        role,
        resource,
        action,
        endpoint,
        requirement: reqIntent,
        sourceCode: codeAllows ? 'allow' : 'deny',
        runtime: runtimeAllows === null ? null : (runtimeAllows ? 'allow' : 'deny'),
        status,
        confidence,
        evidence: {
          reqSection: matchedReqRule?.source || null,
          reqRuleId: matchedReqRule?.ruleId || null,
          sourceFile: codeGrant?.source || null,
          runtimeRef: runtimeFinding ? {
            type: runtimeFinding.type,
            responseStatus: runtimeFinding.responseStatus,
            screenshot: runtimeFinding.screenshot,
          } : null,
        },
      });
    }
  }

  return entries;
}

async function main() {
  if (!fs.existsSync(REPO_PATH)) {
    console.error(`[permission-matrix-extractor] ❌ Repo path không tồn tại: ${REPO_PATH}`);
    process.exit(1);
  }

  console.log(`[permission-matrix-extractor] Extracting permission matrix from: ${REPO_PATH}`);

  // ── Source 2: Source Code ──────────────────────────────────────────────────
  const { allRoles, grants, fileCount } = extractSourceCodeGrants(REPO_PATH);

  // ── Source 1: Requirement ──────────────────────────────────────────────────
  const reqRules = REQ_KNOWLEDGE ? extractRequirementPermissions(REQ_KNOWLEDGE) : [];
  if (REQ_KNOWLEDGE) {
    console.log(`[permission-matrix-extractor] Requirement source: ${REQ_KNOWLEDGE} (${reqRules.length} permission rules)`);
  } else {
    console.log(`[permission-matrix-extractor] ℹ️  No --req-knowledge provided; requirement column will be null`);
  }

  // ── Source 3: Runtime ──────────────────────────────────────────────────────
  const runtimeFindings = RUNTIME_FINDINGS ? loadRuntimeFindings(RUNTIME_FINDINGS) : [];
  if (RUNTIME_FINDINGS) {
    console.log(`[permission-matrix-extractor] Runtime source: ${RUNTIME_FINDINGS} (${runtimeFindings.length} findings)`);
  } else {
    console.log(`[permission-matrix-extractor] ℹ️  No --runtime-findings provided; runtime column will be null (first-pass)`);
  }

  // ── Build legacy matrix (backward compat) ─────────────────────────────────
  const matrix = {};
  for (const role of allRoles) {
    matrix[role] = grants
      .filter(g => g.roles.includes(role) || (role === 'AUTHENTICATED' && g.guard === 'authenticated'))
      .map(g => g.endpoint);
  }

  // ── Build enriched 3-source permission entries ─────────────────────────────
  const permissionEntries = buildPermissionEntries(allRoles, grants, reqRules, runtimeFindings);

  // ── Summarize conflicts ────────────────────────────────────────────────────
  const conflictSummary = {
    RUNTIME_BYPASS:    permissionEntries.filter(e => e.status === 'RUNTIME_BYPASS').length,
    RUNTIME_CONFLICT:  permissionEntries.filter(e => e.status === 'RUNTIME_CONFLICT').length,
    REQ_CODE_CONFLICT: permissionEntries.filter(e => e.status === 'REQ_CODE_CONFLICT').length,
    UNVERIFIED:        permissionEntries.filter(e => e.status === 'UNVERIFIED').length,
  };

  const output = {
    tool: 'permission-matrix-extractor.mjs',
    version: '2.0.0',
    repoPath: REPO_PATH,
    extractedAt: new Date().toISOString(),
    sources: {
      requirement: REQ_KNOWLEDGE || null,
      sourceCode: REPO_PATH,
      runtime: RUNTIME_FINDINGS || null,
    },
    roles: [...allRoles].sort(),
    totalGrants: grants.length,
    conflictSummary,
    // Enriched 3-source permission entries (primary output for dynamic-web-exploratory)
    permissionEntries,
    // Legacy matrix for backward compatibility (write-rbac-matrix.mjs reads this)
    matrix,
    rawGrants: grants,
  };

  if (OUTPUT_FILE) {
    fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf8');
    console.log(`[permission-matrix-extractor] ✅ Saved permission-matrix.json to: ${OUTPUT_FILE}`);
  } else {
    const compact = { ...output, permissionEntries: `(${permissionEntries.length} entries)`, rawGrants: `(${grants.length} grants)` };
    console.log(JSON.stringify(compact, null, 2));
  }

  console.log(`[permission-matrix-extractor] ${fileCount} files → ${[...allRoles].length} roles, ${grants.length} source grants`);
  console.log(`Conflicts: RUNTIME_BYPASS=${conflictSummary.RUNTIME_BYPASS} | RUNTIME_CONFLICT=${conflictSummary.RUNTIME_CONFLICT} | REQ_CODE_CONFLICT=${conflictSummary.REQ_CODE_CONFLICT}`);
  if (conflictSummary.RUNTIME_BYPASS > 0) {
    console.warn(`[permission-matrix-extractor] ⚠️  ${conflictSummary.RUNTIME_BYPASS} RUNTIME_BYPASS entries detected — run write-rbac-matrix.mjs for full report`);
  }
}

main().catch(err => {
  console.error('[permission-matrix-extractor] FATAL:', err.message);
  process.exit(1);
});
