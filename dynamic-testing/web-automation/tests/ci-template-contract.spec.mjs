import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_ROOT = path.resolve(HERE, '../assets/templates');

test('GitHub Actions template covers UI, API and functional surfaces on maintained tooling', () => {
  const workflow = fs.readFileSync(path.join(TEMPLATE_ROOT, 'github-actions-ci.yml'), 'utf8');
  const packageJson = JSON.parse(fs.readFileSync(path.join(TEMPLATE_ROOT, 'package.json'), 'utf8'));
  const packageLock = JSON.parse(fs.readFileSync(path.join(TEMPLATE_ROOT, 'package-lock.json'), 'utf8'));

  assert.match(workflow, /NODE_VERSION:\s*'24'/);
  assert.match(workflow, /PW_RETRIES:\s*'1'/);
  assert.match(workflow, /group: qa-static-pool-\$\{\{ github\.repository \}\}/);
  assert.match(workflow, /cancel-in-progress:\s*false/);
  assert.match(workflow, /^  test-ui:/m);
  assert.match(workflow, /^  test-api:/m);
  assert.match(workflow, /^  test-functional:/m);
  assert.match(workflow, /ui: \$\{\{ steps\.surfaces\.outputs\.ui \}\}/);
  assert.match(workflow, /api: \$\{\{ steps\.surfaces\.outputs\.api \}\}/);
  assert.match(workflow, /functional: \$\{\{ steps\.surfaces\.outputs\.functional \}\}/);
  assert.match(workflow, /node scripts\/ci-surfaces\.mjs --require --github-output "\$GITHUB_OUTPUT"/);
  assert.match(workflow, /needs\.preflight\.outputs\.ui == 'true'/);
  assert.match(workflow, /needs\.preflight\.outputs\.api == 'true'/);
  assert.match(workflow, /needs\.preflight\.outputs\.functional == 'true'/);
  assert.match(workflow, /qa:test:functional -- --project=\$\{\{ matrix\.browser \}\}/);
  assert.match(workflow, /qa:test:api -- --project=chromium/);
  assert.match(workflow, /TEST_DATASETS_JSON: \$\{\{ secrets\.TEST_DATASETS_JSON \}\}/);
  assert.equal((workflow.match(/max-parallel:\s*1/g) ?? []).length, 2);
  assert.match(workflow, /needs: \[preflight, lint, test-ui\]/);
  assert.match(workflow, /needs: \[preflight, lint, test-functional\]/);
  assert.match(workflow, /QA_RUN_ID: gha-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}-ui-\$\{\{ matrix\.browser \}\}/);
  assert.match(workflow, /QA_RUN_ID: gha-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}-functional-\$\{\{ matrix\.browser \}\}/);
  assert.match(workflow, /QA_RUN_ID: gha-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}-api-chromium/);
  assert.match(workflow, /fixtures\/parallel-pool\.js/);
  assert.match(workflow, /scripts\/execution-lock\.mjs/);
  assert.match(workflow, /dependency-versions\.json/);
  assert.match(workflow, /npm run toolchain:check/);
  assert.match(workflow, /qa:quality -- --surface ui --project=\$\{\{ matrix\.browser \}\}/);
  assert.match(workflow, /qa:quality -- --surface functional --project=\$\{\{ matrix\.browser \}\}/);
  assert.match(workflow, /qa:quality -- --surface api --project=chromium/);
  assert.doesNotMatch(workflow, /--expect-artifact qa-/);
  assert.match(workflow, /ci-surfaces\.mjs --require --format artifacts --run-id "\$GITHUB_RUN_ID"/);
  assert.match(workflow, /merge_args\+=\(--expect-artifact "\$artifact"\)/);
  assert.match(workflow, /hashFiles\(format\('\{0\}\/reports\/playwright\.json'/);
  assert.match(workflow, /hashFiles\(format\('\{0\}\/reports\/allure-results\/\*-result\.json'/);
  assert.doesNotMatch(workflow, /if-no-files-found:\s*ignore/);
  assert.match(workflow, /if-no-files-found:\s*error/);
  assert.match(workflow, /needs: \[preflight, test-ui, test-functional, test-api\]/);
  assert.doesNotMatch(workflow, /actions\/(?:checkout|setup-node|upload-artifact|download-artifact)@v4/);
  assert.doesNotMatch(workflow, /actions\/cache@/);
  assert.match(packageJson.engines.node, /\^24\.0\.0/);
  assert.match(packageJson.devDependencies['@types/node'], /\^24\./);
  assert.equal(packageJson.devDependencies['@axe-core/playwright'], undefined);
  assert.equal(packageLock.lockfileVersion, 3);
  assert.deepEqual(packageLock.packages[''].dependencies, packageJson.dependencies);
  assert.deepEqual(packageLock.packages[''].devDependencies, packageJson.devDependencies);
  assert.equal(packageJson.scripts['test:perf'], undefined);
  assert.equal(packageJson.scripts['pretest:perf'], undefined);
  assert.doesNotMatch(workflow, /\bk6\b|grafana\/k6-action/);
  const performanceDir = path.join(TEMPLATE_ROOT, 'tests', 'performance');
  assert.equal(fs.existsSync(performanceDir) ? fs.readdirSync(performanceDir).length : 0, 0);
  assert.equal(fs.existsSync(path.resolve(HERE, '../references/performance-testing.md')), false);
});

test('Playwright runtime ignores copyable example specs', () => {
  const config = fs.readFileSync(path.join(TEMPLATE_ROOT, 'playwright.config.ts'), 'utf8');
  assert.match(config, /testIgnore:\s*['"]\*\*\/example\*\.spec\.\{ts,tsx,js,jsx,mts,mjs,cts,cjs\}['"]/);
});

test('Jenkins template avoids concurrent reporters and runs only detected surfaces', () => {
  const pipeline = fs.readFileSync(path.join(TEMPLATE_ROOT, 'Jenkinsfile'), 'utf8');

  assert.match(pipeline, /nodejs 'Node-24'/);
  assert.match(pipeline, /CI = 'true'/);
  assert.match(pipeline, /PW_RETRIES = '1'/);
  assert.match(pipeline, /disableConcurrentBuilds\(\)/);
  assert.match(pipeline, /QA_RUN_ID = "\$\{env\.BUILD_TAG\}"/);
  assert.match(pipeline, /fixtures\/parallel-pool\.js/);
  assert.match(pipeline, /scripts\/execution-lock\.mjs/);
  assert.match(pipeline, /dependency-versions\.json/);
  assert.match(pipeline, /npm run toolchain:check/);
  assert.match(pipeline, /ci-surfaces\.mjs --require --format test-surface/);
  assert.match(pipeline, /ci-surfaces\.mjs --require --format csv/);
  assert.match(pipeline, /npm run qa:test -- --surface "\$qa_surface" --project=chromium/);
  assert.match(pipeline, /qa:quality -- --surface "\$qa_surface" --required-surfaces "\$qa_surfaces" --project=chromium/);
  assert.match(pipeline, /allowEmptyArchive:\s*false/);
  assert.match(pipeline, /allowEmptyResults:\s*false/);
  assert.doesNotMatch(pipeline, /\bk6\b/);
  assert.doesNotMatch(pipeline, /stage\('Test \(UI \+ API parallel\)'\)/);
  assert.match(pipeline, /archiveArtifacts artifacts: .*reports\/\*\*.*evidence\/\*\*/);
});

test('GitLab template runs the detected-surface contract and always retains evidence', () => {
  const pipeline = fs.readFileSync(path.join(TEMPLATE_ROOT, '.gitlab-ci.yml'), 'utf8');

  assert.match(pipeline, /mcr\.microsoft\.com\/playwright:v1\.62\.0-noble/);
  assert.match(pipeline, /PW_RETRIES:\s*"1"/);
  assert.match(pipeline, /resource_group:\s*qa-static-test-pool/);
  assert.match(pipeline, /npm run toolchain:check/);
  assert.match(pipeline, /ci-surfaces\.mjs --require --format test-surface/);
  assert.match(pipeline, /ci-surfaces\.mjs --require --format csv/);
  assert.match(pipeline, /npm run qa:preflight -- --surface "\$qa_surface" --require-auth/);
  assert.match(pipeline, /npm run qa:test -- --surface "\$qa_surface" --project=chromium/);
  assert.match(pipeline, /npm run qa:quality -- --surface "\$qa_surface" --required-surfaces "\$qa_surfaces" --project=chromium/);
  assert.match(pipeline, /npm run qa:report -- --mode "\$allure_mode"/);
  assert.match(pipeline, /when:\s*always/);
  assert.match(pipeline, /reports\/junit\.xml/);
  assert.doesNotMatch(pipeline, /TEST_PASS:\s*[^$]/);
  assert.doesNotMatch(pipeline, /\bk6\b/);
});

test('repository release workflow requires the web-automation contract suite', () => {
  const repositoryRoot = path.resolve(HERE, '../../..');
  const workflow = fs.readFileSync(
    path.join(repositoryRoot, '.github/workflows/quality-skills.yml'),
    'utf8',
  );
  assert.match(workflow, /^  web-automation-contracts:/m);
  assert.match(workflow, /node --test dynamic-testing\/web-automation\/tests\/\*\.spec\.mjs/);
});
