// CG live smoke probe — adaptive wait + accessibility-first input + per-case
// expectations (not a shared keyword bag). See lib/chat-probe.mjs for the
// reusable primitives this replaces fixed sleeps and CSS-class guessing with.
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
  || 'D:\\Project\\qa-runs\\dynamic-web-exploratory\\2026-10-30_16-27-20_oct27-engineer-verify-live';

const REFUSAL_PATTERNS = [/xin lỗi.*(không thể|chưa hiểu)/i, /\bcannot\b/i, /\bnot supported\b/i, /\berror\b/i, /\blỗi\b/i];

function refused(text) {
  return REFUSAL_PATTERNS.some(p => p.test(text));
}

// Each case owns an `expect` predicate tied to what the request actually asks
// for, instead of a shared generic good/bad word list — a short correct reply
// and a long vague refusal must not collapse to the same verdict.
const TESTS = [
  {
    cg: 'CG08', eng: 'Eng 08', scope: 'Intent routing/DogSec',
    msg: 'DogSec liệt kê task đang chạy hôm nay',
    expect: t => !refused(t) && /task|công việc|đang chạy|danh sách/i.test(t),
  },
  {
    cg: 'CG11', eng: 'Eng 11', scope: 'Reports/StatDog',
    msg: 'StatDog báo cáo hiệu suất ads hôm nay',
    expect: t => !refused(t) && /ctr|cpc|cpa|roas|chi tiêu|spend|impression|hiệu suất/i.test(t),
  },
  {
    cg: 'CG12', eng: 'Eng 12', scope: 'Ad delivery/AdDog campaign',
    msg: 'AdDog tạo campaign Traffic website 200 USD/ngày',
    expect: t => !refused(t) && /200/.test(t) && /(campaign|chiến dịch)/i.test(t) && /traffic/i.test(t),
  },
  {
    cg: 'CG15', eng: 'Eng 15', scope: 'Lark integration',
    msg: 'Hướng dẫn cài Lark app và permission list',
    expect: t => !refused(t) && /lark/i.test(t) && /(permission|quyền|cài đặt|install)/i.test(t),
  },
  {
    cg: 'CG20', eng: 'Eng 20', scope: 'TG/DealDog',
    msg: 'DealDog thêm bot vào nhóm Telegram của client',
    expect: t => !refused(t) && /telegram/i.test(t) && /(nhóm|group|thêm|add)/i.test(t),
  },
  {
    cg: 'CG23', eng: 'Eng 23', scope: 'Ad copy/CopyDog',
    msg: 'CopyDog viết 3 ad copy Traffic giảm giá 30%',
    expect: t => !refused(t) && /30%/.test(t) && (t.match(/\n\s*[-•\d]/g) || []).length >= 2,
  },
  {
    cg: 'CG03/22', eng: 'Eng 03/22', scope: 'Dashboard TikTok ads',
    msg: 'Mở dashboard Traffic tháng 10 clicks CTR CPC',
    expect: t => !refused(t) && /(ctr|cpc|click)/i.test(t) && /dashboard|báo cáo/i.test(t),
  },
  {
    cg: 'CG05', eng: 'Eng 05', scope: 'Model router',
    msg: 'Model AI nào đang xử lý ad delivery?',
    expect: t => !refused(t) && /(gpt|claude|gemini|model)/i.test(t),
  },
  {
    cg: 'CG27/33', eng: 'Eng 27/33', scope: 'Meetings/Calls',
    msg: 'Bot join Lark meeting tiếp theo của Creative Team',
    expect: t => !refused(t) && /(meeting|lịch|calendar|cuộc họp)/i.test(t),
  },
];

async function ss(page, name) {
  await page.screenshot({ path: path.join(RUN_DIR, `${name}.png`), fullPage: false }).catch(() => {});
}

