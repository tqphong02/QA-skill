// Probe danh sách endpoint GET tìm 4xx/5xx (dùng cookie phiên). Project-agnostic.
// Nguồn endpoint (1 path / dòng): file <project>/endpoints.txt, hoặc env QA_ENDPOINTS (csv).
// Dùng: node <skill>/scripts/api-health.mjs
import { browser, BASE, DATA } from '../../lib/driver.mjs';
import fs from 'fs';
import path from 'path';

let eps = [];
const epFile = path.join(DATA, 'endpoints.txt');
if (process.env.QA_ENDPOINTS) eps = process.env.QA_ENDPOINTS.split(',');
else if (fs.existsSync(epFile)) eps = fs.readFileSync(epFile, 'utf8').split('\n');
eps = eps.map(s => s.trim()).filter(s => s && !s.startsWith('#'));
if (!eps.length) { console.error(`❌ Chưa có endpoint. Tạo ${epFile} (mỗi path 1 dòng) hoặc set QA_ENDPOINTS.`); process.exit(1); }

const { b, page } = await browser();
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
const results = await page.evaluate(async (list) => {
  const out = [];
  for (const ep of list) {
    try { const r = await fetch(ep, { credentials: 'include' }); out.push(`${r.status}  ${ep}`); }
    catch (e) { out.push(`ERR  ${ep}  ${String(e).slice(0, 60)}`); }
  }
  return out;
}, eps);
let bad = 0;
for (const line of results) { const code = parseInt(line); if (code >= 400 || isNaN(code)) { bad++; console.log('⚠️ ' + line); } else console.log('✓  ' + line); }
console.log(`\n${eps.length} endpoint, ${bad} lỗi (4xx/5xx/ERR).`);
await b.close();
