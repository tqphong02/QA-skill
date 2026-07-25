// Đăng nhập app rồi lưu phiên vào <project>/auth.json để mọi script tái dùng.
// Cần trong .env của project: QA_BASE_URL, QA_EMAIL, QA_PASSWORD
import { browser, snap, printSnap, shot, AUTH, BASE } from '../../lib/driver.mjs';

const EMAIL = process.env.QA_EMAIL;
const PASS = process.env.QA_PASSWORD;
if (!BASE || !EMAIL || !PASS) { console.error('❌ Thiếu QA_BASE_URL/QA_EMAIL/QA_PASSWORD trong .env (xem .env.example)'); process.exit(1); }

const { b, ctx, page } = await browser(false); // fresh, no auth
await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
printSnap(await snap(page), 'LOGIN PAGE (before)');
await shot(page, '00-login-page');

try {
  const emailSel = ['input[type=email]', 'input[name*=email i]', 'input[placeholder*=email i]', 'input[name=username]'];
  const passSel = ['input[type=password]', 'input[name*=pass i]', 'input[placeholder*=pass i]'];
  let filledE = false, filledP = false;
  for (const s of emailSel) { const e = page.locator(s).first(); if (await e.count()) { await e.fill(EMAIL); filledE = true; break; } }
  for (const s of passSel) { const e = page.locator(s).first(); if (await e.count()) { await e.fill(PASS); filledP = true; break; } }
  console.log('filled email=', filledE, 'pass=', filledP);
  const btn = page.locator('button[type=submit], button:has-text("Sign in"), button:has-text("Log in"), button:has-text("Đăng nhập"), button:has-text("Sign In")').first();
  if (await btn.count()) await btn.click(); else await page.keyboard.press('Enter');
  await page.waitForTimeout(5000);
} catch (e) { console.log('LOGIN STEP ERR:', e.message.split('\n')[0]); }

printSnap(await snap(page), 'AFTER LOGIN');
await shot(page, '01-after-login');
const url = page.url();
if (!/\/login/.test(url)) { await ctx.storageState({ path: AUTH }); console.log('LOGIN OK -> saved', AUTH, 'url=', url); }
else console.log('LOGIN likely FAILED, still on login. url=', url);
await b.close();
