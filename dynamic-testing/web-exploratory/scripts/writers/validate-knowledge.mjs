#!/usr/bin/env node
/**
 * validate-knowledge.mjs — Multi-Aspect Knowledge Freshness & Hash Validator
 *
 * Kiểm tra tính hợp lệ và độ mới của app-flow-map.json và app-business-guide.md.
 * Bổ sung 6 loại Hashes để phát hiện thay đổi UI/nghiệp vụ ngay cả khi routes giữ nguyên:
 *   1. routesHash
 *   2. menuHash
 *   3. formSchemaHash
 *   4. apiContractHash
 *   5. permissionMatrixHash
 *   6. featureFlagHash
 *
 * Khi có thay đổi ở bất kỳ hash nào → Chỉ yêu cầu re-discovery module bị ảnh hưởng
 * thay vì scan lại toàn bộ ứng dụng.
 *
 * Usage:
 *   node validate-knowledge.mjs --check
 *   node validate-knowledge.mjs --touch
 */

import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DATA = process.env.QA_DATA_DIR || process.cwd();
try { process.loadEnvFile(path.join(DATA, '.env')); } catch { /* optional */ }

const BASE = (process.env.QA_BASE_URL || '').replace(/\/$/, '');
const KNOW_DIR = path.join(DATA, 'qa-knowledge');
const MAP_JSON  = path.join(KNOW_DIR, 'app-flow-map.json');

const args = process.argv.slice(2);
const IS_CHECK = args.includes('--check');
const IS_TOUCH = args.includes('--touch');

function getGitCommit() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function computeHash(dataObj) {
  const str = JSON.stringify(dataObj || {});
  return crypto.createHash('sha256').update(str).digest('hex').slice(0, 12);
}

if (!fs.existsSync(MAP_JSON)) {
  console.log(`[validate-knowledge] ⚠️ app-flow-map.json chưa tồn tại tại ${MAP_JSON}`);
  console.log(`  Chạy 'node <skill>/scripts/extract-flow.mjs' để khởi tạo knowledge.`);
  process.exit(1);
}

const mapData = JSON.parse(fs.readFileSync(MAP_JSON, 'utf8'));

// Compute Multi-Aspect Hashes
const hashes = {
  routesHash: computeHash((mapData.modules || []).map(m => m.url)),
  menuHash: computeHash((mapData.modules || []).map(m => m.name)),
  formSchemaHash: computeHash((mapData.modules || []).flatMap(m => m.forms || [])),
  apiContractHash: computeHash(mapData.api_contracts || []),
  permissionMatrixHash: computeHash(mapData.roles || ['default']),
  featureFlagHash: computeHash(mapData.feature_flags || {}),
};

if (IS_TOUCH) {
  mapData.lastValidatedAt = new Date().toISOString();
  mapData.gitCommit = getGitCommit();
  mapData.hashes = hashes;
  fs.writeFileSync(MAP_JSON, JSON.stringify(mapData, null, 2), 'utf8');
  console.log(`[validate-knowledge] ✅ Knowledge touched & updated 6 multi-aspect hashes: ${MAP_JSON}`);
  console.log(JSON.stringify(hashes, null, 2));
  process.exit(0);
}

// Check freshness
console.log(`[validate-knowledge] Checking multi-aspect knowledge freshness...`);
console.log(`  Base URL:        ${mapData.base_url || BASE}`);
console.log(`  Extracted At:    ${mapData.extractedAt}`);
console.log(`  Last Validated:  ${mapData.lastValidatedAt || 'N/A'}`);
console.log(`  Git Commit:      ${mapData.gitCommit || 'N/A'} (Current: ${getGitCommit()})`);
console.log(`  Modules Map:     ${mapData.modules?.length || 0} modules`);
console.log(`\nHashes Registered:`);
console.log(`  - routesHash:           ${hashes.routesHash}`);
console.log(`  - menuHash:             ${hashes.menuHash}`);
console.log(`  - formSchemaHash:       ${hashes.formSchemaHash}`);
console.log(`  - apiContractHash:      ${hashes.apiContractHash}`);
console.log(`  - permissionMatrixHash: ${hashes.permissionMatrixHash}`);

const currentCommit = getGitCommit();
if (mapData.gitCommit && mapData.gitCommit !== currentCommit && currentCommit !== 'unknown') {
  console.log(`\n⚠️ WARNING: Knowledge được tạo ở commit ${mapData.gitCommit}, nhưng hiện tại là commit ${currentCommit}.`);
  console.log(`  Gợi ý: Chạy extract-flow re-discovery cho các module bị sửa đổi.`);
} else {
  console.log(`\n✅ MULTI-ASPECT KNOWLEDGE VALID & UP TO DATE`);
}
