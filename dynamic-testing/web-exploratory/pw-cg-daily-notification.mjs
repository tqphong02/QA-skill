// Daily-notification schedule-card probe — adaptive wait + accessibility-first
// input, sharing lib/chat-probe.mjs instead of duplicating the fixed-sleep
// CSS-guessing pattern that the earlier version carried.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import {
  openPersistentBot,
  findChatInput,
  sendChatMessage,
  waitForBotReply,
  writeChatProbeReport,
} from './lib/chat-probe.mjs';

const PROFILE_DIR = 'C:\\Users\\Asus\\.gemini\\lark-personal-profile';
const BOT_URL = 'https://dev.cluega.ai/app/pulse-bot?bot=cmvtabh0d004g31mns5ckgw16';
const RUN_DIR = process.env.QA_RUN_DIR
  || 'D:\\Project\\qa-runs\\dynamic-web-exploratory\\2026-10-31_09-12-40_daily-notification-schedule-card';
const EVIDENCE_DIR = path.join(RUN_DIR, 'evidence', 'images');
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

async function ss(page, name) {
  const p = path.join(EVIDENCE_DIR, `${name}.png`);
  await page.screenshot({ path: p, fullPage: true }).catch(() => {});
  return p;
}

async function findButton(page, texts) {
  for (const text of texts) {
    try {
      const loc = page.getByRole('button', { name: new RegExp(text, 'i') }).last();
      if (await loc.isVisible({ timeout: 2000 })) return loc;
    } catch { /* try next label */ }
  }
  return null;
}

async function main() {
  const records = [];
  let session;
  try {
    session = await openPersistentBot(chromium, { profileDir: PROFILE_DIR, botUrl: BOT_URL });
    const { page } = session;
    console.log(`HTTP ${session.status} | ${session.url}`);
    const shot0 = await ss(page, 'STEP-000_botpage');

    if (session.authExpired) {
      records.push({ id: 'NOTI-00', desc: 'Truy cập bot', verdict: 'UNTEST', reason: 'auth_expired', note: `Bị redirect sang login: ${session.url}`, screenshotPath: shot0 });
      await session.browser.close();
      return report(records);
    }

    // NOTI-01: request daily notification -> expect a schedule card with a concrete time/threshold
    const input1 = await findChatInput(page);
    if (!input1) {
      records.push({ id: 'NOTI-01', desc: 'Tạo schedule card khi yêu cầu thông báo hàng ngày', verdict: 'UNTEST', note: 'chat input not found', screenshotPath: shot0 });
    } else {
      const baseline1 = await page.locator('body').innerText().catch(() => '');
      await sendChatMessage(input1, 'thông báo dữ liệu hàng ngày cho tôi');
      const reply1 = await waitForBotReply(page, baseline1, { timeoutMs: 30000 });
      const shot1 = await ss(page, 'STEP-001_request_sent');
      const hasScheduleHint = reply1.changed && /lịch|schedule|\b\d{1,2}:\d{2}\b|ngưỡng|threshold|roas|cpa/i.test(reply1.text || '');
      records.push({
        id: 'NOTI-01', desc: 'Tạo schedule card khi yêu cầu thông báo hàng ngày',
        verdict: !reply1.changed ? 'UNTEST' : hasScheduleHint ? 'PASS' : 'FAILED',
        note: reply1.changed ? (reply1.text || '').slice(0, 400) : `(no reply within ${reply1.elapsedMs}ms)`,
        screenshotPath: shot1,
      });

      const confirmBtn = await findButton(page, ['Confirm', 'Xác nhận']);
      const pauseBtn = await findButton(page, ['Pause', 'Tạm dừng']);
      const editBtn = await findButton(page, ['Edit', 'Sửa', 'Chỉnh sửa']);
      records.push({
        id: 'NOTI-01b', desc: 'Kiểm tra nút Pause/Edit/Confirm trên schedule card',
        verdict: (confirmBtn || pauseBtn || editBtn) ? 'PASS' : 'FAILED',
        note: `Confirm=${!!confirmBtn} Pause=${!!pauseBtn} Edit=${!!editBtn}`,
        screenshotPath: shot1,
      });

      if (confirmBtn) {
        const baseline2 = await page.locator('body').innerText().catch(() => '');
        await confirmBtn.click().catch(() => {});
        const reply2 = await waitForBotReply(page, baseline2, { timeoutMs: 15000 });
        const shot2 = await ss(page, 'STEP-002_after_confirm');
        records.push({ id: 'NOTI-02', desc: 'Confirm schedule', verdict: reply2.changed ? 'PASS' : 'UNTEST', note: reply2.changed ? (reply2.text || '').slice(0, 400) : `(no reply within ${reply2.elapsedMs}ms)`, screenshotPath: shot2 });
      } else {
        records.push({ id: 'NOTI-02', desc: 'Confirm schedule', verdict: 'UNTEST', note: 'Không tìm thấy nút Confirm để bấm', screenshotPath: shot1 });
      }

      const pauseBtn2 = pauseBtn || await findButton(page, ['Pause', 'Tạm dừng']);
      if (pauseBtn2) {
        const baseline3 = await page.locator('body').innerText().catch(() => '');
        await pauseBtn2.click().catch(() => {});
        const reply3 = await waitForBotReply(page, baseline3, { timeoutMs: 15000 });
        const shot3 = await ss(page, 'STEP-003_after_pause');
        records.push({ id: 'NOTI-07', desc: 'Pause schedule', verdict: reply3.changed ? 'PASS' : 'UNTEST', note: reply3.changed ? (reply3.text || '').slice(0, 400) : `(no reply within ${reply3.elapsedMs}ms)`, screenshotPath: shot3 });
      } else {
        records.push({ id: 'NOTI-07', desc: 'Pause schedule', verdict: 'UNTEST', note: 'Không tìm thấy nút Pause để bấm', screenshotPath: shot1 });
      }

      // Clarification question — recorded as data for a human/BA to read, not scored as PASS/FAIL
      const input8 = await findChatInput(page);
      if (input8) {
        const baseline4 = await page.locator('body').innerText().catch(() => '');
        await sendChatMessage(input8, 'Nếu ROAS đúng bằng 1.5 hoặc CPA đúng bằng 12 thì có tính là bất thường không? Sau khi Pause có resume lại được không?');
        const reply4 = await waitForBotReply(page, baseline4, { timeoutMs: 30000 });
        const shot4 = await ss(page, 'STEP-004_clarify_boundary');
        records.push({ id: 'NOTI-CLARIFY', desc: 'Hỏi bot về quy tắc biên và resume', verdict: 'N/A', note: reply4.changed ? (reply4.text || '').slice(0, 600) : '(không có phản hồi)', screenshotPath: shot4 });
      }
    }

    await session.browser.close();
    report(records);
  } catch (e) {
    console.error('Fatal:', e.message);
    if (session?.browser) await session.browser.close().catch(() => {});
    records.push({ id: 'ALL', desc: 'Fatal error', verdict: 'UNTEST', note: e.message });
    report(records);
  }
}

function report(records) {
  const normalized = writeChatProbeReport(RUN_DIR, 'results.json', records);
  for (const r of normalized) console.log(`[${r.userVerdict}] ${r.id} - ${r.desc} :: ${(r.note || '').slice(0, 150)}`);
  console.log('\n===RESULTS WRITTEN TO results.json===');
}

main();
