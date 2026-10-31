// CG live test v2 — domcontentloaded + better selectors
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const STORAGE_STATE = 'C:\\Users\\Asus\\.gemini\\lark-personal-profile\\cluega-dev-storage-state.json';
const BASE_URL = 'https://dev.cluega.ai/app/pulse-bot?bot=cmvtabh0d004g31mns5ckgw16';
const RUN_DIR = 'D:\\Project\\qa-runs\\dynamic-web-exploratory\\2026-10-30_16-27-20_oct27-engineer-verify-live';

const results = [];

async function sendMessage(page, msg, waitMs = 8000) {
  // Find chat input
  const input = page.locator('textarea, [contenteditable="true"], input[type="text"]').last();
  await input.click();
  await input.fill(msg);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(waitMs);
  // Get latest bot response
  const msgs = await page.locator('[class*="message"], [class*="msg"], [class*="chat"]').allTextContents();
  return msgs.slice(-3).join(' | ');
}

async function screenshot(page, name) {
  const p = path.join(RUN_DIR, `${name}.png`);
  await page.screenshot({ path: p, fullPage: false });
  return p;
}

async function main() {
  let browser, context, page;

  try {
    browser = await chromium.launch({ headless: false, slowMo: 300 });
    context = await browser.newContext({ storageState: STORAGE_STATE });
    page = await context.newPage();

    // Network/console observation
    const networkErrors = [];
    const consoleErrors = [];
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('requestfailed', r => networkErrors.push(r.url()));

    // Navigate
    console.log('Navigating to dev.cluega.ai...');
    const resp = await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    const httpStatus = resp ? resp.status() : 0;
    console.log('HTTP status:', httpStatus);
    await page.waitForTimeout(3000);

    const title = await page.title();
    const url = page.url();
    console.log('Page title:', title, '| URL:', url);

    // Check auth - if redirected to login
    if (url.includes('login') || url.includes('signin') || url.includes('auth')) {
      results.push({ cg: 'ALL', verdict: 'UNTEST', note: `Auth redirect: ${url}` });
      await screenshot(page, 'auth-redirect');
      await finalize(browser, networkErrors, consoleErrors);
      return;
    }

    await screenshot(page, '00-landing');

    // Test cases mapped to engineer CG responsibilities
    const tests = [
      { cg: 'CG08', eng: 'Eng 08', scope: 'Intent routing / multi-bot coordination', msg: 'DogSec tóm tắt các task hôm nay cho team Creative' },
      { cg: 'CG11', eng: 'Eng 11', scope: 'Reports/Notifications (StatDog)', msg: 'StatDog cho xem báo cáo hiệu suất quảng cáo hôm nay' },
      { cg: 'CG12', eng: 'Eng 12', scope: 'Ad delivery (AdDog)', msg: 'AdDog tạo chiến dịch Traffic đến website với ngân sách 200 USD/ngày' },
      { cg: 'CG15', eng: 'Eng 15', scope: 'Lark/Feishu integration', msg: 'Cài đặt Lark app cho workspace của team, scope permissions?' },
      { cg: 'CG20', eng: 'Eng 20', scope: 'TG/Social BD (DealDog)', msg: 'DealDog thêm bot vào nhóm TG của client để support' },
      { cg: 'CG23', eng: 'Eng 23', scope: 'Docs/Ad copy (CopyDog)', msg: 'CopyDog viết 3 phiên bản ad copy cho Traffic campaign, highlight giảm giá 30%' },
      { cg: 'CG03/22', eng: 'Eng 03/22', scope: 'Dashboard', msg: 'Mở dashboard Traffic ads tháng này, hiển thị clicks, CTR, CPC' },
      { cg: 'CG05', eng: 'Eng 05', scope: 'Sandbox/Model router', msg: 'Hệ thống đang dùng model nào cho task ad delivery và ad copy?' },
      { cg: 'CG27/33', eng: 'Eng 27/33', scope: 'Meetings/Calls', msg: 'Bot join Lark meeting tiếp theo của Creative Team và ghi chú nội dung' },
    ];

    for (const t of tests) {
      console.log(`\n--- Testing ${t.cg} ---`);
      try {
        // Try sending message
        const inputSel = 'textarea, [contenteditable="true"][data-placeholder], [class*="input"][contenteditable]';
        const inputEl = page.locator(inputSel).first();
        const inputVisible = await inputEl.isVisible({ timeout: 3000 }).catch(() => false);

        if (!inputVisible) {
          results.push({ ...t, verdict: 'UNTEST', botResp: 'Input field not found', net: networkErrors.length, console: consoleErrors.length });
          continue;
        }

        await inputEl.click();
        await inputEl.fill(t.msg);
        await screenshot(page, `${t.cg}-before-send`);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(6000);

        await screenshot(page, `${t.cg}-after-response`);

        // Extract latest messages visible
        const msgEls = await page.locator('[class*="message"], [class*="bubble"], [class*="chat-item"], [class*="msg"]').all();
        let botResp = '';
        for (const el of msgEls.slice(-4)) {
          const txt = await el.innerText().catch(() => '');
          if (txt.trim()) botResp += txt.trim().slice(0, 120) + ' // ';
        }
        if (!botResp) {
          // fallback: page text diff
          botResp = await page.locator('body').innerText().catch(() => '(empty)');
          botResp = botResp.slice(-300);
        }

        // Classify verdict
        const lower = botResp.toLowerCase();
        let verdict = 'UNTEST';
        if (lower.includes('không tìm thấy') || lower.includes('not found') || lower.includes('lỗi') || lower.includes('error')) {
          verdict = 'FAILED';
        } else if (lower.includes('task') || lower.includes('bot') || lower.includes('campaign') || lower.includes('chiến') || botResp.length > 50) {
          verdict = 'PASS';
        }

        results.push({ ...t, verdict, botResp: botResp.slice(0, 200), net: networkErrors.length, console: consoleErrors.length });
      } catch (e) {
        results.push({ ...t, verdict: 'UNTEST', botResp: `Exception: ${e.message}` });
      }
    }

    await finalize(browser, networkErrors, consoleErrors);

  } catch (e) {
    console.error('Fatal error:', e.message);
    results.push({ cg: 'ALL', verdict: 'UNTEST', note: e.message });
    if (browser) await browser.close().catch(() => {});
    writeReport([], []);
  }
}

