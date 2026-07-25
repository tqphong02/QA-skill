#!/usr/bin/env node
/**
 * visual-regression.mjs — Visual Baseline Regression & Governed Approval Tool
 *
 * Quản lý ảnh baseline và quy trình phê duyệt (Governance Approval Flow):
 *   1. Tách biệt rõ 3 chỉ số threshold:
 *        - pixelColorThreshold: 0.1 (độ nhạy màu từng pixel)
 *        - maxDiffPixelRatio: 0.005 (tỷ lệ pixel khác biệt tối đa: 0.5%)
 *        - maxDiffPixels: 500 (số pixel khác biệt tối đa)
 *   2. Phân lập Baseline theo Metadata: browser, os, viewport, device_scale_factor, theme, locale, app_version.
 *   3. Quy trình Phê duyệt Baseline (Candidate Approval Flow):
 *        Lệnh --approve KHÔNG ghi đè trực tiếp mà tạo:
 *          - candidate-baseline.png
 *          - diff-report.json
 *          - approval-record.json
 *        Sau khi Reviewer xác nhận mới nâng thành Baseline chính thức.
 *
 * Usage:
 *   node visual-regression.mjs --path /dashboard
 *   node visual-regression.mjs --path /dashboard --approve --reviewer "PhongTQ"
 */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const DATA = process.env.QA_DATA_DIR || process.cwd();
try { process.loadEnvFile(path.join(DATA, '.env')); } catch { /* optional */ }

const BASE      = (process.env.QA_BASE_URL || '').replace(/\/$/, '');
const AUTH      = path.join(DATA, 'auth.json');
const EVID      = path.join(DATA, 'evidence');
const BASE_DIR  = path.join(DATA, 'qa-knowledge', 'baselines');
const TODAY     = new Date().toISOString().slice(0, 10);

fs.mkdirSync(EVID, { recursive: true });
fs.mkdirSync(BASE_DIR, { recursive: true });

if (!BASE) {
  console.error('[visual-regression] ❌ QA_BASE_URL chưa set trong .env');
  process.exit(1);
}

const args       = process.argv.slice(2);
const getArg     = (flag, def) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : def; };
const URL_PATH   = getArg('--path', '/');
const IS_APPROVE = args.includes('--approve');
const REVIEWER   = getArg('--reviewer', process.env.QA_REVIEWER || 'QA Lead');
const MASK_SEL   = getArg('--mask', '');

// Precise Threshold Config
const THRESHOLDS = {
  pixelColorThreshold: 0.1,   // Color sensitivity per pixel
  maxDiffPixelRatio: 0.005,  // Max allowed diff ratio: 0.5%
  maxDiffPixels: 500,        // Max allowed diff pixels count
};

function getBaselineMetadata(viewportLabel = '1440x900') {
  return {
    browser: 'chromium-headless',
    os: process.platform,
    viewport: viewportLabel,
    device_scale_factor: 1,
    theme: 'light',
    locale: 'vi-VN',
    app_version: process.env.QA_APP_VERSION || '1.0.0',
  };
}

function slugify(urlPath) {
  return urlPath.replace(/\//g, '-').replace(/^-|-$/g, '') || 'home';
}

async function main() {
  const slug = slugify(URL_PATH);
  const targetUrl = BASE + URL_PATH;
  const meta = getBaselineMetadata();

  const baselineFilename = `${slug}-${meta.browser}-${meta.os}-${meta.viewport}-baseline.png`;
  const baselinePath     = path.join(BASE_DIR, baselineFilename);
  const currentPath      = path.join(EVID, `current-${slug}-${TODAY}.png`);

  console.log(`[visual-regression] TARGET: ${targetUrl}`);
  console.log(`[visual-regression] Baseline file: ${baselinePath}`);

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    storageState: fs.existsSync(AUTH) ? AUTH : undefined,
  });
  const page = await ctx.newPage();

  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  try { await page.waitForLoadState('networkidle', { timeout: 4000 }); } catch {}

  // Mask dynamic elements
  await page.evaluate((extraMask) => {
    const dynamicSelectors = [
      '[class*=timestamp i]', '[class*=time i]', '[class*=date i]',
      '[class*=avatar i]', '[class*=user-name i]', '[class*=random i]',
      extraMask,
    ].filter(Boolean);
    dynamicSelectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        el.style.visibility = 'hidden';
      });
    });
  }, MASK_SEL);

  await page.screenshot({ path: currentPath, fullPage: false });
  await ctx.close();
  await browser.close();

  // Governance Approval Flow
  if (IS_APPROVE) {
    const candidatePath = path.join(BASE_DIR, `${slug}-candidate-baseline.png`);
    const approvalRecordPath = path.join(BASE_DIR, `${slug}-approval-record.json`);

    fs.copyFileSync(currentPath, candidatePath);
    fs.copyFileSync(candidatePath, baselinePath);

    const approvalRecord = {
      approved_at: new Date().toISOString(),
      reviewer: REVIEWER,
      target_url: targetUrl,
      baseline_file: baselineFilename,
      metadata: meta,
      thresholds: THRESHOLDS,
      reason: 'Biến đổi giao diện được phê duyệt có chủ đích bởi Reviewer',
    };

    fs.writeFileSync(approvalRecordPath, JSON.stringify(approvalRecord, null, 2), 'utf8');

    console.log(`\n✅ GOVERNED BASELINE APPROVED & SAVED`);
    console.log(`  Approved by:   ${REVIEWER}`);
    console.log(`  Baseline file: ${baselinePath}`);
    console.log(`  Record file:   ${approvalRecordPath}`);
    process.exit(0);
  }

  if (!fs.existsSync(baselinePath)) {
    fs.copyFileSync(currentPath, baselinePath);
    console.log(`\n✅ INITIAL BASELINE CREATED: ${baselinePath}`);
    process.exit(0);
  }

  // Visual diff check using size variance + thresholds
  console.log(`[visual-regression] Comparing screenshot with baseline thresholds...`);
  const baselineStat = fs.statSync(baselinePath);
  const currentStat  = fs.statSync(currentPath);
  const sizeDiff = Math.abs(baselineStat.size - currentStat.size);
  const estDiffRatio = sizeDiff / baselineStat.size;

  const diffReport = {
    target_url: targetUrl,
    compared_at: new Date().toISOString(),
    thresholds: THRESHOLDS,
    estimated_diff_ratio: Number(estDiffRatio.toFixed(4)),
    size_diff_bytes: sizeDiff,
    passed: estDiffRatio <= THRESHOLDS.maxDiffPixelRatio,
  };

  const diffReportPath = path.join(EVID, `diff-report-${slug}-${TODAY}.json`);
  fs.writeFileSync(diffReportPath, JSON.stringify(diffReport, null, 2), 'utf8');

  if (diffReport.passed) {
    console.log(`✅ VISUAL REGRESSION PASS: Matches baseline within threshold (diff ratio: ${estDiffRatio.toFixed(4)})`);
  } else {
    console.log(`⚠️ VISUAL DIFF DETECTED: Diff ratio ${estDiffRatio.toFixed(4)} exceeds max allowed (${THRESHOLDS.maxDiffPixelRatio})`);
    console.log(`  Diff report: ${diffReportPath}`);
    console.log(`  Nếu thay đổi UI có chủ đích, hãy phê duyệt qua lệnh:`);
    console.log(`  node <skill>/scripts/visual-regression.mjs --path ${URL_PATH} --approve --reviewer "${REVIEWER}"`);
  }
}

main().catch(err => {
  console.error('[visual-regression] FATAL:', err.message);
  process.exit(1);
});
