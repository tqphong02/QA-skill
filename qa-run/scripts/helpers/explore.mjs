// Mở 1 trang bất kỳ, in snapshot gọn + chụp ảnh.
// Dùng: node <skill>/scripts/explore.mjs <path> [tên-shot] [waitMs]
import { browser, snap, printSnap, shot, BASE } from '../lib/driver.mjs';

const pathArg = process.argv[2] || '/';
const shotName = process.argv[3] || ('explore' + pathArg.replace(/\W+/g, '_'));
const waitMs = Number(process.argv[4] || 1200);

const { b, page } = await browser();
await page.goto(BASE + pathArg, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(waitMs);
printSnap(await snap(page), 'EXPLORE ' + pathArg);
await shot(page, shotName);
await b.close();
