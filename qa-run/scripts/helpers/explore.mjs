// Mở 1 trang bất kỳ, in snapshot gọn + chụp ảnh.
// Dùng: node <skill>/scripts/explore.mjs <path> [tên-shot] [waitMs]
import { browser, snap, printSnap, shot, BASE } from '../../lib/driver.mjs';
import { waitForUiReady } from '../../lib/wait.mjs';

const pathArg = process.argv[2] || '/';
const shotName = process.argv[3] || ('explore' + pathArg.replace(/\W+/g, '_'));
const waitMs = Number(process.argv[4] ?? process.env.QA_LEGACY_SETTLE_MS ?? 0);

const { b, page } = await browser();
await page.goto(BASE + pathArg, { waitUntil: 'domcontentloaded' });
await waitForUiReady(page, { timeout: Number(process.env.QA_READY_TIMEOUT_MS || 12000) });
if (waitMs > 0) await page.waitForTimeout(waitMs);
printSnap(await snap(page), 'EXPLORE ' + pathArg);
await shot(page, shotName);
await b.close();
