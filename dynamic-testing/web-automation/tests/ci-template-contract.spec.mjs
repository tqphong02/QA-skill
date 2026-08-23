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

  assert.match(workflow, /NODE_VERSION:\s*'24'/);
  assert.match(workflow, /PW_RETRIES:\s*'1'/);
  assert.match(workflow, /group: qa-static-pool-\$\{\{ github\.repository \}\}/);
  assert.match(workflow, /cancel-in-progress:\s*false/);
  assert.match(workflow, /^  test-ui:/m);
  assert.match(workflow, /^  test-api:/m);
  assert.match(workflow, /^  test-functional:/m);
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
  assert.match(workflow, /needs: \[test-ui, test-functional, test-api\]/);
  assert.doesNotMatch(workflow, /actions\/(?:checkout|setup-node|upload-artifact|download-artifact)@v4/);
  assert.doesNotMatch(workflow, /actions\/cache@/);
  assert.match(packageJson.engines.node, /\^24\.0\.0/);
  assert.match(packageJson.devDependencies['@types/node'], /\^24\./);
});

test('Jenkins template avoids concurrent reporters in one workspace and runs every surface', () => {
  const pipeline = fs.readFileSync(path.join(TEMPLATE_ROOT, 'Jenkinsfile'), 'utf8');

  assert.match(pipeline, /nodejs 'Node-24'/);
  assert.match(pipeline, /CI = 'true'/);
  assert.match(pipeline, /PW_RETRIES = '1'/);
  assert.match(pipeline, /disableConcurrentBuilds\(\)/);
  assert.match(pipeline, /QA_RUN_ID = "\$\{env\.BUILD_TAG\}"/);
  assert.match(pipeline, /fixtures\/parallel-pool\.js/);
  assert.match(pipeline, /scripts\/execution-lock\.mjs/);
  assert.match(pipeline, /npm run qa:test -- --surface all --project=chromium/);
  assert.doesNotMatch(pipeline, /stage\('Test \(UI \+ API parallel\)'\)/);
  assert.match(pipeline, /archiveArtifacts artifacts: .*reports\/\*\*.*evidence\/\*\*/);
});
