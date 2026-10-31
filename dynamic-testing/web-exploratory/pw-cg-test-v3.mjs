import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const PROFILE_DIR = 'C:\\Users\\Asus\\.gemini\\lark-personal-profile';
const BOT_URL = 'https://dev.cluega.ai/app/pulse-bot?bot=cmvtabh0d004g31mns5ckgw16';
const RUN_DIR = 'D:\\Project\\qa-runs\\dynamic-web-exploratory\\2026-10-30_16-27-20_oct27-engineer-verify-live';
const results = []; const netErr = []; const conErr = [];

async function ss(page, name) { await page.screenshot({path:path.join(RUN_DIR,name+'.png'),fullPage:false}).catch(()=>{}); }

async function getInput(page) {
  const sels = ['textarea','[contenteditable="true"]','input[type="text"]','[class*="chat-input"]','[class*="message-input"]'];
  for (const s of sels) {
    try { const el = page.locator(s).first(); if (await el.isVisible({timeout:3000})) return el; } catch {}
  }
  return null;
}

async function chat(page, msg) {
  const el = await getInput(page);
  if (!el) { console.log('  No input found'); return null; }
  await el.click(); await el.fill(msg);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(10000);
  const sels = ['[class*="bot"]','[class*="assistant"]','[data-role="bot"]','[class*="message"]:last-child'];
  for (const s of sels) {
    try { const t = await page.locator(s).last().innerText({timeout:2000}); if (t&&t.trim().length>10) return t.trim().slice(0,300); } catch {}
  }
  const body = await page.locator('body').innerText().catch(()=>'');
  return body.split('\n').filter(l=>l.trim().length>5).slice(-8).join(' | ').slice(0,300);
}

function verdict(r) {
  if (!r||r.length<15) return 'UNTEST';
  const l=r.toLowerCase();
  if (['lỗi','error','xin lỗi tôi không thể','cannot','not supported'].some(w=>l.includes(w))) return 'FAILED';
  if (['được','sẽ','đã','ok','campaign','báo cáo','dashboard','copy','lark','meeting','bot','task'].some(w=>l.includes(w))) return 'PASS';
  return r.length>60?'PASS':'UNTEST';
}

async function main() {
  let browser;
  try {
    browser = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: false,
      viewport: {width:1440,height:900},
      args: ['--no-sandbox','--disable-dev-shm-usage'],
    });
    const pages = browser.pages();
    const page = pages.length > 0 ? pages[0] : await browser.newPage();
    page.on('console',m=>{if(m.type()==='error') conErr.push(m.text().slice(0,100));});
    page.on('requestfailed',r=>netErr.push(r.url().slice(0,80)));

    console.log('Navigating to bot URL...');
    let st = 0;
    try {
      const r = await page.goto(BOT_URL,{waitUntil:'load',timeout:25000}); st=r?.status()||0;
    } catch(e) { console.log('goto err:', e.message.slice(0,80)); }
    await page.waitForTimeout(5000);
    const url = page.url(); const title = await page.title();
    console.log(`HTTP ${st} | ${url} | ${title}`);
    await ss(page,'02-botpage');

    if (url.includes('login')||url.includes('auth')) {
      results.push({cg:'ALL',verdict:'UNTEST',note:`Still auth redirect: ${url}`});
      await browser.close(); writeReport(); return;
    }

    const tests = [
      {cg:'CG08',eng:'Eng 08',scope:'Intent routing/DogSec',       msg:'DogSec liệt kê task đang chạy hôm nay'},
      {cg:'CG11',eng:'Eng 11',scope:'Reports/StatDog',             msg:'StatDog báo cáo hiệu suất ads hôm nay'},
      {cg:'CG12',eng:'Eng 12',scope:'Ad delivery/AdDog campaign',  msg:'AdDog tạo campaign Traffic website 200 USD/ngày'},
      {cg:'CG15',eng:'Eng 15',scope:'Lark integration',            msg:'Hướng dẫn cài Lark app và permission list'},
      {cg:'CG20',eng:'Eng 20',scope:'TG/DealDog',                  msg:'DealDog thêm bot vào nhóm Telegram của client'},
      {cg:'CG23',eng:'Eng 23',scope:'Ad copy/CopyDog',             msg:'CopyDog viết 3 ad copy Traffic giảm giá 30%'},
      {cg:'CG03/22',eng:'Eng 03/22',scope:'Dashboard TikTok ads',  msg:'Mở dashboard Traffic tháng 10 clicks CTR CPC'},
      {cg:'CG05',eng:'Eng 05',scope:'Model router',                msg:'Model AI nào đang xử lý ad delivery?'},
      {cg:'CG27/33',eng:'Eng 27/33',scope:'Meetings/Calls',        msg:'Bot join Lark meeting tiếp theo của Creative Team'},
    ];

    for (const t of tests) {
      console.log(`\nTest ${t.cg}: "${t.msg.slice(0,40)}"`);
      try {
        const resp = await chat(page, t.msg);
        const v = verdict(resp);
        results.push({...t,verdict:v,botResp:resp||'(no response)'});
        console.log(`  => ${v}: ${(resp||'').slice(0,80)}`);
        await ss(page,`${t.cg.replace('/','_')}-resp`);
      } catch(e) {
        results.push({...t,verdict:'UNTEST',botResp:`Exc:${e.message.slice(0,80)}`});
        console.log('  Exc:', e.message.slice(0,60));
      }
    }

    await browser.close(); writeReport();
  } catch(e) {
    console.error('Fatal:', e.message);
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
  const md = `# CG Test Report — Oct 27 Verify (dev.cluega.ai)\nRun: 2026-10-30_16-27-20_oct27-engineer-verify-live | 2026-10-30\n\n## Tổng kết: PASS ${pass.length} | FAILED ${fail.length} | UNTEST ${unt.length}\n\n| CG | Eng | Scope | Request | Bot Response | Verdict |\n|---|---|---|---|---|---|\n${rows}\n\n## PASS\n${pass.map(r=>`- **${r.cg}** (${r.eng}): ${r.scope}`).join('\n')||'(none)'}\n\n## FAILED\n${fail.map(r=>`- **${r.cg}**: ${r.botResp}`).join('\n')||'(none)'}\n\n## UNTEST\n${unt.map(r=>`- **${r.cg}**: ${r.botResp||r.note}`).join('\n')||'(none)'}\n\n## Observability\n- Network errors: ${netErr.length}\n- Console errors: ${conErr.length}\n`;
  fs.writeFileSync(path.join(RUN_DIR,'report.md'),md,'utf8');
  console.log('\n===FINAL REPORT===\n'+md);
}

main();
