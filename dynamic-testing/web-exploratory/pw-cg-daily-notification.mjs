import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const PROFILE_DIR = 'C:\\Users\\Asus\\.gemini\\lark-personal-profile';
const BOT_URL = 'https://dev.cluega.ai/app/pulse-bot?bot=cmvtabh0d004g31mns5ckgw16';
const RUN_DIR = 'D:\\Project\\qa-runs\\dynamic-web-exploratory\\2026-10-31_09-12-40_daily-notification-schedule-card';
const EVIDENCE_DIR = path.join(RUN_DIR, 'evidence', 'images');
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

const steps = [];

async function ss(page, name) {
  const p = path.join(EVIDENCE_DIR, name + '.png');
  await page.screenshot({ path: p, fullPage: true }).catch(() => {});
  return p;
}

async function getInput(page) {
  const sels = ['textarea', '[contenteditable="true"]', 'input[type="text"]', '[class*="chat-input"]', '[class*="message-input"]'];
  for (const s of sels) {
    try { const el = page.locator(s).first(); if (await el.isVisible({ timeout: 3000 })) return el; } catch {}
  }
  return null;
}

async function send(page, msg) {
  const el = await getInput(page);
  if (!el) return false;
  await el.click();
  await el.fill(msg);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(12000);
  return true;
}

async function lastBotText(page) {
  const sels = ['[class*="bot"]', '[class*="assistant"]', '[data-role="bot"]', '[class*="message"]:last-child'];
  for (const s of sels) {
    try { const t = await page.locator(s).last().innerText({ timeout: 2000 }); if (t && t.trim().length > 10) return t.trim(); } catch {}
  }
  const body = await page.locator('body').innerText().catch(() => '');
  return body.split('\n').filter(l => l.trim().length > 5).slice(-15).join('\n');
}

function record(id, desc, note, screenshotPath, verdict) {
  steps.push({ id, desc, note, screenshotPath, verdict });
  console.log(`[${verdict}] ${id} - ${desc} :: ${note.slice(0, 150)}`);
}

async function main() {
  let browser;
  try {
    browser = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: false,
      viewport: { width: 1440, height: 900 },
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    const pages = browser.pages();
    const page = pages.length > 0 ? pages[0] : await browser.newPage();

    let st = 0;
    try { const r = await page.goto(BOT_URL, { waitUntil: 'load', timeout: 25000 }); st = r?.status() || 0; } catch (e) { console.log('goto err:', e.message.slice(0, 80)); }
    await page.waitForTimeout(4000);
    const url = page.url();
    console.log(`HTTP ${st} | ${url}`);
    const shot0 = await ss(page, 'STEP-000_botpage');

    if (url.includes('login') || url.includes('auth')) {
      record('NOTI-00', 'Truy cap bot', `Bi redirect sang login: ${url}`, shot0, 'UNTEST');
      await browser.close(); writeReport(); return;
    }

    // NOTI-01: request daily notification -> expect schedule card
    const ok1 = await send(page, 'thông báo dữ liệu hàng ngày cho tôi');
    const resp1 = ok1 ? await lastBotText(page) : '(không gửi được tin nhắn)';
    const shot1 = await ss(page, 'STEP-001_request_sent');
    const hasScheduleHint = /lịch|schedule|09:00|9:00|ngưỡng|threshold|ROAS|CPA/i.test(resp1);
    record('NOTI-01', 'Tao schedule card khi yeu cau thong bao hang ngay', resp1, shot1, ok1 ? (hasScheduleHint ? 'OBS' : 'FAILED') : 'UNTEST');

    // Try to find Confirm/Pause/Edit buttons
    const btnSelsConfirm = ['button:has-text("Confirm")', 'button:has-text("Xác nhận")'];
    const btnSelsPause = ['button:has-text("Pause")', 'button:has-text("Tạm dừng")'];
    const btnSelsEdit = ['button:has-text("Edit")', 'button:has-text("Sửa")', 'button:has-text("Chỉnh sửa")'];

    let confirmBtn = null;
    for (const s of btnSelsConfirm) { try { const el = page.locator(s).last(); if (await el.isVisible({ timeout: 2000 })) { confirmBtn = el; break; } } catch {} }
    let pauseBtn = null;
    for (const s of btnSelsPause) { try { const el = page.locator(s).last(); if (await el.isVisible({ timeout: 2000 })) { pauseBtn = el; break; } } catch {} }
    let editBtn = null;
    for (const s of btnSelsEdit) { try { const el = page.locator(s).last(); if (await el.isVisible({ timeout: 2000 })) { editBtn = el; break; } } catch {} }

    record('NOTI-01b', 'Kiem tra nut Pause/Edit/Confirm tren schedule card', `Confirm=${!!confirmBtn} Pause=${!!pauseBtn} Edit=${!!editBtn}`, shot1, (confirmBtn || pauseBtn || editBtn) ? 'OBS' : 'FAILED');

    // NOTI-02: Confirm schedule
    if (confirmBtn) {
      await confirmBtn.click().catch(() => {});
      await page.waitForTimeout(6000);
      const resp2 = await lastBotText(page);
      const shot2 = await ss(page, 'STEP-002_after_confirm');
      record('NOTI-02', 'Confirm schedule', resp2, shot2, 'OBS');
    } else {
      record('NOTI-02', 'Confirm schedule', 'Khong tim thay nut Confirm de bam', shot1, 'UNTEST');
    }

    // NOTI-07: Pause schedule (try after confirm, separate message fallback)
    let pauseBtn2 = pauseBtn;
    if (!pauseBtn2) {
      for (const s of btnSelsPause) { try { const el = page.locator(s).last(); if (await el.isVisible({ timeout: 2000 })) { pauseBtn2 = el; break; } } catch {} }
    }
    if (pauseBtn2) {
      await pauseBtn2.click().catch(() => {});
      await page.waitForTimeout(6000);
      const resp7 = await lastBotText(page);
      const shot7 = await ss(page, 'STEP-003_after_pause');
      record('NOTI-07', 'Pause schedule', resp7, shot7, 'OBS');
    } else {
      record('NOTI-07', 'Pause schedule', 'Khong tim thay nut Pause de bam', shot1, 'UNTEST');
    }

    // Clarification question to bot about boundary / edit / resume behavior (as data, not as proof)
    const ok8 = await send(page, 'Nếu ROAS đúng bằng 1.5 hoặc CPA đúng bằng 12 thì có tính là bất thường không? Sau khi Pause có resume lại được không?');
    const resp8 = ok8 ? await lastBotText(page) : '(không gửi được tin nhắn)';
    const shot8 = await ss(page, 'STEP-004_clarify_boundary');
    record('NOTI-CLARIFY', 'Hoi bot ve quy tac bien va resume', resp8, shot8, 'OBS');

    await browser.close();
    writeReport();
  } catch (e) {
    console.error('Fatal:', e.message);
    if (browser) await browser.close().catch(() => {});
    record('ALL', 'Fatal error', e.message, null, 'UNTEST');
    writeReport();
  }
}

function writeReport() {
  fs.writeFileSync(path.join(RUN_DIR, 'results.json'), JSON.stringify(steps, null, 2), 'utf8');
  console.log('\n===STEPS WRITTEN TO results.json===');
}

main();
