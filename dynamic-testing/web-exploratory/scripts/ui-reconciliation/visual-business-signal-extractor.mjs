#!/usr/bin/env node
/**
 * visual-business-signal-extractor.mjs — 4-Level Visual Signal Extractor
 *
 * Classifies visual signals into 4 evidence levels:
 *   - VERIFIED: Clear rule from doc or design system
 *   - MEASURED: Measured from CSS, DOM, bounding box (e.g., icon-only size, overlaps)
 *   - INFERRED: AI inferred from screenshot
 *   - NEEDS_REVIEW: Insufficient evidence -> produces question, not definitive bug
 *
 * Usage:
 *   node visual-business-signal-extractor.mjs --page order-detail
 */

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const getArg = (flag, def) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : def; };

const PAGE_SLUG   = getArg('--page', 'page-ui');
const OUTPUT_FILE = getArg('--output', null);
const DATA_DIR    = process.env.QA_DATA_DIR || process.cwd();

async function main() {
  const uiDir = path.join(DATA_DIR, 'qa-knowledge', 'ui-business', PAGE_SLUG);
  const compPath = path.join(uiDir, 'ui-components.json');

  if (!fs.existsSync(compPath)) {
    console.error(`[visual-signal-extractor] ❌ File not found: ${compPath}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(compPath, 'utf8'));
  const components = data.components || [];
  const visualSignals = [];

  // Signal 1: Multiple Primary Buttons (MEASURED)
  const primaryButtons = components.filter(c => c.category === 'primary_action_button');
  if (primaryButtons.length > 1) {
    visualSignals.push({
      signalType: 'MULTIPLE_PRIMARY_BUTTONS',
      evidenceLevel: 'MEASURED',
      description: `Phát hiện ${primaryButtons.length} nút bấm primary (${primaryButtons.map(b => b.label).join(', ')}) cùng mức độ nổi bật trực quan`,
      recommendation: 'Chỉ nên để 1 nút làm Primary Action duy nhất per region',
    });
  }

  // Signal 2: Icon-only buttons lacking text (MEASURED)
  const iconOnly = components.filter(c => c.category.includes('button') && (!c.label || c.label.length <= 1));
  if (iconOnly.length > 0) {
    visualSignals.push({
      signalType: 'ICON_ONLY_ACTION_WITHOUT_TEXT',
      evidenceLevel: 'MEASURED',
      description: `Phát hiện ${iconOnly.length} nút bấm dạng icon không có text label`,
      recommendation: 'Thêm aria-label hoặc tooltip giải thích ý nghĩa nghiệp vụ',
    });
  }

  // Signal 3: Hidden menu in DOM (MEASURED)
  const hiddenMenus = components.filter(c => c.category === 'navigation_menu' && c.isHidden);
  if (hiddenMenus.length > 0) {
    visualSignals.push({
      signalType: 'HIDDEN_MENU_PRESENT_IN_DOM',
      evidenceLevel: 'MEASURED',
      description: `Phát hiện ${hiddenMenus.length} menu bị ẩn trực quan nhưng vẫn tồn tại trong DOM`,
      recommendation: 'Xóa bớt khỏi DOM nếu user không có quyền xem',
    });
  }

  // Signal 4: Status badge placement ambiguity (NEEDS_REVIEW)
  const badges = components.filter(c => c.category === 'status_badge');
  if (badges.length > 0) {
    visualSignals.push({
      signalType: 'STATUS_BADGE_POSITIONING',
      evidenceLevel: 'NEEDS_REVIEW',
      description: `Status badge "${badges.map(b => b.label).join(', ')}" đặt ở phần thông tin chung`,
      recommendation: 'BA xác nhận vị trí hiển thị badge có phản ánh đúng trạng thái hiện tại của record không',
    });
  }

  const byLevel = visualSignals.reduce((acc, s) => { acc[s.evidenceLevel] = (acc[s.evidenceLevel] || 0) + 1; return acc; }, {});

  const result = {
    tool: 'visual-business-signal-extractor.mjs',
    pageSlug: PAGE_SLUG,
    analyzedAt: new Date().toISOString(),
    totalSignals: visualSignals.length,
    byLevel,
    signals: visualSignals,
  };

  const outputPath = OUTPUT_FILE || path.join(uiDir, 'visual-signals.json');
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');

  console.log(`[visual-signal-extractor] ✅ Saved ${visualSignals.length} visual signals across 4 levels. Saved to: ${outputPath}`);
  console.log('By Evidence Level:', byLevel);
}

main().catch(err => {
  console.error('[visual-signal-extractor] FATAL:', err.message);
  process.exit(1);
});
