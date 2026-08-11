#!/usr/bin/env node
/**
 * write-repo-business-guide.mjs — Business Guide Generator from Discovery Artifacts
 *
 * Đọc tất cả JSON artifacts trong qa-knowledge/repositories/<repo>/ và sinh:
 *   - business-guide.md (18 sections, tiếng Việt)
 *   - Append vào qa-knowledge/merged/system-business-guide.md nếu multi-repo
 *
 * AI (Antigravity/Claude) chỉ cần đọc Markdown này — không cần đọc JSON thô.
 * Token cost: Chỉ tốn khi AI đọc file guide, không tốn khi scan.
 *
 * Usage:
 *   node write-repo-business-guide.mjs --repo my-backend
 *   node write-repo-business-guide.mjs --repo-knowledge /path/to/qa-knowledge/repositories/my-backend
 *   node write-repo-business-guide.mjs --repo my-backend --output qa-knowledge/repositories/my-backend/business-guide.md
 */

import fs from 'node:fs';
import path from 'node:path';

const args    = process.argv.slice(2);
const getArg  = (flag, def) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : def; };

const REPO_NAME     = getArg('--repo', null);
const KNOW_DIR      = getArg('--repo-knowledge', null);
const OUTPUT_FILE   = getArg('--output', null);
const DATA_DIR      = process.env.QA_DATA_DIR || process.cwd();

function resolveKnowledgeDir() {
  if (KNOW_DIR) return KNOW_DIR;
  if (REPO_NAME) return path.join(DATA_DIR, 'qa-knowledge', 'repositories', REPO_NAME);
  console.error('[write-repo-business-guide] ❌ Cần --repo <name> hoặc --repo-knowledge <path>');
  process.exit(1);
}

function readJSON(dir, filename) {
  const fp = path.join(dir, filename);
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch { return null; }
}

function formatList(items, fn) {
  if (!items || items.length === 0) return '_Chưa phát hiện_\n';
  return items.map(fn).join('\n') + '\n';
}

function formatApiTable(endpoints) {
  if (!endpoints || endpoints.length === 0) return '_Chưa phát hiện API endpoint_\n';
  const rows = endpoints.slice(0, 50).map(e =>
    `| \`${e.method}\` | \`${e.path}\` | ${e.module || '-'} | ${e.auth_required ? '🔒' : '🔓'} | ${e.roles?.join(', ') || 'PUBLIC'} |`
  );
  return [
    '| Method | Path | Module | Auth | Roles |',
    '|:---|:---|:---|:---:|:---|',
    ...rows,
    endpoints.length > 50 ? `\n_...và ${endpoints.length - 50} endpoint khác_` : '',
  ].join('\n') + '\n';
}

function formatRulesTable(rules) {
  if (!rules || rules.length === 0) return '_Chưa phát hiện business rule_\n';
  const rows = rules.slice(0, 40).map(r =>
    `| \`${r.ruleId}\` | ${r.category} | ${r.condition.slice(0, 80)} | ${r.failureResult} | ${r.confidence} |`
  );
  return [
    '| Rule ID | Category | Condition | Failure Result | Confidence |',
    '|:---|:---|:---|:---|:---:|',
    ...rows,
    rules.length > 40 ? `\n_...và ${rules.length - 40} rule khác_` : '',
  ].join('\n') + '\n';
}

function formatStateMachines(machines) {
  if (!machines || machines.length === 0) return '_Chưa phát hiện state machine_\n';
  return machines.map(m => {
    const states = m.states.join(' → ');
    const transitions = m.transitions.map(t => `- \`${t.from}\` → \`${t.to}\``).join('\n');
    return `**${m.entity}**\n\nStates: \`${states}\`\n\n${transitions || '_(transitions chưa rõ)_'}`;
  }).join('\n\n---\n\n') + '\n';
}

function formatModules(modules) {
  if (!modules || modules.length === 0) return '_Chưa phát hiện module_\n';
  return modules.map(m => {
    const parts = [];
    if (m.controllers?.length) parts.push(`${m.controllers.length} controller`);
    if (m.services?.length)    parts.push(`${m.services.length} service`);
    if (m.repositories?.length) parts.push(`${m.repositories.length} repository`);
    if (m.entities?.length)    parts.push(`${m.entities.length} entity`);
    if (m.integrations?.length) parts.push(`integration: ${m.integrations.join(', ')}`);
    return `- **${m.name}** — ${parts.join(', ') || 'unknown'}`;
  }).join('\n') + '\n';
}

