// CG live test v2
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const STORAGE = 'C:\\Users\\Asus\\.gemini\\lark-personal-profile\\cluega-dev-storage-state.json';
const BOT_URL = 'https://dev.cluega.ai/app/pulse-bot?bot=cmvtabh0d004g31mns5ckgw16';
const HOME_URL = 'https://dev.cluega.ai/';
const RUN_DIR  = 'D:\\Project\\qa-runs\\dynamic-web-exploratory\\2026-10-30_16-27-20_oct27-engineer-verify-live';
const results = []; const netErr = []; const conErr = [];

async function ss(page, name) { await page.screenshot({path: path.join(RUN_DIR,name+'.png')}).catch(()=>{}); }

async function getInput(page) {
  const sels = ['textarea','[contenteditable="true"][class*="input"]','[class*="input"][contenteditable]','input[type="text"]','[placeholder]'];
  for (const s of sels) {
    try { const el = page.locator(s).first(); if (await el.isVisible({timeout:3000})) return el; } catch {}
  }
  return null;
}

async function chat(page, msg) {
  const el = await getInput(page);
  if (!el) return null;
  await el.click(); await el.fill(msg);
  await page.waitForTimeout(500); await page.keyboard.press('Enter');
  await page.waitForTimeout(9000);
  // try to get bot reply
  const selList = ['[class*="bot"]','[class*="assistant"]','[data-role="bot"]','[data-role="assistant"]','[class*="message"]:last-child','[class*="bubble"]:last-child'];
  for (const s of selList) {
    try { const t = await page.locator(s).last().innerText({timeout:2000}); if (t && t.trim().length > 10) return t.trim().slice(0,300); } catch {}
  }
  return (await page.locator('body').innerText().catch(()=>'')).split('\n').filter(l=>l.trim().length>5).slice(-8).join(' | ').slice(0,300);
}

function verdict(resp) {
  if (!resp || resp.length < 20) return 'UNTEST';
  const l = resp.toLowerCase();
  const bad = ['error','lỗi','không thể','xin lỗi tôi','cannot','not supported','unavailable'];
  const good = ['được','sẽ','đã','ok','chiến dịch','campaign','báo cáo','dashboard','copy','model','lark','meeting','bot','task'];
  if (bad.some(w=>l.includes(w))) return 'FAILED';
  if (good.some(w=>l.includes(w))) return 'PASS';
  return resp.length > 60 ? 'PASS' : 'UNTEST';
}

