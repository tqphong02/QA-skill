#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  moduleArtifactKinds,
  moduleArtifactNames,
  moduleArtifactPaths,
  normalizeCapabilities,
  normalizeSurface,
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

function uniqueStrings(values) {
  return [...new Set((values || []).flatMap(value => String(value || '').split(','))
    .map(value => value.trim())
    .filter(Boolean))];
}

function getArgs(flag) {
  const values = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === flag && process.argv[index + 1]) values.push(process.argv[index + 1]);
  }
  return values;
}

function inferredTestcaseCapabilities(testcase, surface = 'functional') {
  const normalizedSurface = normalizeSurface(surface);
  const explicit = Array.isArray(testcase?.capabilities)
    ? testcase.capabilities
    : testcase?.capability
      ? [testcase.capability]
      : [];
  const inferred = [
    ...explicit,
    ...(testcase?.api && typeof testcase.api === 'object' ? ['api'] : []),
    ...(testcase?.execution && typeof testcase.execution === 'object' ? ['ui'] : []),
    ...(String(testcase?.section_kind || '').toLowerCase() === 'api' ? ['api'] : []),
  ];
  const unique = ['ui', 'api'].filter(capability => (
    inferred.map(value => String(value || '').toLowerCase()).includes(capability)
  ));
  if (unique.length > 0) return unique;
  if (normalizedSurface === 'api') return ['api'];
  return ['ui'];
}

function testcaseBelongsToSurface(testcase, surface) {
  const normalizedSurface = normalizeSurface(surface);
  if (normalizedSurface === 'functional') return true;
  return inferredTestcaseCapabilities(testcase, normalizedSurface).includes(normalizedSurface);
}

function testcaseScopeFromPlans(planPaths) {
  if (!planPaths || planPaths.length === 0) return [];
  const records = planPaths.map(planPathValue => {
    const planPath = path.resolve(planPathValue);
    const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
    if (plan.schema_version !== 1 || !Array.isArray(plan.testcases)) {
      throw new Error(`pom-plan must use schema_version=1 and contain testcases[]: ${planPath}`);
    }
    if (plan.testcases.length === 0 || plan.testcases.length > 20) {
      throw new Error(`pom-plan must contain 1-20 testcases: ${planPath}`);
    }
    if (!plan.module || !Array.isArray(plan.modules) || plan.modules.length !== 1) {
      throw new Error(`pom-plan must contain exactly one module: ${planPath}`);
    }
    return { plan, planPath };
  });
  const owner = records[0].plan.module;
  for (const { plan, planPath } of records) {
    if (plan.module.group !== owner.group || plan.module.slug !== owner.slug) {
      throw new Error(`All scoped pom-plans must belong to one module: ${planPath}`);
    }
  }
  const cases = records.flatMap(({ plan }) => plan.testcases);
  if (records.length > 1 && cases.some(testcase => !Number.isInteger(testcase.source_index))) {
    throw new Error('Batched pom-plans require source_index on every testcase');
  }
  cases.sort((left, right) => (
    Number.isInteger(left.source_index) && Number.isInteger(right.source_index)
      ? left.source_index - right.source_index
      : 0
  ));
  const ids = cases.map(testcase => String(testcase.testcase_id || '').trim());
  if (ids.some(id => !id)) throw new Error('Every scoped pom-plan testcase needs testcase_id');
  if (new Set(ids).size !== ids.length) throw new Error('Scoped pom-plans contain duplicate testcase IDs');
  return ids;
}

