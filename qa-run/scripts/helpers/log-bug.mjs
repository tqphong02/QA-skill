// log-bug.mjs — Log bug lên Plane với ảnh PREVIEW INLINE trong description
// (KHÔNG upload file đính kèm kiểu cũ — user phải tải về mới xem được).
//
// CÁCH DÙNG:
//   1. Copy file này vào thư mục dự án:  cp <skill>/scripts/log-bug.mjs <project>/qa/log-bug.mjs
//   2. Trong .env của project, thêm:
//        PLANE_API_KEY=plane_pat_xxx
//        PLANE_BASE_URL=https://projects.metasolutions.ai/api/v1
//        PLANE_WORKSPACE=mds-team
//        PLANE_PROJECT_ID=<uuid>
//        PLANE_STATE_TODO=<uuid>            # cho bug MỚI
//        PLANE_STATE_IN_PROGRESS=<uuid>     # cho retest FAIL (lùi về In Progress)
//        PLANE_STATE_DONE=<uuid>            # cho retest PASS
//        PLANE_ASSIGN_HUNG=<uuid>           # optional
//        PLANE_ASSIGN_PHONG=<uuid>          # optional
//   3. Chạy theo 3 mode:
//
//   (a) TẠO BUG MỚI (state Todo) — workflow exploratory phát hiện bug ngoài scope:
//        node log-bug.mjs --title "[W26][Filter] Status Pending không hoạt động" \
//          --steps "1. Mở /events|2. Chọn Status=Pending" \
//          --expected "Total = 6" \
//          --actual "Total = 0|Không có row nào hiển thị" \
//          --screenshots "evidence/probe-430.png" \
//          --assign hungtn,phongtq --state Todo
//
//   (b) RETEST FAIL — chuyển ticket ĐANG retest về In Progress + comment lý do:
//        node log-bug.mjs --mode retest-fail --issue-id <uuid> \
//          --reason "Filter Status=Pending trả 0 thay vì 6, AC #1 fail" \
//          --screenshots "evidence/probe-430-after.png" \
//          --assign hungtn,phongtq
//        → script PATCH state=In Progress + POST comment_html (có ảnh inline).
//
//   (c) RETEST PASS — chuyển sang Done:
//        node log-bug.mjs --mode retest-pass --issue-id <uuid> \
//          --note "PASS, AC #1-3 đều đúng"
//
//   AI (Claude) sẽ tự build command đúng mode khi user nói "log bug mới" / "retest fail #X" / "retest pass #X".
//
// KẾT QUẢ: in ra URL ticket + sequence ID. Mở ticket sẽ thấy ảnh preview ngay
// trong description / comment (KHÔNG cần tải file về).
//
// DEP: zero external deps — chỉ dùng fetch của Node ≥ 18.

import fs from 'fs';
import path from 'path';

let env = {};
try { env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter(Boolean).map(l => l.split('=').map(s => s.trim()))); }
catch { /* optional */ }
const ENV = (k, d) => process.env[k] || env[k] || d;

const API_KEY  = ENV('PLANE_API_KEY');
const BASE     = ENV('PLANE_BASE_URL');
const WORKSPACE= ENV('PLANE_WORKSPACE');
const PROJECT  = ENV('PLANE_PROJECT_ID');

if (!API_KEY || !BASE || !WORKSPACE || !PROJECT) {
  console.error('❌ Thiếu config. Cần trong .env: PLANE_API_KEY, PLANE_BASE_URL, PLANE_WORKSPACE, PLANE_PROJECT_ID');
  process.exit(1);
}

// Parse args
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, cur) => {
  if (cur.startsWith('--')) { const [k, ...rest] = cur.slice(2).split('='); acc.push([k, rest.join('=')]); }
  return acc;
}, []));

function req(k, required=false) {
  const v = args[k];
  if (required && !v) { console.error(`❌ Thiếu --${k}`); process.exit(1); }
  return v;
}

// Mode: 'create' (default — tạo bug MỚI), 'retest-fail' (patch về In Progress + comment), 'retest-pass' (patch sang Done + comment)
const MODE       = req('mode') || 'create';
const ISSUE_ID   = req('issue-id');           // cần cho retest-fail / retest-pass
const TITLE      = req('title');             // cần cho create
const STEPS      = (req('steps') || '').split('|').map(s => s.trim()).filter(Boolean);
const EXPECTED   = req('expected');
const ACTUAL     = (req('actual') || '').split('|').map(s => s.trim()).filter(Boolean);
const SHOTS      = (req('screenshots') || '').split(',').map(s => s.trim()).filter(Boolean);
const ASSIGN_LIST= (req('assign') || '').split(',').map(s => s.trim()).filter(Boolean);
const STATE_NAME = req('state') || (MODE === 'create' ? 'Todo' : MODE === 'retest-fail' ? 'In Progress' : 'Done');
const PRIORITY   = req('priority') || 'high';
const MODULE     = req('module') || '';
const SEVERITY   = req('severity') || '';
const REASON     = req('reason') || '';      // cho retest-fail: lý do fail
const NOTE       = req('note') || '';        // cho retest-pass: ghi chú PASS

