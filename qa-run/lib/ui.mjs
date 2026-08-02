// UI/network primitives — generic, project-agnostic, dùng chung cho probe.
// Mục tiêu: probe CLEAN (không copy-paste) + ĐÚNG (verify bằng state/network thật, wait tất định).
//
//   import { recordNet, waitForText, clickText, withRevert } from '<skill>/lib/ui.mjs';

import { BASE } from './driver.mjs';
export { installNetworkTracker, waitForNetworkQuiet, waitForUiReady } from './wait.mjs';

/**
 * Bắt network cho assertion. Gọi TRƯỚC khi thao tác; trả về mảng tự lớn dần.
 *   const net = recordNet(page, /addon|subscription/i, { withBody:true });
 *   ... thao tác ...  // rồi assert net.find(c => c.status===200 && /updated_addons":\[\]/.test(c.body))
 */
export function recordNet(page, filterRe, { withBody = false } = {}) {
  const t0 = Date.now(); const calls = [];
  page.on('response', async r => {
    const u = r.url();
    if (!filterRe.test(u)) return;
    let body = '';
    if (withBody) { try { body = (await r.text()).slice(0, 200); } catch { /* binary/stream */ } }
    calls.push({ t: Date.now() - t0, method: r.request().method(), status: r.status(), url: u.replace(BASE, '').slice(0, 90), body });
  });
  return calls;
}

/** Chờ TẤT ĐỊNH tới khi text/regex xuất hiện trong body (thay cho sleep cứng). Trả false nếu timeout. */
export function waitForText(page, pat, ms = 15000) {
  const src = pat instanceof RegExp ? pat.source : String(pat).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const flags = pat instanceof RegExp ? pat.flags.replace('g', '') : 'i';
  return page.waitForFunction(({ s, f }) => new RegExp(s, f).test(document.body.innerText || ''),
    { s: src, f: flags }, { timeout: ms }).then(() => true).catch(() => false);
}

/**
 * Chờ tới khi GIÁ TRỊ readFn() ỔN ĐỊNH (tránh đọc sớm khi data đang load — vd stat card "0" rồi mới ra "13").
 * "Sẵn sàng" mặc định = không rỗng (loại null/undefined/-1/0/''/[]); rồi phải lặp `stable` lần liên tiếp.
 * Trả giá trị cuối (đã ổn định) hoặc giá trị gần nhất khi hết giờ.
 *   const total = await waitForStable(() => page.evaluate(readTotal));
 *   const rows  = await waitForStable(() => page.evaluate(readRows), { accept: v => v.length >= 1 });
 */
export async function waitForStable(readFn, { interval = 400, stable = 3, timeout = 12000, accept } = {}) {
  const ready = accept || (v => v !== null && v !== undefined && v !== -1 && v !== 0 && v !== ''
    && !(Array.isArray(v) && v.length === 0));
  let last, count = 0; const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const v = await readFn();
    if (ready(v) && JSON.stringify(v) === JSON.stringify(last)) { if (++count >= stable) return v; }
    else if (ready(v)) { last = v; count = 1; }
    await new Promise(r => setTimeout(r, interval));
  }
  return last;
}

/** Click bằng locator NATIVE (dispatch event thật — đáng tin hơn evaluate-click cho React/AntD). */
export async function clickText(page, text, { exact = false, timeout = 5000 } = {}) {
  const loc = page.getByText(text, { exact }).first();
  if (!(await loc.count())) return false;
  await loc.click({ timeout }).catch(() => {});
  return true;
}

/**
 * Test thao tác GHI một cách AN TOÀN: chạy mutate → trả kết quả → LUÔN revert (kể cả khi throw).
 * Dùng cho risk-based/regression đụng dữ liệu thật.
 *   const verdict = await withRevert(
 *     () => setQtyThenReadBack(2),     // mutate + đọc verdict
 *     () => setQty(0),                 // revert
 *   );
 */
export async function withRevert(mutate, revert) {
  try { return await mutate(); }
  finally { try { await revert(); } catch { /* best-effort */ } }
}
