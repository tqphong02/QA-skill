// Quét nhiều trang tìm lỗi (HTTP≥400 / console error). Project-agnostic.
// Routes: QA_ROUTES (csv trong .env) nếu có; ngược lại TỰ DÒ các link nav cùng origin từ trang chủ.
// Dùng: node <skill>/scripts/sweep.mjs
import { browser, snap, shot, BASE } from '../../lib/driver.mjs';

const { b, page } = await browser();
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);

let routes;
if (process.env.QA_ROUTES) {
  routes = process.env.QA_ROUTES.split(',').map(s => s.trim()).filter(Boolean);
} else {
  routes = await page.evaluate(() =>
    [...new Set([...document.querySelectorAll('a[href^="/"]')].map(a => a.getAttribute('href')))]
      .filter(h => h && !h.startsWith('//') && !/\.(png|jpg|svg|css|js)$/i.test(h))
  );
  console.log(`(tự dò ${routes.length} route từ nav)`);
}
routes = [...new Set(['/', ...routes])].slice(0, 40);

let bad = 0;
for (const r of routes) {
  try {
    await page.goto(BASE + r, { waitUntil: 'domcontentloaded' });
    const s = await snap(page);
    const errs = (s.errors || []).filter(e => /^HTTP [45]|CONSOLE|PAGEERR/.test(e));
    console.log(`${errs.length ? '⚠️ ' : '✓ '}${r}  ${errs.length ? '| ' + errs.join(' ; ') : ''}`);
    if (errs.length) { bad++; await shot(page, 'sweep' + r.replace(/\W+/g, '_')); }
  } catch (e) { console.log(`✗ ${r}  (nav fail: ${e.message.split('\n')[0]})`); }
}
console.log(`\nTổng: ${routes.length} route, ${bad} có lỗi (ảnh trong evidence/).`);
await b.close();