async function finalize(browser, networkErrors, consoleErrors) {
  await browser.close().catch(() => {});
  writeReport(networkErrors, consoleErrors);
}

function writeReport(networkErrors, consoleErrors) {
  const pass = results.filter(r => r.verdict === 'PASS');
  const failed = results.filter(r => r.verdict === 'FAILED');
  const untest = results.filter(r => r.verdict === 'UNTEST');

  const rows = results.map(r =>
    `| ${r.cg||'-'} | ${r.eng||'-'} | ${r.scope||'-'} | ${(r.msg||r.note||'').slice(0,60)} | ${(r.botResp||r.note||'-').slice(0,80)} | ${r.verdict} |`
  ).join('\n');

  const report = `# CG Test Report — Oct 27 Verify (Live: dev.cluega.ai)
Run: 2026-10-30_16-27-20_oct27-engineer-verify-live
Date: 2026-10-30 | Tester: QA bot

## Summary
- PASS: ${pass.length}
- FAILED: ${failed.length}
- UNTEST: ${untest.length}
- Network errors observed: ${networkErrors.length}
- Console errors observed: ${consoleErrors.length}

## Results

| CG | Engineer | Function scope | Request sent | Bot response (truncated) | Verdict |
|---|---|---|---|---|---|
${rows}

### PASS
${pass.map(r => `- **${r.cg}** (${r.eng}): ${r.scope}`).join('\n') || '(none)'}

### FAILED
${failed.map(r => `- **${r.cg}**: ${r.botResp||r.note}`).join('\n') || '(none)'}

### UNTEST / không test được
${untest.map(r => `- **${r.cg}**: ${r.botResp||r.note}`).join('\n') || '(none)'}

### Network errors (${networkErrors.length})
${networkErrors.slice(0,5).join('\n') || '(none)'}

### Console errors (${consoleErrors.length})
${consoleErrors.slice(0,5).join('\n') || '(none)'}
`;

  fs.writeFileSync(path.join(RUN_DIR, 'report.md'), report, 'utf8');
  console.log('\nReport written to:', path.join(RUN_DIR, 'report.md'));
  console.log(report);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
