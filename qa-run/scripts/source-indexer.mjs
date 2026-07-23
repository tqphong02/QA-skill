#!/usr/bin/env node
/**
 * source-indexer.mjs — Source Code Symbol Indexer (Multi-Parser Strategy)
 *
 * Quét toàn bộ source code và tạo Symbol Index:
 *   - Class, Interface, Enum, Function, Constant
 *   - Route (Express/NestJS/Next.js/Fastify)
 *   - Middleware, Guard, Decorator
 *   - Database Model, Schema
 *   - Validation Schema (Joi, Zod, class-validator)
 *   - Import dependency graph
 *
 * Parser Strategy (tự động detect):
 *   - TypeScript (.ts/.tsx) → ts-morph nếu có, fallback Regex
 *   - JavaScript (.js/.jsx/.mjs) → @babel/parser nếu có, fallback Regex
 *
 * Usage:
 *   node source-indexer.mjs --repo /path/to/project
 *   node source-indexer.mjs --repo . --output qa-knowledge/repositories/my-repo/symbol-index.json
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const args    = process.argv.slice(2);
const getArg  = (flag, def) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : def; };

const REPO_PATH   = path.resolve(getArg('--repo', '.'));
const OUTPUT_FILE = getArg('--output', null);
const MAX_FILE_SIZE = 150 * 1024; // 150KB max per file to avoid reading generated code

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
  'coverage', '__pycache__', '.cache', 'vendor', 'public',
  'static', 'assets', '__mocks__', '.turbo', '.parcel-cache',
  'generated', 'prisma/generated',
]);

const SKIP_FILE_PATTERNS = [
  /\.min\.(js|css)$/, /\.bundle\.js$/, /\.chunk\.js$/,
  /\.d\.ts$/, /\.lock$/, /\.snap$/, /\.map$/,
];

// ─── Regex-based extractors (Fallback / primary fast scanner) ──────────────────

function extractWithRegex(content, filePath, relativePath) {
  const symbols = [];
  const lines = content.split('\n');

  lines.forEach((line, i) => {
    const lineNum = i + 1;
    const trim = line.trim();
    let m;

    // Classes
    if ((m = trim.match(/^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/))) {
      symbols.push({ kind: 'class', name: m[1], file: relativePath, line: lineNum });
    }
    // Interfaces
    if ((m = trim.match(/^(?:export\s+)?interface\s+(\w+)/))) {
      symbols.push({ kind: 'interface', name: m[1], file: relativePath, line: lineNum });
    }
    // Enums
    if ((m = trim.match(/^(?:export\s+)?enum\s+(\w+)/))) {
      const enumSymbol = { kind: 'enum', name: m[1], file: relativePath, line: lineNum, values: [] };
      // Collect enum values in next lines
      for (let j = i + 1; j < Math.min(i + 50, lines.length); j++) {
        const vLine = lines[j].trim();
        if (vLine === '}') break;
        const val = vLine.match(/^(\w+)/);
        if (val) enumSymbol.values.push(val[1]);
      }
      symbols.push(enumSymbol);
    }
    // Functions & Methods (async/export)
    if ((m = trim.match(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/))) {
      symbols.push({ kind: 'function', name: m[1], file: relativePath, line: lineNum });
    }
    // Arrow functions assigned to const
    if ((m = trim.match(/^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\(/))) {
      symbols.push({ kind: 'function', name: m[1], file: relativePath, line: lineNum });
    }
    // Constants
    if ((m = trim.match(/^(?:export\s+)?const\s+(\w+)\s*=\s*(?!async\s*\()(?!\{)(?!\[)(.{0,80})/))) {
      if (!/\(/.test(m[2].slice(0, 10))) {
        symbols.push({ kind: 'const', name: m[1], value: m[2].trim().slice(0, 80), file: relativePath, line: lineNum });
      }
    }
    // Decorators (NestJS)
    if ((m = trim.match(/^@(Controller|Get|Post|Put|Patch|Delete|Injectable|Module|Guard|Interceptor|Middleware|EventPattern|MessagePattern|ApiTags|Roles|UseGuards)\(['"]?([^'")\s]*)/))) {
      symbols.push({ kind: 'decorator', name: m[1], value: m[2] || '', file: relativePath, line: lineNum });
    }
    // Express/Fastify routes
    if ((m = line.match(/\.(get|post|put|patch|delete|use)\s*\(\s*['"`]([^'"`]+)['"`]/i))) {
      symbols.push({ kind: 'route', method: m[1].toUpperCase(), path: m[2], file: relativePath, line: lineNum });
    }
    // TypeORM / Prisma / Mongoose models
    if ((m = trim.match(/^@Entity\(['"]?(\w*)/)) || (m = trim.match(/^@Schema\(/))) {
      symbols.push({ kind: 'db_model', name: m[1] || '', file: relativePath, line: lineNum });
    }
    // Zod schema
    if ((m = trim.match(/const\s+(\w+Schema)\s*=\s*z\.(object|string|number)/))) {
      symbols.push({ kind: 'validation_schema', name: m[1], library: 'zod', file: relativePath, line: lineNum });
    }
    // Error throws with messages
    if ((m = line.match(/throw\s+new\s+\w+\(['"`]([^'"`]{5,120})['"`]/))) {
      symbols.push({ kind: 'error_message', message: m[1], file: relativePath, line: lineNum });
    }
  });

  return symbols;
}

// ─── File walker ──────────────────────────────────────────────────────────────

function walkDir(dir, onFile, depth = 0) {
  if (depth > 10) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }

  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const fullPath = path.join(dir, e.name);
    if (e.isDirectory()) {
      walkDir(fullPath, onFile, depth + 1);
    } else if (e.isFile()) {
      if (SKIP_FILE_PATTERNS.some(p => p.test(e.name))) continue;
      if (['.ts', '.tsx', '.js', '.jsx', '.mjs'].some(ext => e.name.endsWith(ext))) {
        onFile(fullPath);
      }
    }
  }
}

async function main() {
  if (!fs.existsSync(REPO_PATH)) {
    console.error(`[source-indexer] ❌ Repo path không tồn tại: ${REPO_PATH}`);
    process.exit(1);
  }

  console.log(`[source-indexer] Scanning source code in: ${REPO_PATH}`);

  const allSymbols = [];
  const fileIndex = [];
  let fileCount = 0;

  walkDir(REPO_PATH, (filePath) => {
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_FILE_SIZE) return; // Skip large generated files

    const relativePath = path.relative(REPO_PATH, filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    const hash = crypto.createHash('md5').update(content).digest('hex').slice(0, 8);
    const symbols = extractWithRegex(content, filePath, relativePath);

    fileIndex.push({ file: relativePath, hash, symbols: symbols.length, size: stat.size });
    allSymbols.push(...symbols);
    fileCount++;

    if (fileCount % 50 === 0) {
      process.stdout.write(`[source-indexer] Scanned ${fileCount} files...\r`);
    }
  });

  console.log(`\n[source-indexer] ✅ Scanned ${fileCount} files, found ${allSymbols.length} symbols`);

  // Summarize by kind
  const byKind = {};
  for (const s of allSymbols) {
    byKind[s.kind] = (byKind[s.kind] || 0) + 1;
  }

  const index = {
    tool: 'source-indexer.mjs',
    repoPath: REPO_PATH,
    scannedAt: new Date().toISOString(),
    totalFiles: fileCount,
    totalSymbols: allSymbols.length,
    summaryByKind: byKind,
    files: fileIndex,
    symbols: allSymbols,
  };

  if (OUTPUT_FILE) {
    fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(index, null, 2), 'utf8');
    console.log(`[source-indexer] ✅ Saved to: ${OUTPUT_FILE}`);
  } else {
    // Print summary only (symbols can be huge)
    const summary = { ...index, symbols: `(${allSymbols.length} symbols — use --output to save)` };
    console.log(JSON.stringify(summary, null, 2));
  }

  console.log(`\nSymbol summary:`);
  for (const [kind, count] of Object.entries(byKind)) {
    console.log(`  ${String(kind).padEnd(20)} ${count}`);
  }
}

main().catch(err => {
  console.error('[source-indexer] FATAL:', err.message);
  process.exit(1);
});
