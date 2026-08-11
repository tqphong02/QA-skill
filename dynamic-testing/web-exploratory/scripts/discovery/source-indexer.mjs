#!/usr/bin/env node
/**
 * source-indexer.mjs — Source Code Symbol Indexer (Multi-Parser Strategy)
 *
 * Parser Strategy (tự động detect và ghi lại trong output):
 *   - TypeScript (.ts/.tsx) → ts-morph nếu có (npm i ts-morph), fallback Regex
 *   - JavaScript (.js/.jsx/.mjs) → @babel/parser nếu có (npm i @babel/parser), fallback Regex
 *   - Mỗi file ghi "parser": "ts-morph"|"babel"|"regex-fallback" và "fallbackUsed": bool
 *
 * Quality Metrics (trong output JSON):
 *   filesScanned, filesParsedByAst, filesParsedByFallback, parseFailures,
 *   astCoverage, routesExtracted, symbolsByKind, unresolvedReferences
 *
 * Usage:
 *   node source-indexer.mjs --repo /path/to/project
 *   node source-indexer.mjs --repo . --output qa-knowledge/repositories/my-repo/symbol-index.json
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const args    = process.argv.slice(2);
const getArg  = (flag, def) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : def; };

const REPO_PATH   = path.resolve(getArg('--repo', '.'));
const OUTPUT_FILE = getArg('--output', null);
const MAX_FILE_SIZE = 150 * 1024;

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

// ─── Parser availability ──────────────────────────────────────────────────────

let tsMorphAvailable = false;
let babelParserAvailable = false;
try { require.resolve('ts-morph'); tsMorphAvailable = true; } catch {}
try { require.resolve('@babel/parser'); babelParserAvailable = true; } catch {}

// ─── Regex extractor (Fallback) ───────────────────────────────────────────────

function extractWithRegex(content, relativePath, parserLabel = 'regex-fallback') {
  const symbols = [];
  const lines = content.split('\n');

  lines.forEach((line, i) => {
    const lineNum = i + 1;
    const trim = line.trim();
    let m;

    if ((m = trim.match(/^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/)))
      symbols.push({ kind: 'class', name: m[1], file: relativePath, line: lineNum, parser: parserLabel });

    if ((m = trim.match(/^(?:export\s+)?interface\s+(\w+)/)))
      symbols.push({ kind: 'interface', name: m[1], file: relativePath, line: lineNum, parser: parserLabel });

    if ((m = trim.match(/^(?:export\s+)?enum\s+(\w+)/))) {
      const enumSymbol = { kind: 'enum', name: m[1], file: relativePath, line: lineNum, values: [], parser: parserLabel };
      for (let j = i + 1; j < Math.min(i + 50, lines.length); j++) {
        const vLine = lines[j].trim();
        if (vLine === '}') break;
        const val = vLine.match(/^(\w+)/);
        if (val) enumSymbol.values.push(val[1]);
      }
      symbols.push(enumSymbol);
    }

    if ((m = trim.match(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/)))
      symbols.push({ kind: 'function', name: m[1], file: relativePath, line: lineNum, parser: parserLabel });

    if ((m = trim.match(/^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\(/)))
      symbols.push({ kind: 'function', name: m[1], file: relativePath, line: lineNum, parser: parserLabel });

    if ((m = trim.match(/@(Controller|Get|Post|Put|Patch|Delete|Injectable|Module|Guard|Interceptor|Middleware|EventPattern|MessagePattern|ApiTags|Roles|UseGuards)\(['"]?([^'")\s]*)/)))
      symbols.push({ kind: 'decorator', name: m[1], value: m[2] || '', file: relativePath, line: lineNum, parser: parserLabel });

    if ((m = line.match(/\.(get|post|put|patch|delete|use)\s*\(\s*['"`]([^'"`]+)['"`]/i)))
      symbols.push({ kind: 'route', method: m[1].toUpperCase(), path: m[2], file: relativePath, line: lineNum, parser: parserLabel });

    if (/@Entity\(/.test(trim) || /@Schema\(/.test(trim))
      symbols.push({ kind: 'db_model', name: '', file: relativePath, line: lineNum, parser: parserLabel });

    if ((m = trim.match(/const\s+(\w+Schema)\s*=\s*z\.(object|string|number)/)))
      symbols.push({ kind: 'validation_schema', name: m[1], library: 'zod', file: relativePath, line: lineNum, parser: parserLabel });

    if ((m = line.match(/throw\s+new\s+\w+\(['"`]([^'"`]{5,120})['"`]/)))
      symbols.push({ kind: 'error_message', message: m[1], file: relativePath, line: lineNum, parser: parserLabel });
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
    if (e.isDirectory()) walkDir(fullPath, onFile, depth + 1);
    else if (e.isFile()) {
      if (SKIP_FILE_PATTERNS.some(p => p.test(e.name))) continue;
      if (['.ts', '.tsx', '.js', '.jsx', '.mjs'].some(ext => e.name.endsWith(ext))) onFile(fullPath);
    }
  }
}

async function main() {
  if (!fs.existsSync(REPO_PATH)) {
    console.error(`[source-indexer] ❌ Repo path không tồn tại: ${REPO_PATH}`);
    process.exit(1);
  }

  console.log(`[source-indexer] Scanning: ${REPO_PATH}`);
  console.log(`[source-indexer] Parsers: ts-morph=${tsMorphAvailable} babel=${babelParserAvailable}`);

  const allSymbols = [];
  const fileIndex = [];
  let fileCount = 0, filesParsedByAst = 0, filesParsedByFallback = 0, parseFailures = 0;

  walkDir(REPO_PATH, (filePath) => {
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_FILE_SIZE) return;

    const relativePath = path.relative(REPO_PATH, filePath);
    const ext = path.extname(filePath);
    let content;
    try { content = fs.readFileSync(filePath, 'utf8'); } catch { parseFailures++; return; }

    const hash = crypto.createHash('md5').update(content).digest('hex').slice(0, 8);
    let symbols = [];
    let parserUsed = 'regex-fallback';
    let fallbackUsed = true;
    const parseErrors = [];

    // ts-morph for TypeScript
    if ((ext === '.ts' || ext === '.tsx') && tsMorphAvailable) {
      try {
        const { Project } = require('ts-morph');
        const project = new Project({ useInMemoryFileSystem: true, skipAddingFilesFromTsConfig: true });
        const sf = project.createSourceFile(relativePath, content);
        sf.getClasses().forEach(c => symbols.push({ kind: 'class', name: c.getName() || '', file: relativePath, line: c.getStartLineNumber(), parser: 'ts-morph' }));
        sf.getInterfaces().forEach(i => symbols.push({ kind: 'interface', name: i.getName(), file: relativePath, line: i.getStartLineNumber(), parser: 'ts-morph' }));
        sf.getEnums().forEach(e => symbols.push({ kind: 'enum', name: e.getName(), values: e.getMembers().map(m => m.getName()), file: relativePath, line: e.getStartLineNumber(), parser: 'ts-morph' }));
        sf.getFunctions().forEach(f => symbols.push({ kind: 'function', name: f.getName() || '(anon)', file: relativePath, line: f.getStartLineNumber(), parser: 'ts-morph' }));
        // Decorators/routes via regex supplement
        symbols.push(...extractWithRegex(content, relativePath, 'ts-morph+regex').filter(s => ['decorator', 'route', 'error_message', 'validation_schema', 'db_model'].includes(s.kind)));
        parserUsed = 'ts-morph'; fallbackUsed = false; filesParsedByAst++;
      } catch (err) {
        parseErrors.push(err.message.slice(0, 120));
        symbols = extractWithRegex(content, relativePath); filesParsedByFallback++;
      }
    // Babel for JavaScript
    } else if ((ext === '.js' || ext === '.jsx' || ext === '.mjs') && babelParserAvailable) {
      try {
        const babel = require('@babel/parser');
        const ast = babel.parse(content, {
          sourceType: 'module',
          plugins: ['jsx', 'typescript', 'decorators-legacy', 'classProperties'],
          errorRecovery: true,
        });
        function walkAST(node) {
          if (!node || typeof node !== 'object') return;
          if (node.type === 'ClassDeclaration' && node.id)
            symbols.push({ kind: 'class', name: node.id.name, file: relativePath, line: node.loc?.start?.line, parser: 'babel' });
          if ((node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') && node.id)
            symbols.push({ kind: 'function', name: node.id.name, file: relativePath, line: node.loc?.start?.line, parser: 'babel' });
          if (node.type === 'TSEnumDeclaration' && node.id)
            symbols.push({ kind: 'enum', name: node.id.name, values: (node.members || []).map(m => m.id?.name || ''), file: relativePath, line: node.loc?.start?.line, parser: 'babel' });
          for (const key of Object.keys(node)) {
            if (key === 'parent') continue;
            const child = node[key];
            if (Array.isArray(child)) child.forEach(walkAST);
            else if (child && typeof child === 'object' && child.type) walkAST(child);
          }
        }
        walkAST(ast.program);
        symbols.push(...extractWithRegex(content, relativePath, 'babel+regex').filter(s => ['decorator', 'route', 'error_message', 'validation_schema', 'db_model'].includes(s.kind)));
        parserUsed = 'babel'; fallbackUsed = false; filesParsedByAst++;
      } catch (err) {
        parseErrors.push(err.message.slice(0, 120));
        symbols = extractWithRegex(content, relativePath); filesParsedByFallback++;
      }
    } else {
      symbols = extractWithRegex(content, relativePath);
      filesParsedByFallback++;
    }

    fileIndex.push({ file: relativePath, hash, parser: parserUsed, fallbackUsed, parseErrors, symbols: symbols.length, size: stat.size });
    allSymbols.push(...symbols);
    fileCount++;
    if (fileCount % 50 === 0) process.stdout.write(`[source-indexer] Scanned ${fileCount} files...\r`);
  });

  const byKind = {};
  for (const s of allSymbols) byKind[s.kind] = (byKind[s.kind] || 0) + 1;

  const qualityReport = {
    filesScanned: fileCount,
    filesParsedByAst,
    filesParsedByFallback,
    parseFailures,
    astCoverage: fileCount > 0 ? `${Math.round((filesParsedByAst / fileCount) * 100)}%` : '0%',
    routesExtracted: (byKind['route'] || 0) + (byKind['decorator'] || 0),
    symbolsByKind: byKind,
    unresolvedReferences: fileIndex.filter(f => f.parseErrors.length > 0).length,
    parsersAvailable: { 'ts-morph': tsMorphAvailable, babel: babelParserAvailable },
    note: !tsMorphAvailable && !babelParserAvailable
      ? 'All files parsed by regex fallback. Run: npm i ts-morph @babel/parser in the dynamic-web-exploratory dir for AST accuracy.'
      : null,
  };

  const index = {
    tool: 'source-indexer.mjs',
    repoPath: REPO_PATH,
    scannedAt: new Date().toISOString(),
    totalFiles: fileCount,
    totalSymbols: allSymbols.length,
    qualityReport,
    files: fileIndex,
    symbols: allSymbols,
  };

  if (OUTPUT_FILE) {
    fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(index, null, 2), 'utf8');
    console.log(`[source-indexer] ✅ Saved to: ${OUTPUT_FILE}`);
  } else {
    console.log(JSON.stringify({ ...index, symbols: `(${allSymbols.length})`, files: `(${fileIndex.length} files)` }, null, 2));
  }

  console.log(`\n[source-indexer] ✅ ${fileCount} files | ${allSymbols.length} symbols`);
  console.log(`Quality: AST ${qualityReport.astCoverage} (${filesParsedByAst} AST / ${filesParsedByFallback} regex / ${parseFailures} failed)`);
  if (qualityReport.note) console.warn(`[source-indexer] ⚠️  ${qualityReport.note}`);
}

main().catch(err => {
  console.error('[source-indexer] FATAL:', err.message);
  process.exit(1);
});
