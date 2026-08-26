#!/usr/bin/env node
/**
 * repo-fingerprint.mjs — Repository Type & Technology Detector
 *
 * Phân tích package.json, cấu trúc thư mục và file config để nhận diện:
 *   - Loại repo: frontend, backend, mobile, monorepo, fullstack, library
 *   - Framework: NestJS, Express, Next.js, Fastify, Nuxt, Vue, React, Angular, Hono...
 *   - Ngôn ngữ chính: TypeScript, JavaScript
 *   - Entry points: main files, apps/ in monorepo
 *   - Modules/Packages: danh sách module nếu là monorepo
 *
 * Usage:
 *   node repo-fingerprint.mjs --repo /path/to/project
 *   node repo-fingerprint.mjs --repo . --output qa-knowledge/repositories/my-repo/repo-metadata.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const args = process.argv.slice(2);
const getArg = (flag, def) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : def; };

const REPO_PATH   = path.resolve(getArg('--repo', '.'));
const OUTPUT_FILE = getArg('--output', null);

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

function fileExists(...parts) {
  return fs.existsSync(path.join(...parts));
}

function getGitCommit(repoPath) {
  try { return execSync('git rev-parse --short HEAD', { cwd: repoPath, encoding: 'utf8' }).trim(); } catch { return 'unknown'; }
}

function getGitBranch(repoPath) {
  try { return execSync('git branch --show-current', { cwd: repoPath, encoding: 'utf8' }).trim(); } catch { return 'unknown'; }
}

function detectLanguage(repoPath, pkg) {
  if (fileExists(repoPath, 'tsconfig.json')) return 'TypeScript';
  if (pkg?.devDependencies?.typescript || pkg?.dependencies?.typescript) return 'TypeScript';
  return 'JavaScript';
}

function detectFrameworks(pkg) {
  const all = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  const frameworks = [];

  // Backend
  if (all['@nestjs/core'])      frameworks.push('NestJS');
  if (all['express'])           frameworks.push('Express');
  if (all['fastify'])           frameworks.push('Fastify');
  if (all['hono'])              frameworks.push('Hono');
  if (all['koa'])               frameworks.push('Koa');

  // Frontend / Fullstack
  if (all['next'])              frameworks.push('Next.js');
  if (all['nuxt'] || all['nuxt3']) frameworks.push('Nuxt');
  if (all['@angular/core'])     frameworks.push('Angular');
  if (all['vue'] && !all['nuxt']) frameworks.push('Vue');
  if (all['react'] && !all['next'] && !all['@angular/core']) frameworks.push('React');
  if (all['svelte'])            frameworks.push('Svelte');
  if (all['remix'])             frameworks.push('Remix');

  // ORM / Database
  if (all['typeorm'])           frameworks.push('TypeORM');
  if (all['prisma'] || all['@prisma/client']) frameworks.push('Prisma');
  if (all['mongoose'])          frameworks.push('Mongoose');
  if (all['sequelize'])         frameworks.push('Sequelize');
  if (all['drizzle-orm'])       frameworks.push('Drizzle');

  // Testing
  if (all['jest'])              frameworks.push('Jest');
  if (all['vitest'])            frameworks.push('Vitest');
  if (all['playwright'] || all['@playwright/test']) frameworks.push('Playwright');

  return frameworks;
}

function detectRepoType(repoPath, pkg, frameworks) {
  // Monorepo
  if (fileExists(repoPath, 'packages') || fileExists(repoPath, 'apps') ||
      pkg?.workspaces || fileExists(repoPath, 'pnpm-workspace.yaml') ||
      fileExists(repoPath, 'lerna.json') || fileExists(repoPath, 'nx.json')) {
    return 'monorepo';
  }
  // Mobile
  if (fileExists(repoPath, 'android') || fileExists(repoPath, 'ios') ||
      pkg?.dependencies?.['react-native'] || fileExists(repoPath, 'pubspec.yaml')) {
    return 'mobile';
  }
  // Frontend
  const frontendFW = ['Next.js', 'Nuxt', 'Angular', 'Vue', 'React', 'Svelte', 'Remix'];
  const backendFW = ['NestJS', 'Express', 'Fastify', 'Hono', 'Koa'];
  const hasFrontend = frameworks.some(f => frontendFW.includes(f));
  const hasBackend  = frameworks.some(f => backendFW.includes(f));
  if (hasFrontend && hasBackend) return 'fullstack';
  if (hasFrontend) return 'frontend';
  if (hasBackend)  return 'backend';
  if (fileExists(repoPath, 'src/index.ts') || fileExists(repoPath, 'src/index.js')) return 'library';
  return 'unknown';
}

function findEntryPoints(repoPath, pkg, repoType) {
  const entryPoints = [];
  if (pkg?.main)   entryPoints.push(pkg.main);
  if (pkg?.module) entryPoints.push(pkg.module);

  const commonEntries = ['src/main.ts', 'src/index.ts', 'src/app.ts', 'src/server.ts',
                         'src/main.js', 'src/index.js', 'app.ts', 'app.js', 'server.ts', 'server.js',
                         'pages/index.tsx', 'pages/index.ts', 'app/page.tsx', 'index.ts', 'index.js'];
  for (const e of commonEntries) {
    if (fileExists(repoPath, e)) entryPoints.push(e);
  }

  if (repoType === 'monorepo') {
    for (const dir of ['packages', 'apps', 'libs']) {
      const fullDir = path.join(repoPath, dir);
      if (fs.existsSync(fullDir)) {
        fs.readdirSync(fullDir).forEach(sub => entryPoints.push(`${dir}/${sub}`));
      }
    }
  }
  return [...new Set(entryPoints)].slice(0, 20);
}

function findModules(repoPath) {
  const modules = [];
  const srcDirs = ['src', 'lib', 'app'];
  for (const srcDir of srcDirs) {
    const fullSrc = path.join(repoPath, srcDir);
    if (!fs.existsSync(fullSrc)) continue;
    fs.readdirSync(fullSrc, { withFileTypes: true }).forEach(dirent => {
      if (dirent.isDirectory() &&
          !['node_modules', '__tests__', 'dist', 'build', '.git', 'coverage', '__mocks__', 'assets', 'public'].includes(dirent.name)) {
        modules.push({ name: dirent.name, path: `${srcDir}/${dirent.name}` });
      }
    });
  }
  return modules;
}

function countSourceFiles(repoPath) {
  try {
    const output = execSync(
      `find . -type f \\( -name "*.ts" -o -name "*.js" -o -name "*.tsx" -o -name "*.jsx" \\) \
       -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/dist/*" -not -path "*/build/*" | wc -l`,
      { cwd: repoPath, encoding: 'utf8' }
    ).trim();
    return parseInt(output, 10);
  } catch { return 0; }
}

async function main() {
  if (!fs.existsSync(REPO_PATH)) {
    console.error(`[repo-fingerprint] ❌ Repo path không tồn tại: ${REPO_PATH}`);
    process.exit(1);
  }

  const pkgPath = path.join(REPO_PATH, 'package.json');
  const pkg = readJson(pkgPath);
  const repoName = pkg?.name || path.basename(REPO_PATH);

  const commit     = getGitCommit(REPO_PATH);
  const branch     = getGitBranch(REPO_PATH);
  const language   = detectLanguage(REPO_PATH, pkg);
  const frameworks = detectFrameworks(pkg);
  const repoType   = detectRepoType(REPO_PATH, pkg, frameworks);
  const entryPoints = findEntryPoints(REPO_PATH, pkg, repoType);
  const modules    = findModules(REPO_PATH);
  const sourceFiles = countSourceFiles(REPO_PATH);

  const metadata = {
    repoName,
    repoPath: REPO_PATH,
    repoType,
    frameworks,
    language,
    commit,
    branch,
    nodeVersion: process.version,
    packageName: pkg?.name || null,
    packageVersion: pkg?.version || null,
    description: pkg?.description || null,
    hasTypeScript: fileExists(REPO_PATH, 'tsconfig.json'),
    hasDockerfile: fileExists(REPO_PATH, 'Dockerfile'),
    hasCIConfig: fileExists(REPO_PATH, '.github', 'workflows') || fileExists(REPO_PATH, '.gitlab-ci.yml'),
    hasOpenAPISpec: fileExists(REPO_PATH, 'swagger.json') || fileExists(REPO_PATH, 'openapi.json') || fileExists(REPO_PATH, 'swagger.yaml'),
    sourceFilesCount: sourceFiles,
    entryPoints,
    modules,
    scannedAt: new Date().toISOString(),
  };

  if (OUTPUT_FILE) {
    fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(metadata, null, 2), 'utf8');
    console.log(`[repo-fingerprint] ✅ Saved to: ${OUTPUT_FILE}`);
  } else {
    console.log(JSON.stringify(metadata, null, 2));
  }

  console.log(`\n[repo-fingerprint] Repo: ${repoName} (${repoType}) | ${language} | ${frameworks.join(', ') || 'Unknown framework'}`);
  console.log(`[repo-fingerprint] Commit: ${commit} | Branch: ${branch} | Source files: ${sourceFiles}`);
  console.log(`[repo-fingerprint] Modules detected: ${modules.map(m => m.name).join(', ') || 'none'}`);
}

main().catch(err => {
  console.error('[repo-fingerprint] FATAL:', err.message);
  process.exit(1);
});