async function main() {
  const records = [];
  let session;
  try {
    session = await openPersistentBot(chromium, { profileDir: PROFILE_DIR, botUrl: BOT_URL });
    const { page } = session;
    console.log(`HTTP ${session.status} | ${session.url}`);
    await ss(page, '02-botpage');

    if (session.authExpired) {
      records.push({
        cg: 'ALL', verdict: 'UNTEST', reason: 'auth_expired',
        note: `Session redirected to login/auth: ${session.url}. Re-authenticate the persistent profile before retrying; this is not a product defect.`,
      });
      await session.browser.close();
      report(records);
      return;
    }
    if (session.navError) {
      records.push({ cg: 'ALL', verdict: 'UNTEST', note: `Navigation failed after retry: ${session.navError}` });
    }

    for (const t of TESTS) {
      console.log(`\nTest ${t.cg}: "${t.msg.slice(0, 40)}"`);
      try {
        const input = await findChatInput(page);
        if (!input) {
          records.push({ ...t, verdict: 'UNTEST', botResp: '(chat input not found by role, placeholder, or CSS fallback)' });
          console.log('  => UNTEST: chat input not found');
          continue;
        }
        const baseline = await page.locator('body').innerText().catch(() => '');
        await sendChatMessage(input, t.msg);
        const reply = await waitForBotReply(page, baseline, { timeoutMs: 30000 });
        await ss(page, `${t.cg.replace('/', '_')}-resp`);

        if (!reply.changed) {
          records.push({ ...t, verdict: 'UNTEST', botResp: `(no reply within ${reply.elapsedMs}ms)` });
          console.log(`  => UNTEST: no reply within ${reply.elapsedMs}ms`);
          continue;
        }
        const text = reply.text || '';
        const verdict = t.expect(text) ? 'PASS' : 'FAILED';
        records.push({ ...t, verdict, botResp: text.slice(0, 400), replyLatencyMs: reply.elapsedMs, timedOut: reply.timedOut });
        console.log(`  => ${verdict} (${reply.elapsedMs}ms): ${text.slice(0, 80)}`);
      } catch (e) {
        records.push({ ...t, verdict: 'UNTEST', botResp: `Exc: ${e.message.slice(0, 120)}` });
        console.log('  Exc:', e.message.slice(0, 80));
      }
    }

    await session.browser.close();
    report(records);
  } catch (e) {
    console.error('Fatal:', e.message);
    if (session?.browser) await session.browser.close().catch(() => {});
    records.push({ cg: 'ALL', verdict: 'UNTEST', note: `Fatal: ${e.message}` });
    report(records);
  }
}

function report(records) {
  const normalized = writeChatProbeReport(RUN_DIR, 'results.json', records);
  const byVerdict = v => normalized.filter(r => r.userVerdict === v);
  const pass = byVerdict('PASS'), fail = byVerdict('FAILED'), unt = byVerdict('UNTEST');
  const rows = normalized.map(r =>
    `| ${r.cg || '-'} | ${r.eng || '-'} | ${r.scope || '-'} | ${(r.msg || r.note || '').slice(0, 50)} | ${(r.botResp || r.note || '-').slice(0, 80)} | **${r.userVerdict}** (${r.verdict}) |`
  ).join('\n');
  const md = `# CG Test Report (dev.cluega.ai)\n\n## Tổng kết: PASS ${pass.length} | FAILED ${fail.length} | UNTEST ${unt.length}\n\n`
    + `| CG | Eng | Scope | Request | Bot Response | Verdict (internal) |\n|---|---|---|---|---|---|\n${rows}\n\n`
    + `## PASS\n${pass.map(r => `- **${r.cg}** (${r.eng}): ${r.scope}`).join('\n') || '(none)'}\n\n`
    + `## FAILED\n${fail.map(r => `- **${r.cg}**: ${r.botResp}`).join('\n') || '(none)'}\n\n`
    + `## UNTEST / blocked\n${unt.map(r => `- **${r.cg}**: ${r.botResp || r.note}`).join('\n') || '(none)'}\n`;
  fs.writeFileSync(path.join(RUN_DIR, 'report.md'), md, 'utf8');
  console.log('\n===FINAL REPORT===\n' + md);
}

main();
