// Traceable test-data generator.
// Format: [prefix]_[testName]_[timestamp]_[random]
//   prefix   = viết tắt feature/module (vd: ing, wf, qlt, dash, api)
//   testName = tên probe (vd: createUser, loginValid, searchBounded)
//   timestamp = YYYYMMDDHHMMSS (giờ local)
//   random   = 4 ký tự [A-Z0-9] (chống collision khi chạy cùng giây)
//
// Dùng trong Node script:
//   import { tdata, emailOf, nameOf } from '../lib/tdata.mjs';
//   const e = emailOf('ing', 'createUser');  // ing_createUser_20260702_141522_A3F2@test.local
//   const n = nameOf('wf', 'newProduct');    // Product wf_newProduct_20260702_141522_B9K1
//
// Trace phải được ghi vào FINDINGS / ticket Plane để dev biết probe nào tạo:
//   Trace: tdata('ing','createCustomer') → ing_createCustomer_20260702_141522_A3F2

import { randomBytes } from 'node:crypto';

/** Sinh timestamp 14 số YYYYMMDDHHMMSS theo giờ local. */
export function nowStamp(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

/** Sinh random 4 ký tự [A-Z0-9] (chống collision khi parallel). */
export function rand4() {
  return randomBytes(2).toString('hex').toUpperCase();
}

/** Sinh trace token theo format chuẩn. KHÔNG chứa ký tự đặc biệt (an toàn cho email/DB). */
export function tdata(prefix, testName) {
  if (!prefix || !testName) {
    throw new Error('tdata(prefix, testName): cả 2 đều bắt buộc');
  }
  // Lowercase prefix + testName để khớp convention log grep
  const p = String(prefix).toLowerCase().replace(/[^a-z0-9]/g, '');
  const t = String(testName).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!p || !t) throw new Error('tdata: prefix/testName phải chứa chữ cái hoặc số');
  return `${p}_${t}_${nowStamp()}_${rand4()}`;
}

/** Email test từ token (default domain .test.local — RFC 6761 reserved, không bao giờ route). */
export function emailOf(prefix, testName, domain = 'test.local') {
  return `${tdata(prefix, testName)}@${domain}`;
}

/** Tên hiển thị (có prefix "Product"/"User"/...). */
export function nameOf(prefix, testName, kind = 'Product') {
  return `${kind} ${tdata(prefix, testName)}`;
}

/** Parse token ngược để debug. Trả về null nếu không đúng format. */
export function parseTdata(token) {
  const m = String(token).match(/^([a-z0-9]+)_([a-z0-9]+)_(\d{14})_([A-Z0-9]{4})$/);
  if (!m) return null;
  const [, prefix, testName, ts, rand] = m;
  // Convert YYYYMMDDHHMMSS → Date
  const y = +ts.slice(0, 4), mo = +ts.slice(4, 6) - 1, d = +ts.slice(6, 8);
  const h = +ts.slice(8, 10), mi = +ts.slice(10, 12), s = +ts.slice(12, 14);
  return { prefix, testName, createdAt: new Date(y, mo, d, h, mi, s), rand };
}