async function main() {
  const knowledgeDir = resolveKnowledgeDir();

  if (!fs.existsSync(knowledgeDir)) {
    console.error(`[write-repo-business-guide] ❌ Knowledge dir không tồn tại: ${knowledgeDir}`);
    console.error('  Hãy chạy repo-business-discovery.mjs --mode phase1 trước');
    process.exit(1);
  }

  const meta    = readJSON(knowledgeDir, 'repo-metadata.json');
  const arch    = readJSON(knowledgeDir, 'architecture-map.json');
  const api     = readJSON(knowledgeDir, 'api-contracts.json');
  const rules   = readJSON(knowledgeDir, 'business-rules.json');
  const flows   = readJSON(knowledgeDir, 'business-flows.json');
  const states  = readJSON(knowledgeDir, 'state-machines.json');
  const perms   = readJSON(knowledgeDir, 'permission-matrix.json');
  const domain  = readJSON(knowledgeDir, 'domain-model.json');
  const session = readJSON(knowledgeDir, 'discovery-session.json');

  const repoName = meta?.repoName || REPO_NAME || path.basename(knowledgeDir);
  const now = new Date().toISOString();

  const guide = `# Business Guide: ${repoName}

> **Được sinh tự động bởi REPO_BUSINESS_DISCOVERY** — Chỉ AI đọc file này, không cần đọc JSON thô  
> Sinh lúc: ${now}  
> Commit: \`${meta?.commit || 'unknown'}\` | Branch: \`${meta?.branch || 'unknown'}\`  
> Nguồn: \`${knowledgeDir}\`

---

## 1. Tổng quan Hệ thống

| Thuộc tính | Giá trị |
|:---|:---|
| Tên repo | ${repoName} |
| Loại | ${meta?.repoType || 'unknown'} |
| Framework | ${meta?.frameworks?.join(', ') || 'unknown'} |
| Ngôn ngữ | ${meta?.language || 'unknown'} |
| Số files source | ${meta?.sourceFilesCount || '?'} |
| Có TypeScript | ${meta?.hasTypeScript ? 'Có' : 'Không'} |
| Có Dockerfile | ${meta?.hasDockerfile ? 'Có' : 'Không'} |
| Có CI/CD | ${meta?.hasCIConfig ? 'Có' : 'Không'} |
| Có OpenAPI Spec | ${meta?.hasOpenAPISpec ? 'Có' : 'Không'} |
| Modules phát hiện | ${meta?.modules?.map(m => m.name).join(', ') || 'none'} |
| Intergrations | ${arch?.globalIntegrations?.join(', ') || 'none'} |

${meta?.description ? `**Mô tả package.json:** ${meta.description}\n` : ''}

---

## 2. Kiến trúc Modules

${formatModules(arch?.modules)}

---

## 3. API Contracts (${api?.totalEndpoints || 0} endpoints)

${formatApiTable(api?.endpoints)}

---

## 4. Business Rules (${rules?.totalRules || 0} rules)

${formatRulesTable(rules?.rules)}

---

## 5. State Machines

${formatStateMachines(states?.stateMachines)}

---

## 6. Business Flows (${flows?.totalFlows || 0} flows)

${flows?.flows?.slice(0, 20).map(f => `### ${f.name}
- **Module:** ${f.module}
- **Actor:** ${f.actor}
- **Trigger:** \`${f.trigger}\`
- **Preconditions:** ${f.preconditions?.join(', ') || 'none'}
- **Side effects:** ${f.sideEffects?.join(', ') || 'none'}
- **Confidence:** ${f.confidence}
`).join('\n') || '_Chưa phát hiện flow_'}

---

## 7. Permission Matrix

**Roles phát hiện:** ${perms?.roles?.join(', ') || 'none'}

${perms?.roles?.map(role => `**${role}** (${perms.matrix?.[role]?.length || 0} endpoints):  
${perms.matrix?.[role]?.slice(0, 10).map(e => `- \`${e}\``).join('\n') || '_không có_'}
`).join('\n') || '_Chưa phát hiện permission grant_'}

---

## 8. Domain Model (${domain?.totalEntities || 0} entities)

${domain?.entities?.slice(0, 20).map(e => `**${e.name}** (${e.orm})
${e.columns?.filter(c => c.name !== 'relation').slice(0, 8).map(c => `- \`${c.type}\` ${c.name}${c.isPrimary ? ' **(PK)**' : ''}`).join('\n') || '_no columns_'}
`).join('\n') || '_Chưa phát hiện entity_'}

${domain?.mermaidERD ? `\`\`\`mermaid\n${domain.mermaidERD}\n\`\`\`` : ''}