// Validate mode
if (MODE === 'create' && !TITLE) { console.error('❌ Mode "create" cần --title'); process.exit(1); }
if (MODE !== 'create' && !ISSUE_ID) { console.error(`❌ Mode "${MODE}" cần --issue-id <uuid>`); process.exit(1); }

async function plane(method, url, body) {
  const r = await fetch(BASE + url, {
    method,
    headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) { console.error(`❌ ${method} ${url} → ${r.status}\n${text.slice(0, 400)}`); process.exit(1); }
  return JSON.parse(text);
}

async function uploadImagesAndGetUrls(issueId, shots) {
  const imgUrls = [];
  for (const shot of shots) {
    if (!fs.existsSync(shot)) { console.warn(`  ⚠️ Không thấy file: ${shot}, skip`); continue; }
    const buf     = fs.readFileSync(shot);
    const size    = buf.length;
    const name    = path.basename(shot);
    const type    = shot.endsWith('.png') ? 'image/png' : shot.endsWith('.jpg') || shot.endsWith('.jpeg') ? 'image/jpeg' : 'application/octet-stream';
    if (size > 5 * 1024 * 1024) { console.warn(`  ⚠️ ${shot} > 5MB, skip (nén trước)`); continue; }

    console.log(`→ Upload ${name} (${(size/1024).toFixed(1)}KB)…`);
    // Init attachment → S3 presigned
    const init = await plane('POST', `/workspaces/${WORKSPACE}/projects/${PROJECT}/issues/${issueId}/issue-attachments/`, { name, type, size });
    const { upload_data, asset_id } = init;
    // Upload file to S3
    const fd = new FormData();
    for (const [k, v] of Object.entries(upload_data.fields || {})) fd.append(k, v);
    fd.append('file', new Blob([buf], { type }), name);
    const upR = await fetch(upload_data.url, { method: 'POST', body: fd });
    if (!upR.ok) { console.error(`❌ S3 upload fail: ${upR.status}`); process.exit(1); }
    // Mark uploaded → get URL
    const final = await plane('PATCH', `/workspaces/${WORKSPACE}/projects/${PROJECT}/issues/${issueId}/issue-attachments/${asset_id}/`, { is_uploaded: true });
    const url = final.asset_url || final.url || upload_data.url;
    imgUrls.push({ name, url });
    console.log(`  ✓ ${name} → ${url.slice(0, 80)}…`);
  }
  return imgUrls;
}

const imgTag = (u) => `<img src="${u.url}" alt="${u.name}" style="max-width:100%;border:1px solid #ddd;border-radius:6px;margin:8px 0;display:block">`;
const resolveAssigns = () => {
  const out = [];
  for (const a of ASSIGN_LIST) {
    const id = ENV('PLANE_ASSIGN_' + a.toUpperCase());
    if (id) out.push(id);
    else console.warn(`  ⚠️ Không tìm thấy PLANE_ASSIGN_${a.toUpperCase()} trong .env`);
  }
  return out;
};
const resolveStateId = (name) => ENV('PLANE_STATE_' + name.toUpperCase().replace(/\s+/g, '_'));

// ===================== MAIN =====================
let issueId, seqId, targetUrl;

if (MODE === 'create') {
  // ---- TẠO BUG MỚI ----
  console.log('→ Tạo ticket mới (state Todo)…');
  const desc = [
    MODULE && `<strong>Module:</strong> ${MODULE}`,
    SEVERITY && `<strong>Severity:</strong> ${SEVERITY}`,
    '<strong>Steps</strong>',
    ...STEPS.map((s, i) => `${i+1}. ${s}`),
    '<strong>Expected</strong>',
    EXPECTED,
    '<strong>Actual</strong>',
    ...ACTUAL.map(s => `- ${s}`),
    '<strong>Evidence</strong>',
    '_(đang upload ảnh…)_',
  ].filter(Boolean).join('\n');

  const created = await plane('POST', `/workspaces/${WORKSPACE}/projects/${PROJECT}/work-items/`, {
    name: TITLE,
    description_html: desc,
    priority: PRIORITY,
  });
  issueId = created.id;
  seqId   = created.sequence_id;
  console.log(`  ✓ Tạo #${seqId} (uuid=${issueId})`);

  // Upload ảnh + patch description với <img>
  if (SHOTS.length) {
    const imgUrls = await uploadImagesAndGetUrls(issueId, SHOTS);
    if (imgUrls.length) {
      const imgHtml = imgUrls.map(imgTag).join('\n');
      const finalDesc = desc.replace('_(đang upload ảnh…)_', imgHtml);
      await plane('PATCH', `/workspaces/${WORKSPACE}/projects/${PROJECT}/work-items/${issueId}/`, { description_html: finalDesc });
      console.log(`→ Patched ${imgUrls.length} ảnh inline vào description`);
    }
  }

} else if (MODE === 'retest-fail') {
  // ---- RETEST FAIL → PATCH state=In Progress + comment có ảnh ----
  console.log(`→ Retest FAIL trên ticket uuid=${ISSUE_ID}, chuyển về In Progress…`);
  issueId = ISSUE_ID;

  // Upload ảnh trước (nếu có)
  const imgUrls = SHOTS.length ? await uploadImagesAndGetUrls(issueId, SHOTS) : [];

  // Comment với format chuẩn
  const commentHtml = [
    `<strong>Retest Result:</strong> FAIL`,
    REASON && `<strong>Reason:</strong> ${REASON}`,
    '<strong>Steps retested</strong>',
    ...STEPS.map((s, i) => `${i+1}. ${s}`),
    EXPECTED && `<strong>Expected:</strong> ${EXPECTED}`,
    ACTUAL.length && `<strong>Actual:</strong>`,
    ...ACTUAL.map(s => `- ${s}`),
    imgUrls.length && '<strong>Evidence:</strong>',
    ...imgUrls.map(imgTag),
  ].filter(Boolean).join('\n');

  if (commentHtml) {
    await plane('POST', `/workspaces/${WORKSPACE}/projects/${PROJECT}/issues/${issueId}/comments/`, { comment_html: commentHtml });
    console.log(`  ✓ Comment fail đã post`);
  }

} else if (MODE === 'retest-pass') {
  // ---- RETEST PASS → PATCH state=Done + comment ngắn ----
  console.log(`→ Retest PASS trên ticket uuid=${ISSUE_ID}, chuyển sang Done…`);
  issueId = ISSUE_ID;

  const commentHtml = [
    `<strong>Retest Result:</strong> PASS`,
    NOTE && `<strong>Note:</strong> ${NOTE}`,
  ].filter(Boolean).join('\n');

  if (commentHtml) {
    await plane('POST', `/workspaces/${WORKSPACE}/projects/${PROJECT}/issues/${issueId}/comments/`, { comment_html: commentHtml });
    console.log(`  ✓ Comment pass đã post`);
  }

} else {
  console.error(`❌ Mode không hợp lệ: ${MODE}. Dùng: create | retest-fail | retest-pass`);
  process.exit(1);
}

// ---- PATCH state + assignees (chung cho mọi mode) ----
const assigns  = resolveAssigns();
const stateId  = resolveStateId(STATE_NAME);
const patch    = {};
if (assigns.length) patch.assignees = assigns;
if (stateId)       patch.state     = stateId;

if (Object.keys(patch).length) {
  await plane('PATCH', `/workspaces/${WORKSPACE}/projects/${PROJECT}/work-items/${issueId}/`, patch);
  console.log(`→ Assigned=${ASSIGN_LIST.join(',') || '(giữ nguyên)'} state=${STATE_NAME}`);
} else {
  console.warn(`  ⚠️ Không tìm thấy PLANE_STATE_${STATE_NAME.toUpperCase().replace(/\s+/g, '_')} trong .env → state giữ nguyên`);
}

// ---- Done ----
if (!seqId) {
  // Lấy sequence_id từ work-item vừa patch (cho retest mode)
  try {
    const wi = await plane('GET', `/workspaces/${WORKSPACE}/projects/${PROJECT}/work-items/${issueId}/`);
    seqId = wi.sequence_id;
  } catch { /* không cần thiết */ }
}

console.log(`\n✅ Done: #${seqId || '?'}`);
const webBase = BASE.replace('/api/v1', '');
console.log(`   ${webBase}/${WORKSPACE}/projects/${PROJECT}/issues/${seqId || issueId}/`);