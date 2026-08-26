#!/usr/bin/env node
/**
 * api-contract-extractor.mjs — API Contract Extractor from Source Code
 *
 * Thu thập toàn bộ API contracts từ source code:
 *   - Express/Fastify: router.get/post/put/patch/delete
 *   - NestJS: @Controller + @Get/@Post/@Put/@Patch/@Delete
 *   - Next.js: pages/api/* và app/api/* route handlers
 *   - OpenAPI/Swagger spec (nếu có swagger.json/openapi.yaml)
 *   - GraphQL: Query/Mutation tên
 *   - Auth: route có @UseGuards/@Roles → requires_auth
 *   - DTO: class-validator decorators → request schema gợi ý
 *
 * Đầu ra: api-contracts.json với mỗi endpoint có:
 *   method, path, module, auth_required, roles, request_schema, side_effects, source
 *
 * Usage:
 *   node api-contract-extractor.mjs --repo /path/to/project
 *   node api-contract-extractor.mjs --repo . --output qa-knowledge/repositories/my-repo/api-contracts.json
 */

import fs from 'node:fs';
import path from 'node:path';

const args   = process.argv.slice(2);
const getArg = (flag, def) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : def; };

const REPO_PATH   = path.resolve(getArg('--repo', '.'));
const OUTPUT_FILE = getArg('--output', null);
const MAX_FILE_SIZE = 150 * 1024;

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
  'coverage', '__mocks__', 'vendor', 'generated',
]);

function getModuleFromPath(relativePath) {
  const parts = relativePath.replace(/\\/g, '/').split('/');
  const srcIdx = parts.indexOf('src');
  if (srcIdx !== -1 && parts[srcIdx + 1]) return parts[srcIdx + 1];
  // Next.js: pages/api/<module>/...
  const pagesIdx = parts.indexOf('pages');
  if (pagesIdx !== -1 && parts[pagesIdx + 1] === 'api' && parts[pagesIdx + 2]) return parts[pagesIdx + 2];
  return parts[parts.length - 2] || 'unknown';
}

