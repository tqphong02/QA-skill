// Verdict helpers — token-frugal, dùng chung cho mọi probe.
// Mục tiêu: kết quả test trả ra ĐÚNG & TƯỜNG MINH (PASS/FAIL rõ ràng), clean code, không copy-paste log lặp.
//
//   import { check, eq, ge, section, summary } from '<skill>/lib/assert.mjs';
//   section('#430 filter');
//   eq('Total sau filter Pending', total, 6);
//   check('Combine AND <= single', combined <= single, `${combined} <= ${single}`);
//   const ok = summary('#430');   // in "N pass / M fail", trả true nếu all pass

let _pass = 0, _fail = 0; const _fails = [];

export function section(name) { console.log(`\n— ${name} —`); }

/** Ghi nhận 1 assertion. cond truthy = PASS. detail: chuỗi ngắn để debug khi fail. */
export function check(label, cond, detail = '') {
  const ok = !!cond;
  ok ? _pass++ : (_fail++, _fails.push(label));
  console.log(`${ok ? '✅ PASS' : '❌ FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
  return ok;
}

/** Bằng nhau (so sánh chặt). Tự in actual/expected khi fail. */
export function eq(label, actual, expected) {
  return check(label, actual === expected, `got ${JSON.stringify(actual)} exp ${JSON.stringify(expected)}`);
}

/** actual >= min (số). */
export function ge(label, actual, min) {
  return check(label, Number(actual) >= Number(min), `got ${actual} need >= ${min}`);
}

/** Có chứa (string/array). */
export function has(label, haystack, needle) {
  const ok = Array.isArray(haystack) ? haystack.includes(needle) : String(haystack).includes(needle);
  return check(label, ok, `"${needle}" in ${JSON.stringify(haystack).slice(0, 80)}`);
}

/** Tổng kết. Trả true nếu KHÔNG có fail. tag = mã ticket/nhóm. */
export function summary(tag = 'RESULT') {
  const verdict = _fail === 0 ? 'PASS' : 'FAIL';
  console.log(`\n=== ${tag}: ${verdict} (${_pass} pass / ${_fail} fail)${_fail ? ' -> ' + _fails.join(', ') : ''} ===`);
  return _fail === 0;
}

/** Reset bộ đếm (khi 1 script test nhiều ticket). */
export function reset() { _pass = 0; _fail = 0; _fails.length = 0; }