async function main() {
  let browser;
  try {
    browser = await chromium.launch({headless:true});
    const ctx = await browser.newContext({storageState:STORAGE,viewport:{width:1440,height:900}});
    const page = await ctx.newPage();
    page.on('console',m=>{if(m.type()==='error') conErr.push(m.text().slice(0,100));});
    page.on('requestfailed',r=>netErr.push(r.url().slice(0,80)));

    // Navigate with load (not networkidle)
    let st = 0;
    try {
      const r = await page.goto(HOME_URL,{waitUntil:'load',timeout:20000}); st = r?.status()||0;
    } catch(e) {
      try { const r = await page.goto(HOME_URL,{waitUntil:'commit',timeout:15000}); st=r?.status()||0; } catch {}
    }
    await page.waitForTimeout(4000);
    const url = page.url(); const title = await page.title();
    console.log(`Status:${st} URL:${url} Title:${title}`);
    await ss(page,'00-home');

    if (url.includes('login')||url.includes('auth')||url.includes('signin')) {
      results.push({cg:'ALL',verdict:'UNTEST',note:`Auth redirect → ${url}`});
      await browser.close(); writeReport(); return;
    }

    // Navigate to bot
    try {
      await page.goto(BOT_URL,{waitUntil:'load',timeout:20000});
      await page.waitForTimeout(4000);
    } catch {}
    await ss(page,'01-bot-page');
    console.log('Bot page URL:', page.url());

    const tests = [
      {cg:'CG08',eng:'Eng 08',scope:'Intent routing/DogSec',        msg:'DogSec liệt kê các task đang chạy cho Creative Team hôm nay'},
      {cg:'CG11',eng:'Eng 11',scope:'Reports/StatDog',              msg:'StatDog tóm tắt hiệu suất quảng cáo hôm nay'},
      {cg:'CG12',eng:'Eng 12',scope:'Ad delivery/AdDog',            msg:'AdDog tạo chiến dịch Traffic ngân sách 200 USD/ngày'},
      {cg:'CG15',eng:'Eng 15',scope:'Lark integration',             msg:'Cài Lark app, danh sách permission cần thiết'},
      {cg:'CG20',eng:'Eng 20',scope:'TG/DealDog BD',                msg:'DealDog thêm bot vào nhóm Telegram client'},
      {cg:'CG23',eng:'Eng 23',scope:'Ad copy/CopyDog',              msg:'CopyDog viết 3 phiên bản ad copy Traffic, điểm nhấn giảm giá 30%'},
      {cg:'CG03/22',eng:'Eng 03/22',scope:'Dashboard TikTok',       msg:'Mở dashboard Traffic tháng 10, clicks CTR CPC'},
      {cg:'CG05',eng:'Eng 05',scope:'Model router/Sandbox',         msg:'Model AI nào đang dùng cho ad delivery?'},
      {cg:'CG27/33',eng:'Eng 27/33',scope:'Meetings/Calls',         msg:'Bot join meeting Lark tiếp theo của Creative Team'},
    ];

    for (const t of tests) {
      console.log(`Testing ${t.cg}...`);
      try {
        const resp = await chat(page, t.msg);
        const v = verdict(resp);
        results.push({...t,verdict:v,botResp:resp||'(empty)'});
        console.log(`  ${v}: ${(resp||'').slice(0,70)}`);
        await ss(page,`${t.cg.replace('/','_')}-resp`);
      } catch(e) {
        results.push({...t,verdict:'UNTEST',botResp:`Exc: ${e.message.slice(0,80)}`});
      }
    }

    await browser.close(); writeReport();
  } catch(e) {
    if(browser) await browser.close().catch(()=>{});
    results.push({cg:'ALL',verdict:'UNTEST',note:`Fatal: ${e.message}`});
    writeReport();
  }
}

function writeReport() {
  const pass=results.filter(r=>r.verdict==='PASS');
  const fail=results.filter(r=>r.verdict==='FAILED');
  const unt=results.filter(r=>r.verdict==='UNTEST');
  const rows=results.map(r=>`| ${r.cg||'-'} | ${r.eng||'-'} | ${r.scope||'-'} | ${(r.msg||r.note||'').slice(0,50)} | ${(r.botResp||r.note||'-').slice(0,80)} | **${r.verdict}** |`).join('\n');
  const md=`# CG Test Report — Oct 27 Verify (dev.cluega.ai)
Run: 2026-10-30_16-27-20_oct27-engineer-verify-live | 2026-10-30

## Tổng kết: PASS ${pass.length} | FAILED ${fail.length} | UNTEST ${unt.length}

| CG | Engineer | Scope | Request | Bot response | Verdict |
|---|---|---|---|---|---|
${rows}

## PASS (${pass.length})
${pass.map(r=>`- **${r.cg}** (${r.eng}): ${r.scope}`).join('\n')||'(none)'}

## FAILED (${fail.length})
${fail.map(r=>`- **${r.cg}**: ${r.botResp}`).join('\n')||'(none)'}

## UNTEST (${unt.length})
${unt.map(r=>`- **${r.cg}**: ${r.botResp||r.note}`).join('\n')||'(none)'}

## Observability
- Network errors: ${netErr.length} ${netErr.slice(0,3).join(', ')}
- Console errors: ${conErr.length} ${conErr.slice(0,3).join(', ')}
`;
  fs.writeFileSync(path.join(RUN_DIR,'report.md'),md,'utf8');
  console.log('\n===REPORT===\n'+md);
}

main().catch(e=>{console.error(e);process.exit(1);});