function verifyModuleArtifactLayout({
  manifestPath,
  projectRoot,
  surface = 'functional',
  testcaseIds = [],
  planPaths = [],
}) {
  const normalizedSurface = normalizeSurface(surface);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.schema_version !== 1 || !Array.isArray(manifest.testcases)) {
    throw new Error('automation manifest must use schema_version=1 and contain testcases[]');
  }

  const planTestcaseIds = testcaseScopeFromPlans(planPaths);
  const explicitTestcaseIds = uniqueStrings(testcaseIds);
  if (planTestcaseIds.length > 0 && explicitTestcaseIds.length > 0
    && JSON.stringify(planTestcaseIds) !== JSON.stringify(explicitTestcaseIds)) {
    throw new Error('Explicit testcaseIds do not match the scoped pom-plan testcase order');
  }
  const scopedIds = planTestcaseIds.length > 0 ? planTestcaseIds : explicitTestcaseIds;
  const scopedIdSet = new Set(scopedIds);
  const selectedTestcases = manifest.testcases.filter(testcase => (
    testcaseBelongsToSurface(testcase, normalizedSurface)
    && (scopedIdSet.size === 0 || scopedIdSet.has(String(testcase.testcase_id || '').trim()))
  ));
  const modules = new Map();
  for (const testcase of selectedTestcases) {
    const moduleName = String(testcase.group || 'Other').trim();
    const testcaseId = String(testcase.testcase_id || '').trim();
    if (!testcaseId) throw new Error('Every testcase must have testcase_id');
    if (!modules.has(moduleName)) modules.set(moduleName, { testcaseIds: [], capabilities: [] });
    const moduleRecord = modules.get(moduleName);
    moduleRecord.testcaseIds.push(testcaseId);
    for (const capability of inferredTestcaseCapabilities(testcase, normalizedSurface)) {
      if (!moduleRecord.capabilities.includes(capability)) moduleRecord.capabilities.push(capability);
    }
  }

  const violations = [];
  const manifestIds = manifest.testcases.map(testcase => String(testcase.testcase_id || '').trim());
  const duplicateManifestIds = manifestIds.filter((id, index) => id && manifestIds.indexOf(id) !== index);
  if (duplicateManifestIds.length > 0) {
    violations.push({
      code: 'DUPLICATE_MANIFEST_TESTCASE_ID',
      testcase_ids: [...new Set(duplicateManifestIds)],
    });
  }
  const unknownScopeIds = scopedIds.filter(id => !manifestIds.includes(id));
  if (unknownScopeIds.length > 0) {
    violations.push({ code: 'TESTCASE_SCOPE_ID_UNKNOWN', testcase_ids: unknownScopeIds });
  }
  if (selectedTestcases.length === 0) {
    violations.push({
      code: 'NO_TESTCASES_FOR_SURFACE',
      surface: normalizedSurface,
      message: `Automation manifest contains no testcases for surface ${normalizedSurface}`,
    });
  }
  if (normalizedSurface === 'functional') {
    const uncomposed = selectedTestcases.filter(testcase => {
      const capabilities = inferredTestcaseCapabilities(testcase, normalizedSurface);
      const order = Array.isArray(testcase.capability_order)
        ? testcase.capability_order.map(value => String(value).toLowerCase())
        : [];
      return capabilities.length !== 2
        || order.length !== 2
        || !order.includes('ui')
        || !order.includes('api');
    });
    if (uncomposed.length > 0) {
      violations.push({
        code: 'FUNCTIONAL_FLOW_NOT_COMPOSED',
        testcase_ids: uncomposed.map(testcase => String(testcase.testcase_id)),
        message: 'Functional artifacts require each testcase to define one explicit UI+API capability_order',
      });
    }
  }
  const mappedIds = [];
  const artifacts = [];
  const expectedFinalFiles = new Set();
  const slugOwners = new Map();
  const activeArtifactKinds = new Set(['spec']);
  for (const [moduleName, moduleRecord] of modules) {
    const expectedIds = moduleRecord.testcaseIds;
    const capabilities = normalizeCapabilities(normalizedSurface, moduleRecord.capabilities);
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
    const expected = moduleArtifactPaths(projectRoot, slug, normalizedSurface, capabilities);
    const names = moduleArtifactNames(slug, normalizedSurface, capabilities);
    moduleArtifactKinds(normalizedSurface, capabilities).forEach(kind => activeArtifactKinds.add(kind));
    Object.values(expected).forEach(filePath => expectedFinalFiles.add(path.resolve(filePath)));
    artifacts.push({
      module: moduleName,
      slug,
      capabilities,
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

  const rootByKind = {
    spec: { root: path.join(projectRoot, 'tests', normalizedSurface), pattern: /\.spec\.ts$/, allowed: new Set() },
    page: { root: path.join(projectRoot, 'pages'), pattern: /\.page\.ts$/, allowed: new Set(['base.page.ts']) },
    selector: { root: path.join(projectRoot, 'selectors'), pattern: /\.selectors\.ts$/, allowed: new Set() },
    client: { root: path.join(projectRoot, 'clients'), pattern: /\.client\.ts$/, allowed: new Set() },
    schema: { root: path.join(projectRoot, 'schemas'), pattern: /\.schema\.ts$/, allowed: new Set() },
  };
  const finalRoots = [...activeArtifactKinds].map(kind => rootByKind[kind]);
  for (const { root, pattern, allowed } of finalRoots) {
    if (!fs.existsSync(root)) continue;
    for (const name of fs.readdirSync(root)) {
      if (!pattern.test(name)) continue;
      const filePath = path.resolve(root, name);
      if (scopedIds.length > 0 && !expectedFinalFiles.has(filePath) && !allowed.has(name)) continue;
      if (/\.batch-\d+/i.test(name)) {
        violations.push({ code: 'BATCH_LEAKED_TO_FINAL_CODE', file: path.join(root, name) });
      }
      if (!expectedFinalFiles.has(filePath) && !allowed.has(name)) {
        violations.push({ code: 'UNMAPPED_FINAL_MODULE_ARTIFACT', file: filePath });
      }
    }
  }

  const expectedAllIds = selectedTestcases.map(testcase => String(testcase.testcase_id));
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
    surface: normalizedSurface,
    capabilities: ['ui', 'api'].filter(capability => (
      [...modules.values()].some(moduleRecord => moduleRecord.capabilities.includes(capability))
    )),
    scope: scopedIds.length > 0 ? 'selected' : 'full',
    scoped_testcase_ids: scopedIds,
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
  const testcaseIds = getArgs('--testcase-id').flatMap(value => value.split(','));
  const planPaths = getArgs('--plan');
  const result = verifyModuleArtifactLayout({
    manifestPath,
    projectRoot,
    surface,
    testcaseIds,
    planPaths,
  });
  const outputArg = getArg('--output');
  if (outputArg) {
    const outputPath = path.resolve(outputArg);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  }
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'PASS') process.exitCode = 1;
}

export {
  inferredTestcaseCapabilities,
  resolveModuleSlug,
  testcaseScopeFromPlans,
  testcaseBelongsToSurface,
  testDeclarations,
  verifyModuleArtifactLayout,
};

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