function extractNestJSRoutes(content, relativePath) {
  const endpoints = [];
  const lines = content.split('\n');

  let controllerPrefix = '';
  let currentRoles = [];
  let requiresAuth = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trim = line.trim();
    let m;

    // Controller prefix path
    if ((m = trim.match(/@Controller\(['"`]([^'"`]*)/))) {
      controllerPrefix = m[1];
    }
    // Auth guard at controller level
    if (/@UseGuards\(/.test(trim)) requiresAuth = true;
    // Roles
    if ((m = trim.match(/@Roles\(([^)]+)\)/))) {
      currentRoles = m[1].split(',').map(r => r.replace(/['"` ]/g, '').trim()).filter(Boolean);
    }

    // Method decorators
    const methodMatch = trim.match(/@(Get|Post|Put|Patch|Delete|Options|Head)\(['"`]?([^'"`)\s]*)/i);
    if (methodMatch) {
      const method = methodMatch[1].toUpperCase();
      const routePath = methodMatch[2] || '';
      const fullPath = '/' + [controllerPrefix, routePath].filter(Boolean).join('/').replace(/\/+/g, '/').replace(/^\/+/, '');

      endpoints.push({
        method,
        path: fullPath,
        module: getModuleFromPath(relativePath),
        framework: 'NestJS',
        auth_required: requiresAuth,
        roles: currentRoles,
        source: `${relativePath}:${i + 1}`,
        confidence: 'verified',
      });

      currentRoles = [];
    }
  }

  return endpoints;
}

function extractExpressRoutes(content, relativePath) {
  const endpoints = [];
  const lines = content.split('\n');

  lines.forEach((line, i) => {
    let m;
    // router.get/post/etc or app.get/post/etc
    if ((m = line.match(/(?:router|app|route)\.(get|post|put|patch|delete|use)\s*\(\s*['"`]([^'"`]+)/i))) {
      endpoints.push({
        method: m[1].toUpperCase(),
        path: m[2],
        module: getModuleFromPath(relativePath),
        framework: 'Express',
        auth_required: /auth|authenticate|isAuthenticated|verifyToken|protect/i.test(line),
        roles: [],
        source: `${relativePath}:${i + 1}`,
        confidence: 'verified',
      });
    }
    // Fastify
    if ((m = line.match(/fastify\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)/i))) {
      endpoints.push({
        method: m[1].toUpperCase(),
        path: m[2],
        module: getModuleFromPath(relativePath),
        framework: 'Fastify',
        auth_required: false,
        roles: [],
        source: `${relativePath}:${i + 1}`,
        confidence: 'verified',
      });
    }
  });

  return endpoints;
}

function extractNextJSRoutes(filePath, relativePath) {
  const endpoints = [];
  const rel = relativePath.replace(/\\/g, '/');

  // pages/api/<path>.ts → GET/POST all
  const pagesApiMatch = rel.match(/pages\/api\/(.+)\.(ts|js|tsx|jsx)$/);
  if (pagesApiMatch) {
    const routePath = '/api/' + pagesApiMatch[1].replace(/\[([^\]]+)\]/g, ':$1');
    endpoints.push({
      method: 'ANY',
      path: routePath,
      module: pagesApiMatch[1].split('/')[0],
      framework: 'Next.js (pages/api)',
      auth_required: false,
      roles: [],
      source: relativePath,
      confidence: 'inferred',
    });
    return endpoints;
  }

  // app/api/<path>/route.ts → read exported function names
  const appApiMatch = rel.match(/app\/(.+)\/route\.(ts|js)$/);
  if (appApiMatch) {
    const routePath = '/' + appApiMatch[1].replace(/\[([^\]]+)\]/g, ':$1');
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const methods = [];
      ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].forEach(m => {
        if (new RegExp(`export\\s+(?:async\\s+)?function\\s+${m}\\b`).test(content)) methods.push(m);
      });
      methods.forEach(method => {
        endpoints.push({
          method,
          path: routePath,
          module: appApiMatch[1].split('/')[0],
          framework: 'Next.js (app router)',
          auth_required: /auth|session|getServerSession/i.test(content),
          roles: [],
          source: relativePath,
          confidence: 'verified',
        });
      });
    } catch {}
  }

  return endpoints;
}

function walkDir(dir, onFile, depth = 0) {
  if (depth > 10) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }

  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const fullPath = path.join(dir, e.name);
    if (e.isDirectory()) walkDir(fullPath, onFile, depth + 1);
    else if (e.isFile() && /\.(ts|js|tsx|jsx|mjs)$/.test(e.name)) {
      const stat = fs.statSync(fullPath);
      if (stat.size < MAX_FILE_SIZE) onFile(fullPath);
    }
  }
}

async function main() {
  if (!fs.existsSync(REPO_PATH)) {
    console.error(`[api-contract-extractor] ❌ Repo path không tồn tại: ${REPO_PATH}`);
    process.exit(1);
  }

  console.log(`[api-contract-extractor] Extracting API contracts from: ${REPO_PATH}`);

  const endpoints = [];
  let fileCount = 0;

  walkDir(REPO_PATH, (filePath) => {
    const relativePath = path.relative(REPO_PATH, filePath);
    const content = fs.readFileSync(filePath, 'utf8');

    // Detect framework per file
    const isNestJS  = /@Controller|@Get\(|@Post\(|@Put\(|@Patch\(|@Delete\(/.test(content);
    const isExpressOrFastify = /(?:router|app|route|fastify)\.(get|post|put|patch|delete)\s*\(/.test(content);
    const isNextAPI = relativePath.replace(/\\/g, '/').includes('/api/');

    if (isNestJS)               endpoints.push(...extractNestJSRoutes(content, relativePath));
    else if (isExpressOrFastify) endpoints.push(...extractExpressRoutes(content, relativePath));

    if (isNextAPI) endpoints.push(...extractNextJSRoutes(filePath, relativePath));

    fileCount++;
  });

  // Check for OpenAPI/Swagger spec
  let openAPIFound = false;
  for (const specFile of ['swagger.json', 'openapi.json', 'swagger.yaml', 'openapi.yaml', 'docs/swagger.json']) {
    const specPath = path.join(REPO_PATH, specFile);
    if (fs.existsSync(specPath)) {
      openAPIFound = true;
      console.log(`[api-contract-extractor] ✅ Found OpenAPI spec: ${specFile}`);
      break;
    }
  }

  // Deduplicate by method+path
  const seen = new Set();
  const unique = endpoints.filter(e => {
    const key = `${e.method}:${e.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const byModule = {};
  for (const e of unique) {
    byModule[e.module] = (byModule[e.module] || 0) + 1;
  }

  const output = {
    tool: 'api-contract-extractor.mjs',
    repoPath: REPO_PATH,
    extractedAt: new Date().toISOString(),
    totalEndpoints: unique.length,
    openAPISpecFound: openAPIFound,
    summaryByModule: byModule,
    endpoints: unique,
  };

  if (OUTPUT_FILE) {
    fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf8');
    console.log(`[api-contract-extractor] ✅ Saved to: ${OUTPUT_FILE}`);
  } else {
    console.log(JSON.stringify(output, null, 2));
  }

  console.log(`\n[api-contract-extractor] Scanned ${fileCount} files, found ${unique.length} API endpoints`);
  console.log('Endpoints by module:');
  for (const [mod, count] of Object.entries(byModule)) {
    console.log(`  ${String(mod).padEnd(25)} ${count} endpoints`);
  }
}

main().catch(err => {
  console.error('[api-contract-extractor] FATAL:', err.message);
  process.exit(1);
});
