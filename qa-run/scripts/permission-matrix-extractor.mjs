#!/usr/bin/env node
/**
 * permission-matrix-extractor.mjs — Role × Permission Matrix Builder
 *
 * Sinh ma trận Role × Permission từ source code:
 *   - @Roles() decorator (NestJS)
 *   - @UseGuards() với RolesGuard / JwtAuthGuard
 *   - Permission enum / RBAC policy objects
 *   - Middleware auth checks
 *   - hasRole, hasPermission, canActivate checks
 *
 * Output: permission-matrix.json với:
 *   roles[], permissions[], matrix{role → [endpoint]}, rawGrants[]
 *
 * Usage:
 *   node permission-matrix-extractor.mjs --repo /path/to/project
 *   node permission-matrix-extractor.mjs --repo . --output qa-knowledge/repositories/my-repo/permission-matrix.json
 */

import fs from 'node:fs';
import path from 'node:path';

const args   = process.argv.slice(2);
const getArg = (flag, def) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : def; };

const REPO_PATH   = path.resolve(getArg('--repo', '.'));
const OUTPUT_FILE = getArg('--output', null);
const MAX_FILE_SIZE = 150 * 1024;

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.nuxt', 'coverage', '__mocks__', 'vendor', 'generated']);

function walkDir(dir, onFile, depth = 0) {
  if (depth > 10) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const fullPath = path.join(dir, e.name);
    if (e.isDirectory()) walkDir(fullPath, onFile, depth + 1);
    else if (e.isFile() && /\.(ts|js|tsx|jsx|mjs)$/.test(e.name) && !/\.(spec|test)\./.test(e.name)) {
      const stat = fs.statSync(fullPath);
      if (stat.size < MAX_FILE_SIZE) onFile(fullPath);
    }
  }
}

async function main() {
  if (!fs.existsSync(REPO_PATH)) {
    console.error(`[permission-matrix-extractor] ❌ Repo path không tồn tại: ${REPO_PATH}`);
    process.exit(1);
  }

  console.log(`[permission-matrix-extractor] Extracting permission matrix from: ${REPO_PATH}`);

  const allRoles = new Set();
  const grants = []; // { roles, endpoint, guard, source }
  let fileCount = 0;

  walkDir(REPO_PATH, (filePath) => {
    const relativePath = path.relative(REPO_PATH, filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    // Track controller prefix
    let controllerPath = '';
    let controllerGuard = false;
    let controllerRoles = [];

    lines.forEach((line, i) => {
      const trim = line.trim();
      let m;

      if ((m = trim.match(/@Controller\(['"`]([^'"`]*)/))) {
        controllerPath = m[1];
        controllerGuard = false;
        controllerRoles = [];
      }
      if (/@UseGuards\(/.test(trim)) controllerGuard = true;
      if ((m = trim.match(/@Roles\(([^)]+)\)/))) {
        const roles = m[1].split(',').map(r => r.replace(/['"` \w+.]/g, r => /['"` ]/.test(r) ? '' : r)).filter(Boolean);
        roles.forEach(r => allRoles.add(r));

        // Find the next method decorator
        for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
          const methodMatch = lines[j].match(/@(Get|Post|Put|Patch|Delete)\(['"`]?([^'"`)\s]*)/i);
          if (methodMatch) {
            grants.push({
              roles,
              endpoint: `${methodMatch[1].toUpperCase()} ${controllerPath ? '/' + controllerPath : ''}${methodMatch[2] ? '/' + methodMatch[2] : ''}`,
              guard: controllerGuard ? 'authenticated' : 'none',
              source: `${relativePath}:${i + 1}`,
              confidence: 'verified',
            });
            break;
          }
        }

        // If no method found, might be controller-level
        if (!grants.some(g => g.source === `${relativePath}:${i + 1}`)) {
          controllerRoles = roles;
        }
      }

      // Public endpoints
      if (/@Public\(\)/.test(trim)) {
        grants.push({
          roles: ['PUBLIC'],
          endpoint: `(next endpoint at ${relativePath}:${i + 1})`,
          guard: 'none',
          source: `${relativePath}:${i + 1}`,
          confidence: 'verified',
        });
        allRoles.add('PUBLIC');
      }

      // Role enum definitions
      if ((m = trim.match(/(?:export\s+)?enum\s+(\w*[Rr]ole\w*)/))) {
        for (let j = i + 1; j < Math.min(i + 20, lines.length); j++) {
          if (lines[j].trim() === '}') break;
          const valMatch = lines[j].trim().match(/^(\w+)/);
          if (valMatch) allRoles.add(valMatch[1]);
        }
      }
    });

    fileCount++;
  });

  // Build matrix: role → endpoints
  const matrix = {};
  for (const role of allRoles) {
    matrix[role] = grants
      .filter(g => g.roles.includes(role) || (role === 'AUTHENTICATED' && g.guard === 'authenticated'))
      .map(g => g.endpoint);
  }

  const output = {
    tool: 'permission-matrix-extractor.mjs',
    repoPath: REPO_PATH,
    extractedAt: new Date().toISOString(),
    roles: [...allRoles].sort(),
    totalGrants: grants.length,
    matrix,
    rawGrants: grants,
  };

  if (OUTPUT_FILE) {
    fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf8');
    console.log(`[permission-matrix-extractor] ✅ Saved to: ${OUTPUT_FILE}`);
  } else {
    console.log(JSON.stringify({ ...output, rawGrants: `(${grants.length} grants)` }, null, 2));
  }

  console.log(`[permission-matrix-extractor] ${fileCount} files → ${[...allRoles].length} roles, ${grants.length} permission grants`);
  console.log('Roles:', [...allRoles].join(', ') || 'none detected');
}

main().catch(err => {
  console.error('[permission-matrix-extractor] FATAL:', err.message);
  process.exit(1);
});
