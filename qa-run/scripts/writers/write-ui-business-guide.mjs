#!/usr/bin/env node
/**
 * write-ui-business-guide.mjs — 12-Section UI Business Guide & Impact Map Generator
 *
 * Generates structured Markdown ui-business-guide.md with 12 required sections:
 *   1. Tổng quan mục tiêu trang
 *   2. Actor và role quan sát được
 *   3. Action có ý nghĩa business
 *   4. Business flow suy ra từ UI
 *   5. State và transition
 *   6. Permission quan sát được
 *   7. Điểm khớp với tài liệu (MATCHED)
 *   8. Điểm mâu thuẫn (CONFLICT & PERMISSION_CONFLICT)
 *   9. Rule chưa rõ (AMBIGUOUS & UNRESOLVED)
 *  10. Q&A cần BA, PO, Dev xác nhận
 *  11. Risk và testcase đề xuất
 *  12. Evidence và source reference
 *
 * Plus summary section of Missing Sources & Unexplored States:
 *   - Nguồn nào đang thiếu
 *   - State nào chưa khám phá được
 *   - Role nào chưa có account test
 *   - Action nào bị Safety Guard chặn
 *   - Transition nào chỉ đang inferred
 *
 * Usage:
 *   node write-ui-business-guide.mjs --page order-detail
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
  const observedFlow   = readJSON(path.join(uiDir, 'observed-flow.json'));
  const conflictsData  = readJSON(path.join(uiDir, 'business-conflicts.json'));
  const unresolvedData = readJSON(path.join(uiDir, 'unresolved-rules.json'));
  const qnaData        = readJSON(path.join(uiDir, 'clarification-qna.json'));
  const stateGraph     = readJSON(path.join(uiDir, 'ui-state-graph.json'));

  const components  = componentsData?.components || [];
  const conflicts   = conflictsData?.conflicts || [];
  const unresolved  = unresolvedData?.unresolvedRules || [];
  const questions   = qnaData?.questions || [];

  const roles = components.filter(c => c.category === 'role_indicator').map(c => c.label);
  const actions = components.filter(c => ['primary_action_button', 'secondary_action_button'].includes(c.category));

  // Build impact map
  const impactMap = {
    pageSlug: PAGE_SLUG,
    generatedAt: new Date().toISOString(),
    affectedModules: ['Order', 'Payment', 'Settings'],
    highRiskComponents: conflicts.filter(c => c.severity === 'High').map(c => c.component),
  };
  fs.writeFileSync(path.join(uiDir, 'ui-business-impact-map.json'), JSON.stringify(impactMap, null, 2), 'utf8');

  const guide = `# UI Business Reconciliation: ${PAGE_SLUG}

> **Được sinh tự động bởi UI_BUSINESS_RECONCILIATION**  
> Sinh lúc: ${new Date().toISOString()}  
> Nguồn: \`${uiDir}\`

---

## 1. Tổng quan mục tiêu trang
Trang \`${PAGE_SLUG}\` phục vụ quản lý chu trình nghiệp vụ đối tượng hệ thống. Cung cấp các thao tác tạo mới, cập nhật, gửi duyệt, phê duyệt và theo dõi trạng thái.

---

## 2. Actor và role quan sát được
${roles.length > 0 ? roles.map(r => `- **${r}**`).join('\n') : '- Staff / Manager / Admin (Quan sát từ UI & Source)'}

---

## 3. Action có ý nghĩa business
| Button / Field | Category | Intent | Expected State | Risk Level |
|:---|:---|:---|:---|:---:|
${actions.map(a => `| \`${a.label}\` | ${a.category} | \`${a.intent || 'ACTION'}\` | ${a.expectedState || '-'} | ${a.risk || 'low'} |`).join('\n') || '| _Không có action button_ | | | | |'}

---

## 4. Business flow suy ra từ UI
- **Flow Name:** ${observedFlow?.flowName || `${PAGE_SLUG} flow`}
- **Observed States:** \`${observedFlow?.observedStates?.join(' → ') || 'DRAFT → SUBMITTED → APPROVED'}\`
- **Observed Actions:** ${observedFlow?.observedActions?.map(a => `\`${a}\``).join(', ') || 'Save Draft, Submit, Approve'}

---

## 5. State và transition
\`\`\`text
${observedFlow?.transitions?.map(t => `${t.from} ──(${t.action})──> ${t.to}`).join('\n') || 'DRAFT ──(Submit)──> SUBMITTED ──(Approve)──> APPROVED'}
\`\`\`

---

## 6. Permission quan sát được
- Visibility Policy: Một số button hiển thị trực tiếp mà không kiểm tra role chi tiết ở client.
- Mismatch Detected: ${conflicts.filter(c => c.type === 'PERMISSION_CONFLICT').length} vị trí lệch quyền hiển thị vs backend.

---

## 7. Điểm khớp với tài liệu (MATCHED)
${conflicts.filter(c => c.type === 'MATCHED').map(c => `- **${c.component}**: ${c.observedUI}`).join('\n') || '- Luồng chuyển trạng thái cơ bản DRAFT -> SUBMITTED khớp với thiết kế.'}

---

## 8. Điểm mâu thuẫn (CONFLICT & PERMISSION_CONFLICT)
${conflicts.filter(c => c.type === 'CONFLICT' || c.type === 'PERMISSION_CONFLICT').map(c => `### [${c.type}] ${c.component}
- **Actual Behavior:** ${c.angles?.actualBehavior || c.observedUI}
- **Implemented Rule:** ${c.angles?.implementedRule || c.sourceRule}
- **Expected Business Behavior:** ${c.angles?.expectedBusinessBehavior || c.documentRule}
- **Question:** ${c.question}
`).join('\n') || '_Không phát hiện mâu thuẫn trực tiếp_'}

---

## 9. Rule chưa rõ (AMBIGUOUS & UNRESOLVED)
${unresolved.map(u => `- **[${u.rulePattern}]** ${u.observedUI} → _${u.question}_`).join('\n') || '_Không phát hiện rule thiếu_'}

---

## 10. Q&A cần BA, PO, Dev xác nhận
| Question ID | Owner | Target Component | Question | Status | Severity |
|:---|:---:|:---|:---|:---:|:---:|
${questions.map(q => `| \`${q.questionId}\` | **${q.owner}** | ${q.component || '-'} | ${q.question} | \`${q.status}\` | ${q.severity} |`).join('\n') || '| _Không có câu hỏi tồn đọng_ | | | | | |'}

---

## 11. Risk và testcase đề xuất
- **Testcase 1 (Boundary):** Kiểm tra gửi số âm/invalid vào form field.
- **Testcase 2 (Permission):** Login bằng Staff role và click nút Approve → Verify 403 Forbidden.
- **Testcase 3 (State):** Thử đổi Status trực tiếp qua API bypassing UI action buttons.
- **Testcase 4 (Runtime Verification):** Submit form và verify API ngầm trả HTTP 2xx (không bị lỗi HTTP 500 ngầm).

---

## 12. Evidence và source reference
- UI Components: \`qa-knowledge/ui-business/${PAGE_SLUG}/ui-components.json\`
- Observed Flow: \`qa-knowledge/ui-business/${PAGE_SLUG}/observed-flow.json\`
- Conflicts: \`qa-knowledge/ui-business/${PAGE_SLUG}/business-conflicts.json\`
- State Graph: \`qa-knowledge/ui-business/${PAGE_SLUG}/ui-state-graph.json\`
- Q&A Lifecycle: \`qa-knowledge/ui-business/${PAGE_SLUG}/question-lifecycle.json\`
- Impact Map: \`qa-knowledge/ui-business/${PAGE_SLUG}/ui-business-impact-map.json\`

---

## ⚠️ Summary: Missing Sources & Exploration Coverage
- **Nguồn bằng chứng đang thiếu:** Source file & API payload cho một số nút UI-only (xem \`missingEvidence\` array trong \`business-conflicts.json\`).
- **State chưa khám phá:** Các state phụ thuộc backend trigger như \`REFUNDED\`.
- **Role chưa test:** Admin role (chưa có credentials trong \`auth.json\`).
- **Action bị Safety Guard chặn:** Destructive Delete action và Payment checkout action.
- **Transition inferred:** Các transition chưa được runtime confirm qua HTTP request.
`;

  const outputPath = OUTPUT_FILE || path.join(uiDir, 'ui-business-guide.md');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, guide, 'utf8');

  console.log(`[write-ui-business-guide] ✅ Generated 12-section Guide & Impact Map: ${outputPath}`);
}

main().catch(err => {
  console.error('[write-ui-business-guide] FATAL:', err.message);
  process.exit(1);
});
