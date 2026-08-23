#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  moduleArtifactNames,
  moduleArtifactPaths,
  RESERVED_MODULE_SLUGS,
  resolveModuleSlug,
} from './artifact-naming.mjs';

function getArg(flag, fallback = '') {
  const index = process.argv.indexOf(flag);
  return index === -1 ? fallback : process.argv[index + 1] || fallback;
}

function testDeclarations(source) {
  return [...source.matchAll(/\btest\s*\(\s*(["'])(.*?)\1/g)]
    .map(match => match[2].split('|')[0].trim())
    .filter(Boolean);
}

function verifyModuleArtifactLayout({ manifestPath, projectRoot, surface = 'functional' }) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.schema_version !== 1 || !Array.isArray(manifest.testcases)) {
    throw new Error('automation manifest must use schema_version=1 and contain testcases[]');
  }

  const modules = new Map();
  for (const testcase of manifest.testcases) {
    const moduleName = String(testcase.group || 'Other').trim();
    const testcaseId = String(testcase.testcase_id || '').trim();
    if (!testcaseId) throw new Error('Every testcase must have testcase_id');
    if (!modules.has(moduleName)) modules.set(moduleName, []);
    modules.get(moduleName).push(testcaseId);
  }

  const violations = [];
  const mappedIds = [];
  const artifacts = [];
  const expectedFinalFiles = new Set();
  const slugOwners = new Map();
  for (const [moduleName, expectedIds] of modules) {
    const slug = resolveModuleSlug(moduleName);
    if (RESERVED_MODULE_SLUGS.has(slug)) {
      violations.push({
        code: 'MODULE_SLUG_RESERVED',
        module: moduleName,
        slug,
        message: `Module slug "${slug}" is reserved by the runtime scaffold`,
      });
    }
    const previousOwner = slugOwners.get(slug);
    if (previousOwner && previousOwner !== moduleName) {
      violations.push({
        code: 'MODULE_SLUG_COLLISION',
        slug,
        modules: [previousOwner, moduleName],
        message: `Distinct manifest groups resolve to the same module slug: ${slug}`,
      });
    } else {
      slugOwners.set(slug, moduleName);
    }
    const expected = moduleArtifactPaths(projectRoot, slug, surface);
    const names = moduleArtifactNames(slug, surface);
    Object.values(expected).forEach(filePath => expectedFinalFiles.add(path.resolve(filePath)));
    artifacts.push({
      module: moduleName,
      slug,
      names,
      testcase_count: expectedIds.length,
      ...expected,
    });

    for (const [kind, filePath] of Object.entries(expected)) {
      if (!fs.existsSync(filePath)) {
        violations.push({ code: 'MODULE_ARTIFACT_MISSING', module: moduleName, kind, file: filePath });
      }
    }
    if (!fs.existsSync(expected.spec)) continue;

    const actualIds = testDeclarations(fs.readFileSync(expected.spec, 'utf8'));
    mappedIds.push(...actualIds);
    if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
      violations.push({
        code: 'MODULE_TESTCASE_ORDER_MISMATCH',
        module: moduleName,
        expected_ids: expectedIds,
        actual_ids: actualIds,
      });
    }
  }

  const finalRoots = [
    { root: path.join(projectRoot, 'tests', surface), pattern: /\.spec\.ts$/, allowed: new Set() },
    { root: path.join(projectRoot, 'pages'), pattern: /\.page\.ts$/, allowed: new Set(['base.page.ts']) },
    { root: path.join(projectRoot, 'selectors'), pattern: /\.selectors\.ts$/, allowed: new Set() },
  ];
  for (const { root, pattern, allowed } of finalRoots) {
    if (!fs.existsSync(root)) continue;
    for (const name of fs.readdirSync(root)) {
      if (!pattern.test(name)) continue;
      if (/\.batch-\d+/i.test(name)) {
        violations.push({ code: 'BATCH_LEAKED_TO_FINAL_CODE', file: path.join(root, name) });
      }
      const filePath = path.resolve(root, name);
      if (!expectedFinalFiles.has(filePath) && !allowed.has(name)) {
        violations.push({ code: 'UNMAPPED_FINAL_MODULE_ARTIFACT', file: filePath });
      }
    }
  }

  const expectedAllIds = manifest.testcases.map(testcase => String(testcase.testcase_id));
  const duplicateIds = mappedIds.filter((id, index) => mappedIds.indexOf(id) !== index);
  const missingIds = expectedAllIds.filter(id => !mappedIds.includes(id));
  const extraIds = mappedIds.filter(id => !expectedAllIds.includes(id));
  if (duplicateIds.length) violations.push({ code: 'DUPLICATE_TESTCASE_ID', testcase_ids: [...new Set(duplicateIds)] });
  if (missingIds.length) violations.push({ code: 'MISSING_TESTCASE_ID', testcase_ids: missingIds });
  if (extraIds.length) violations.push({ code: 'EXTRA_TESTCASE_ID', testcase_ids: extraIds });

  return {
    status: violations.length ? 'FAILED' : 'PASS',
    module_count: modules.size,
    testcase_count: expectedAllIds.length,
    mapped_testcase_count: mappedIds.length,
    surface,
    artifacts,
    violations,
  };
}

function main() {
  const manifestArg = getArg('--manifest');
  if (!manifestArg) throw new Error('BLOCKED: --manifest is required');
  const projectRoot = path.resolve(getArg('--project-root', '.'));
  const manifestPath = path.resolve(manifestArg);
  const surface = getArg('--surface', 'functional');
  const result = verifyModuleArtifactLayout({ manifestPath, projectRoot, surface });
  const outputArg = getArg('--output');
  if (outputArg) {
    const outputPath = path.resolve(outputArg);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  }
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'PASS') process.exitCode = 1;
}

export { resolveModuleSlug, testDeclarations, verifyModuleArtifactLayout };

const invokedAsScript = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedAsScript) {
  try {
    main();
  } catch (error) {
    console.error(`[module-layout] ${error.message}`);
    process.exitCode = 2;
  }
}
