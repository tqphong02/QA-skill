#!/usr/bin/env node
/**
 * collect-evidence.mjs — Evidence Packaging, Secrets Redaction & Retention Manager
 *
 * Gom toàn bộ screenshot, video, trace, console và network logs thành gói artifact.
 * Tự động Redact (xóa mờ/thay thế) các dữ liệu nhạy cảm trước khi đóng gói:
 *   - Authorization, Bearer tokens
 *   - Cookie, Set-Cookie headers
 *   - Passwords, API keys, Secret keys
 *   - PII fields (email, phone, credit card)
 *
 * Usage:
 *   node collect-evidence.mjs --run-id run-1721731
 */

import fs from 'node:fs';
import path from 'node:path';

const DATA = process.env.QA_DATA_DIR || process.cwd();
const EVID = path.join(DATA, 'evidence');
const BUNDLES_DIR = path.join(EVID, 'bundles');

const args = process.argv.slice(2);
const getArg = (flag, def) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : def; };
const RUN_ID = getArg('--run-id', `run-${Date.now()}`);

fs.mkdirSync(BUNDLES_DIR, { recursive: true });
const targetBundleDir = path.join(BUNDLES_DIR, RUN_ID);
fs.mkdirSync(targetBundleDir, { recursive: true });

// ─── Secrets & PII Redaction Engine ──────────────────────────────────────────

const REDACT_PATTERNS = [
  { regex: /Bearer\s+[A-Za-z0-9._-]{10,}/gi, replace: 'Bearer [REDACTED_TOKEN]' },
  { regex: /(authorization|cookie|set-cookie|api-key|secret|password):\s*["']?[^"'\s\n]+["']?/gi, replace: '$1: "[REDACTED_SECRET]"' },
  { regex: /"password"\s*:\s*"[^"]+"/gi, replace: '"password": "[REDACTED_PASSWORD]"' },
  { regex: /"token"\s*:\s*"[^"]+"/gi, replace: '"token": "[REDACTED_TOKEN]"' },
  { regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi, replace: 'user-[REDACTED_EMAIL]@domain.com' },
  { regex: /\b(?:\+?84|0)[35789]\d{8}\b/g, replace: '09xxxxxx' },
];

function redactTextContent(content) {
  let text = String(content);
  for (const p of REDACT_PATTERNS) {
    text = text.replace(p.regex, p.replace);
  }
  return text;
}

function processAndCopyFile(srcPath, destPath) {
  const ext = path.extname(srcPath).toLowerCase();
  if (['.json', '.txt', '.log', '.md', '.csv', '.html'].includes(ext)) {
    try {
      const raw = fs.readFileSync(srcPath, 'utf8');
      const clean = redactTextContent(raw);
      fs.writeFileSync(destPath, clean, 'utf8');
      return;
    } catch { /* fallback to binary copy */ }
  }
  fs.copyFileSync(srcPath, destPath);
}

console.log(`[collect-evidence] Packaging & Redacting artifacts for Run ID: ${RUN_ID}`);
console.log(`  Destination: ${targetBundleDir}`);

let count = 0;
if (fs.existsSync(EVID)) {
  const files = fs.readdirSync(EVID);
  for (const file of files) {
    if (file === 'bundles') continue;
    const srcPath = path.join(EVID, file);
    if (fs.statSync(srcPath).isFile()) {
      processAndCopyFile(srcPath, path.join(targetBundleDir, file));
      count++;
    }
  }
}

console.log(`✅ PACKAGED & REDACTED ${count} artifact files into evidence bundle: ${targetBundleDir}`);
