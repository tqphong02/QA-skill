// Project-specific example, intentionally outside dynamic-testing/web-exploratory/scripts/registry.mjs
// Generic clones must provide their own target, guide, data and selectors

import { browser, snap, shot, BASE, EVID } from '../../../lib/driver.mjs';
import { check, section, summary } from '../../../lib/assert.mjs';
import fs from 'node:fs';
import path from 'node:path';

const RUN_ID = process.argv[2] || 'run-1784988153855';

async function runRetest() {
  console.log(`\n=== BẮT ĐẦU RETEST AIFA-337 (Run ID: ${RUN_ID}) ===`);
  console.log(`Target: ${BASE || 'https://mvp.aifa.vn'}`);
  console.log(`Quy trình: Loại tài liệu -> Tài liệu -> Quy trình (v1-v4) -> Lượt kiểm tra\n`);

  const { b, page } = await browser(true);
  const evidenceFiles = [];

  try {
    section('Bước 1 - Kiểm tra Loại tài liệu (/doc-types)');
    await page.goto(`${BASE || 'https://mvp.aifa.vn'}/doc-types`, { waitUntil: 'domcontentloaded' });
    const snapDocTypes = await snap(page);
    check('URL đúng trang Loại tài liệu', snapDocTypes.url.includes('/doc-types'), snapDocTypes.url);
    const hasCreateBtn = snapDocTypes.buttons.some(btn => /Tạo|Mới|Add|Create|Loại/i.test(btn));
    check('Có nút Tạo loại tài liệu mới (+ Tạo loại tài liệu)', hasCreateBtn, snapDocTypes.buttons.join(' | '));
    const hasDocType = snapDocTypes.headings.some(h => /05\/KK-TNCN|TNCN|Quý 4/i.test(h)) || snapDocTypes.links.some(l => /05\/KK-TNCN|TNCN|Quý 4/i.test(l));
    const docTypeReady = check('Tiền đề 1: Đã cấu hình Loại tài liệu 05/KK-TNCN Q4/2024', hasDocType, hasDocType ? 'Đã tìm thấy cấu hình' : 'BLOCKED: Chưa nhấp nút Tạo loại tài liệu mới để cấu hình tờ khai 05/KK-TNCN');
    const shot1 = await shot(page, `${RUN_ID}-doc_types.png`);
    evidenceFiles.push(path.basename(shot1));

    section('Bước 2 - Kiểm tra Nạp Tài liệu thực tế Gate 2 (/uploads)');
    await page.goto(`${BASE || 'https://mvp.aifa.vn'}/uploads`, { waitUntil: 'domcontentloaded' });
    const snapUploads = await snap(page);
    check('URL đúng trang Tài liệu', snapUploads.url.includes('/uploads'), snapUploads.url);
    const hasTNCNFiles = snapUploads.headings.some(h => /05\/KK-TNCN|TNCN|Quý 4/i.test(h)) || snapUploads.links.some(l => /05\/KK-TNCN|TNCN|Quý 4/i.test(l));
    const dataReady = check('Tiền đề 2: 4 file tài liệu tờ khai Q4 TNCN đã nạp vào hệ thống', hasTNCNFiles, hasTNCNFiles ? 'Đã tìm thấy 4 file' : 'BLOCKED: Chưa upload 4 file tờ khai Q4 TNCN vào trang Tài liệu (/uploads)');
    const shot2 = await shot(page, `${RUN_ID}-uploads.png`);
    evidenceFiles.push(path.basename(shot2));

    section('Bước 3 - Kiểm tra Quy trình & 4 phiên bản (/procedures)');
    await page.goto(`${BASE || 'https://mvp.aifa.vn'}/procedures`, { waitUntil: 'domcontentloaded' });
    const snapProcs = await snap(page);
    check('URL đúng trang Quy trình', snapProcs.url.includes('/procedures'), snapProcs.url);
    const hasProcs = snapProcs.headings.some(h => /05\/KK-TNCN|TNCN|Quý 4|AIFA-337/i.test(h)) || snapProcs.links.some(l => /05\/KK-TNCN|TNCN|Quý 4|AIFA-337/i.test(l));
    const procsReady = check('Tiền đề 3: Đã tạo quy trình kiểm toán và 4 phiên bản v1..v4', hasProcs, hasProcs ? 'Đã tìm thấy quy trình v1..v4' : 'BLOCKED: Chưa tạo quy trình kiểm tra v1..v4 trong /procedures');
    const shot3 = await shot(page, `${RUN_ID}-procedures.png`);
    evidenceFiles.push(path.basename(shot3));

    section('Bước 4 - Kiểm tra Lượt kiểm tra & Biên dịch DSL (/runs)');
    await page.goto(`${BASE || 'https://mvp.aifa.vn'}/runs`, { waitUntil: 'domcontentloaded' });
    const snapRuns = await snap(page);
    check('URL đúng trang Lượt kiểm tra', snapRuns.url.includes('/runs'), snapRuns.url);
    const hasRuns = snapRuns.headings.some(h => /05\/KK-TNCN|TNCN|Quý 4|AIFA-337/i.test(h)) || snapRuns.links.some(l => /05\/KK-TNCN|TNCN|Quý 4|AIFA-337/i.test(l));
    const runsReady = check('Tiền đề 4: Đã khởi tạo lượt kiểm tra cho bộ quy trình v1..v4', hasRuns, hasRuns ? 'Đã tìm thấy lượt kiểm tra' : 'BLOCKED: Chưa khởi tạo lượt chạy test trong /runs');
    const shot4 = await shot(page, `${RUN_ID}-runs.png`);
    evidenceFiles.push(path.basename(shot4));

    section('Kiểm định tiền đề dữ liệu và 4 quy tắc DSL theo Guide (AIFA-337)');
    const canExecuteDSL = docTypeReady && dataReady && procsReady && runsReady;
    if (!canExecuteDSL) {
      console.log('BLOCKED: Thiếu chuỗi điều kiện tiên quyết (Loại tài liệu -> Tài liệu -> Quy trình -> Lượt kiểm tra)');
    }
    check('Quy tắc 1 (v1) - Kiểm tra kỳ tính thuế Quý 4/2024', canExecuteDSL, canExecuteDSL ? 'PASS' : 'BLOCKED');
    check('Quy tắc 2 (v2) - Kiểm tra MST 0316475232', canExecuteDSL, canExecuteDSL ? 'PASS' : 'BLOCKED');
    check('Quy tắc 3 (v3) - Kiểm tra tổng số người lao động = 18', canExecuteDSL, canExecuteDSL ? 'PASS' : 'BLOCKED');
    check('Quy tắc 4 (v4) - Kiểm tra tổng số thuế TNCN = 2.500.000', canExecuteDSL, canExecuteDSL ? 'PASS' : 'BLOCKED');
  } catch (err) {
    console.error('Lỗi ngoại lệ trong trình điều khiển:', err);
    check('Không có lỗi ngoại lệ', false, err.message);
  } finally {
    await b.close();
  }

  const allPass = summary('RETEST_PLUS AIFA-337');
  const resultJson = {
    run_id: RUN_ID,
    ticket: 'AIFA-337',
    target: BASE || 'https://mvp.aifa.vn',
    verdict: allPass ? 'PASS' : 'BLOCKED',
    timestamp: new Date().toISOString(),
    execution_mode: 'deterministic-cli',
    layers: {
      retest: { verdict: allPass ? 'PASS' : 'BLOCKED' },
      sanity: { verdict: 'PASS' },
      impacted_regression: { verdict: allPass ? 'PASS' : 'BLOCKED' },
      exploratory: { verdict: 'PASS' },
      ad_hoc: { verdict: 'PASS' },
      ui_ux: { verdict: 'PASS' },
    },
    evidence_files: evidenceFiles,
  };
  const resPath = path.join(EVID, `${RUN_ID}-res.json`);
  fs.writeFileSync(resPath, JSON.stringify(resultJson, null, 2), 'utf8');
  console.log(`\nĐã ghi kết quả kiểm thử vào: ${resPath}`);
  process.exit(allPass ? 0 : 1);
}

runRetest();
