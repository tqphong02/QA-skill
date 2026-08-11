#!/usr/bin/env node
/**
 * business-rule-extractor.mjs — Business Rule Detector from Source Code
 *
 * Phát hiện và trích xuất Business Rules từ source code:
 *   - if/else/switch conditions có ý nghĩa nghiệp vụ
 *   - Validation decorators (class-validator, Joi, Zod)
 *   - Guard, Middleware permission checks
 *   - Error messages / throw statements
 *   - Enum values (status, type, role...)
 *   - State transitions / conditional updates
 *   - Feature flags
 *   - Retry policies, timeout, rate limit
 *
 * Đầu ra: business-rules.json với mỗi rule có:
 *   ruleId, module, category, condition, failureResult, source, confidence
 *
 * Usage:
 *   node business-rule-extractor.mjs --repo /path/to/project
 *   node business-rule-extractor.mjs --repo . --output qa-knowledge/repositories/my-repo/business-rules.json
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const args   = process.argv.slice(2);
const getArg = (flag, def) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : def; };

const REPO_PATH   = path.resolve(getArg('--repo', '.'));
const OUTPUT_FILE = getArg('--output', null);
const MAX_FILE_SIZE = 150 * 1024;

function runAstGrepRules(repoPath) {
  const astRules = [];
  try {
    const patterns = [
      { category: 'state_transition', pattern: '$ENTITY.status = $STATUS' },
      { category: 'permission', pattern: 'if (!$USER.hasRole($ROLE)) { $$$ }' },
      { category: 'existence_check', pattern: 'if (!$ENTITY) { throw new $ERR($$$) }' },
    ];
    for (const item of patterns) {
      const res = spawnSync('npx', ['-y', '@ast-grep/cli', 'run', '--pattern', item.pattern, '--json', repoPath], {
        encoding: 'utf8',
        timeout: 5000,
      });
      if (res.status === 0 && res.stdout) {
        const matches = JSON.parse(res.stdout);
        for (const m of (Array.isArray(matches) ? matches : [])) {
          astRules.push({
            ruleId: `AST-${item.category.toUpperCase()}-${crypto.randomBytes(3).toString('hex')}`,
            module: m.file ? path.dirname(m.file) : 'core',
            category: item.category,
            condition: (m.text || item.pattern).trim().slice(0, 150),
            source: m.file || 'ast-grep',
            confidence: 'verified',
            extractedBy: 'ast-grep (AST Structural)',
          });
        }
      }
    }
  } catch {
    // Fallback to regex scanner
  }
  return astRules;
}

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
  'coverage', '__mocks__', 'vendor', 'generated',
]);

// ─── Rule Pattern Categories ──────────────────────────────────────────────────

const RULE_PATTERNS = [
  // Permission / Authorization checks
  {
    category: 'permission',
    confidence: 'verified',
    patterns: [
      /if\s*\(!?user\.(?:role|permission|isAdmin|hasRole|can)/i,
      /throw.*(?:ForbiddenException|UnauthorizedException|AccessDeniedException)/,
      /@Roles\(['"`]([^'"`]+)/,
      /@UseGuards\(/,
      /hasPermission|checkPermission|assertPermission/i,
    ],
    extract: (line) => ({
      condition: line.trim().replace(/\s+/g, ' ').slice(0, 150),
      failureResult: 'Từ chối truy cập / Unauthorized',
    }),
  },
  // Balance / Amount validation
  {
    category: 'financial',
    confidence: 'verified',
    patterns: [
      /(?:balance|amount|price|total|fee|credit|debit)\s*[<>]=?\s*(?:amount|balance|price|\d)/i,
      /Insufficient\s+(?:funds?|balance|credit)|insufficient_funds|balance.*not.*enough/i,
    ],
    extract: (line) => ({
      condition: line.trim().replace(/\s+/g, ' ').slice(0, 150),
      failureResult: 'Từ chối giao dịch do không đủ số dư',
    }),
  },
  // Status transition rules
  {
    category: 'state_transition',
    confidence: 'verified',
    patterns: [
      /status\s*(?:!==?|===?|!?=)\s*['"`]?(PENDING|APPROVED|REJECTED|COMPLETED|DRAFT|ACTIVE|INACTIVE|CANCELLED|PROCESSING)/i,
      /\.status\s*===?\s*\w+/,
      /throw.*InvalidStatusTransition|cannot.*status/i,
    ],
    extract: (line) => ({
      condition: line.trim().replace(/\s+/g, ' ').slice(0, 150),
      failureResult: 'Không hợp lệ — sai trạng thái',
    }),
  },
  // Existence / Not found
  {
    category: 'existence_check',
    confidence: 'verified',
    patterns: [
      /throw.*(?:NotFoundException|NotFoundError|EntityNotFound)/,
      /if\s*\(\s*!\s*\w+\s*\)\s*(?:throw|return)/,
    ],
    extract: (line) => ({
      condition: line.trim().replace(/\s+/g, ' ').slice(0, 150),
      failureResult: 'Trả lỗi 404 / Not Found',
    }),
  },
  // Duplicate / uniqueness
  {
    category: 'uniqueness',
    confidence: 'verified',
    patterns: [
      /DuplicateException|already.*exist|is.*taken/i,
      /UNIQUE.*constraint|unique.*violation/i,
    ],
    extract: (line) => ({
      condition: line.trim().replace(/\s+/g, ' ').slice(0, 150),
      failureResult: 'Từ chối do dữ liệu đã tồn tại',
    }),
  },
  // Rate limit / throttle
  {
    category: 'rate_limit',
    confidence: 'inferred',
    patterns: [
      /@Throttle|RateLimit|TooManyRequests|throttle/i,
      /retry.*attempt|maxRetries|retryCount/i,
    ],
    extract: (line) => ({
      condition: line.trim().replace(/\s+/g, ' ').slice(0, 150),
      failureResult: 'Tạm khóa do vượt giới hạn request',
    }),
  },
  // Input validation
  {
    category: 'input_validation',
    confidence: 'verified',
    patterns: [
      /@IsNotEmpty|@IsEmail|@IsNumber|@Min\(|@Max\(|@Length\(|@IsString|@IsEnum/,
      /z\.string\(\)|z\.number\(\)|z\.email\(\)|Joi\.string\(\)/,
      /\.required\(\)|\.min\(|\.max\(|\.email\(/,
    ],
    extract: (line) => ({
      condition: line.trim().replace(/\s+/g, ' ').slice(0, 150),
      failureResult: 'Từ chối do dữ liệu đầu vào không hợp lệ',
    }),
  },
  // Feature flag
  {
    category: 'feature_flag',
    confidence: 'inferred',
    patterns: [
      /featureFlag|feature_flag|isEnabled|isFeatureEnabled|FEATURE_/i,
    ],
    extract: (line) => ({
      condition: line.trim().replace(/\s+/g, ' ').slice(0, 150),
      failureResult: 'Tính năng chưa được bật / Feature disabled',
    }),
  },
];

function generateRuleId(category, file, line) {
  const hash = crypto.createHash('md5').update(`${file}:${line}`).digest('hex').slice(0, 6).toUpperCase();
  return `${category.toUpperCase().replace(/_/g, '_')}_${hash}`;
}

function getModuleFromPath(relativePath) {
  const parts = relativePath.replace(/\\/g, '/').split('/');
  // NestJS module convention: src/<module>/<module>.service.ts
  const srcIdx = parts.indexOf('src');
  if (srcIdx !== -1 && parts[srcIdx + 1]) return parts[srcIdx + 1];
  if (parts.length >= 2) return parts[parts.length - 2];
  return 'unknown';
}

function walkDir(dir, onFile, depth = 0) {
  if (depth > 10) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }

  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const fullPath = path.join(dir, e.name);
    if (e.isDirectory()) {
      walkDir(fullPath, onFile, depth + 1);
    } else if (e.isFile() && /\.(ts|js|tsx|jsx|mjs)$/.test(e.name) && !e.name.endsWith('.spec.ts') && !e.name.endsWith('.test.ts')) {
      const stat = fs.statSync(fullPath);
      if (stat.size < MAX_FILE_SIZE) onFile(fullPath);
    }
  }
}

async function main() {
  if (!fs.existsSync(REPO_PATH)) {
    console.error(`[business-rule-extractor] ❌ Repo path không tồn tại: ${REPO_PATH}`);
    process.exit(1);
  }

  console.log(`[business-rule-extractor] Extracting business rules from: ${REPO_PATH}`);

  const rules = [];
  let fileCount = 0;

  walkDir(REPO_PATH, (filePath) => {
    const relativePath = path.relative(REPO_PATH, filePath);
    const module = getModuleFromPath(relativePath);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    lines.forEach((line, i) => {
      const lineNum = i + 1;
      if (/^\s*(?:import\b|export\s+(?:declare\s+)?class\b|class\b)/.test(line)) return;

      for (const rulePattern of RULE_PATTERNS) {
        const matched = rulePattern.patterns.some(p => p.test(line));
        if (!matched) continue;

        const extracted = rulePattern.extract(line);
        if (!extracted.condition || extracted.condition.length < 5) continue;

        rules.push({
          ruleId: generateRuleId(rulePattern.category, relativePath, lineNum),
          module,
          category: rulePattern.category,
          condition: extracted.condition,
          failureResult: extracted.failureResult,
          source: `${relativePath}:${lineNum}`,
          confidence: rulePattern.confidence,
        });
      }
    });

    fileCount++;
  });

  // Remove near-duplicates (same condition in same module)
  const seen = new Set();
  const uniqueRules = rules.filter(r => {
    const key = `${r.module}:${r.category}:${r.condition.slice(0, 60)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`[business-rule-extractor] ✅ Scanned ${fileCount} files, found ${uniqueRules.length} business rules`);

  // Group by category
  const byCategory = {};
  for (const r of uniqueRules) {
    byCategory[r.category] = (byCategory[r.category] || 0) + 1;
  }

  const output = {
    tool: 'business-rule-extractor.mjs',
    repoPath: REPO_PATH,
    extractedAt: new Date().toISOString(),
    totalRules: uniqueRules.length,
    summaryByCategory: byCategory,
    rules: uniqueRules,
  };

  if (OUTPUT_FILE) {
    fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf8');
    console.log(`[business-rule-extractor] ✅ Saved to: ${OUTPUT_FILE}`);
  } else {
    console.log(JSON.stringify(output, null, 2));
  }

  console.log('\nRules by category:');
  for (const [cat, count] of Object.entries(byCategory)) {
    console.log(`  ${String(cat).padEnd(22)} ${count}`);
  }
}

main().catch(err => {
  console.error('[business-rule-extractor] FATAL:', err.message);
  process.exit(1);
});