---

## 9. Tích hợp Bên ngoài

${arch?.globalIntegrations?.map(i => `- **${i}**`).join('\n') || '_Không phát hiện_'}

---

## 10. Điểm Quan trọng cho QA

### Business Rules cần test kỹ
${rules?.rules?.filter(r => ['permission', 'financial', 'state_transition'].includes(r.category))
  .slice(0, 10)
  .map(r => `- [${r.ruleId}] **${r.category}**: ${r.condition.slice(0, 100)} → ${r.failureResult}`)
  .join('\n') || '_Chưa phát hiện_'}

### State transitions cần test boundary
${states?.stateMachines?.map(m => `- **${m.entity}**: Kiểm tra không thể nhảy state bất hợp lệ, rollback khi lỗi`).join('\n') || '_Chưa phát hiện_'}

### API cần test auth/permission
${api?.endpoints?.filter(e => e.auth_required).slice(0, 10).map(e => `- \`${e.method} ${e.path}\` — yêu cầu roles: ${e.roles?.join(', ') || 'authenticated'}`).join('\n') || '_Chưa phát hiện_'}

---

## 11. Knowledge Gaps & Assumptions

> [!NOTE]
> Các mục dưới đây là **suy luận từ code** (confidence: inferred) — cần con người xác nhận

${rules?.rules?.filter(r => r.confidence === 'inferred').slice(0, 5).map(r => `- ${r.condition.slice(0, 100)}`).join('\n') || '_Không có gaps đáng kể_'}

---

## 12. Discovery Session

| | |
|:---|:---|
| Chạy lúc | ${session?.completedAt || now} |
| Thời gian | ${session?.durationSeconds || '?'}s |
| Mode | ${session?.mode || 'phase1'} |
| Commit | ${session?.commit || 'unknown'} |
| Output dir | \`${session?.outputDir || knowledgeDir}\` |

---

_Cập nhật lại bằng cách chạy: \`node dynamic-testing/web-exploratory/scripts/repo-business-discovery.mjs --repo <path> --mode incremental\`_
`;

  const outputPath = OUTPUT_FILE || path.join(knowledgeDir, 'business-guide.md');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, guide, 'utf8');
  console.log(`[write-repo-business-guide] ✅ Saved: ${outputPath} (${(guide.length / 1024).toFixed(1)}KB)`);

  // Merge into system-business-guide.md
  const mergedDir = path.join(DATA_DIR, 'qa-knowledge', 'merged');
  fs.mkdirSync(mergedDir, { recursive: true });
  const systemGuidePath = path.join(mergedDir, 'system-business-guide.md');

  let systemGuide = fs.existsSync(systemGuidePath)
    ? fs.readFileSync(systemGuidePath, 'utf8')
    : `# System Business Guide\n\n_Tổng hợp từ tất cả repositories — Được sinh tự động_\n\n`;

  // Replace or append section for this repo
  const sectionHeader = `## Repository: ${repoName}`;
  const nextSection = '## Repository:';
  const sectionStart = systemGuide.indexOf(sectionHeader);

  if (sectionStart !== -1) {
    const nextStart = systemGuide.indexOf(nextSection, sectionStart + sectionHeader.length);
    const replacement = `${sectionHeader}\n\n_Cập nhật: ${now}_\n\n[Xem chi tiết](${outputPath})\n\n`;
    if (nextStart !== -1) {
      systemGuide = systemGuide.slice(0, sectionStart) + replacement + systemGuide.slice(nextStart);
    } else {
      systemGuide = systemGuide.slice(0, sectionStart) + replacement;
    }
  } else {
    systemGuide += `\n---\n\n${sectionHeader}\n\n_Cập nhật: ${now}_\n\n[Xem chi tiết](${outputPath})\n\n**Framework:** ${meta?.frameworks?.join(', ') || 'unknown'} | **Type:** ${meta?.repoType || 'unknown'} | **APIs:** ${api?.totalEndpoints || 0} | **Rules:** ${rules?.totalRules || 0}\n`;
  }

  fs.writeFileSync(systemGuidePath, systemGuide, 'utf8');
  console.log(`[write-repo-business-guide] ✅ Merged into: ${systemGuidePath}`);
}

main().catch(err => {
  console.error('[write-repo-business-guide] FATAL:', err.message);
  process.exit(1);
});
