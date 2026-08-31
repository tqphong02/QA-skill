import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildPomPlan } from '../assets/templates/scripts/generate-pom-plan.mjs';
import {
  buildTraceability,
  parseAutomationManifest,
} from '../assets/templates/scripts/verify-testcase-traceability.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function fileSha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function writeUiInventory(root) {
  const inventoryPath = path.join(root, 'ui-function-inventory.json');
  fs.writeFileSync(inventoryPath, JSON.stringify({
    schema_version: 1,
    artifact: 'UI_FUNCTION_INVENTORY',
    provider: 'playwright-mcp',
    browser_driver: 'playwright-mcp',
    browser_observer: 'playwright-mcp',
    tools_used: ['browser_navigate', 'browser_snapshot', 'browser_evaluate'],
    mcp: { session_id: 'cross-skill-fixture-session', tools_used: [] },
    run_id: 'cross-skill-fixture-run',
    app_build: 'cross-skill-fixture-build',
    captured_at: new Date().toISOString(),
    functions: [
      {
        function_key: 'LOGIN_PAGE_OPEN',
        name: 'Open login page',
        route: '/login',
        state: 'logged_out',
        role_key: 'employee',
        target_keys: ['login_page'],
        actions: ['navigate'],
      },
      {
        function_key: 'LOGIN_EMAIL_INPUT',
        name: 'Enter email',
        route: '/login',
        state: 'logged_out',
        role_key: 'employee',
        target_keys: ['email_input'],
        actions: ['click', 'fill'],
      },
      {
        function_key: 'LOGIN_FORM_VISIBLE',
        name: 'Observe login form',
        route: '/login',
        state: 'logged_out',
        role_key: 'employee',
        target_keys: ['login_form'],
        actions: ['assert'],
      },
      {
        function_key: 'LOGIN_PASSWORD_INPUT',
        name: 'Enter password',
        route: '/login',
        state: 'logged_out',
        role_key: 'employee',
        target_keys: ['password_input'],
        actions: ['click', 'fill'],
      },
      {
        function_key: 'LOGIN_SUBMIT',
        name: 'Submit login',
        route: '/login',
        state: 'logged_out',
        role_key: 'employee',
        target_keys: ['login_submit'],
        actions: ['click'],
      },
      {
        function_key: 'DASHBOARD_HEADING_VISIBLE',
        name: 'Observe dashboard heading',
        route: '/dashboard',
        state: 'authenticated',
        role_key: 'employee',
        target_keys: ['dashboard_heading'],
        actions: ['assert'],
      },
    ],
  }, null, 2), 'utf8');
  return inventoryPath;
}

function resolvePythonCommand() {
  const configured = process.env.PYTHON || process.env.PYTHON3;
  const windowsInstalls = process.platform === 'win32'
    ? (() => {
      const pythonRoot = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python');
      if (!fs.existsSync(pythonRoot)) return [];
      return fs.readdirSync(pythonRoot).sort().reverse()
        .map(entry => path.join(pythonRoot, entry, 'python.exe'))
        .filter(executable => fs.existsSync(executable))
        .map(command => ({ command, prefix: [] }));
    })()
    : [];
  const candidates = configured
    ? [{ command: configured, prefix: [] }]
    : process.platform === 'win32'
      ? [
        ...windowsInstalls,
        { command: 'py', prefix: ['-3'] },
        { command: 'python', prefix: [] },
        { command: 'python3', prefix: [] },
      ]
      : [
        { command: 'python3', prefix: [] },
        { command: 'python', prefix: [] },
      ];

  return candidates.find(({ command, prefix }) => {
    const probe = spawnSync(command, [...prefix, '--version'], { stdio: 'ignore' });
    return probe.status === 0;
  }) || null;
}

test('structured testcase generates a lossless POM plan and passes strict fixture traceability', (t) => {
  const python = resolvePythonCommand();
  if (!python) {
    t.skip('Python 3 runtime is unavailable; testcase-authoring generator is Python-based');
    return;
  }

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'testcase-pom-flow-'));
  try {
    const testcaseDir = path.join(root, 'testcases');
    const specDir = path.join(root, 'tests', 'ui');
    const selectorDir = path.join(root, 'selectors');
    const pageDir = path.join(root, 'pages');
    const evidenceDir = path.join(root, 'selector-evidence');
    for (const directory of [testcaseDir, specDir, selectorDir, pageDir, evidenceDir]) {
      fs.mkdirSync(directory, { recursive: true });
    }

    const excelPath = path.join(testcaseDir, 'demo.xlsx');
    const generated = spawnSync(python.command, [
      ...python.prefix,
      path.join(REPO_ROOT, 'support/testcase-authoring/scripts/gen-testcases.py'),
      path.join(REPO_ROOT, 'support/testcase-authoring/examples/structured-input.json'),
      excelPath,
      path.join(REPO_ROOT, 'support/testcase-authoring/assets/Template.xlsx'),
    ], {
      encoding: 'utf8',
      env: { ...process.env, QA_PRESERVE_EXACT_FILENAME: '1', PYTHONDONTWRITEBYTECODE: '1' },
    });
    assert.equal(generated.status, 0, `${generated.stdout}\n${generated.stderr}`);

    const markdownPath = path.join(testcaseDir, 'demo.md');
    const manifestPath = path.join(testcaseDir, 'demo.automation.json');
    assert.ok(fs.existsSync(markdownPath));
    assert.ok(fs.existsSync(manifestPath));

    const parsed = parseAutomationManifest(manifestPath);
    const plan = buildPomPlan(manifestPath);
    const slicedPlan = buildPomPlan(manifestPath, { testcaseIds: ['DEMO-01'] });
    const rawManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.deepEqual(parsed.cases.map(item => item.id), ['DEMO-01', 'DEMO-02']);
    assert.deepEqual(
      plan.testcases.map(item => item.steps.map(step => ({ action: step.action, value: step.value }))),
      rawManifest.testcases.map(item => item.execution.steps.map(step => ({ action: step.action, value: step.value ?? null }))),
    );
    assert.deepEqual(slicedPlan.testcases.map(item => item.testcase_id), ['DEMO-01']);
    assert.equal(slicedPlan.selection.total_count, 2);
    const planScript = path.join(
      REPO_ROOT,
      'dynamic-testing/web-automation/assets/templates/scripts/generate-pom-plan.mjs',
    );
    const oversized = spawnSync('node', [
      planScript, '--manifest', manifestPath, '--max-cases', '1',
    ], { encoding: 'utf8' });
    assert.equal(oversized.status, 2);
    assert.match(oversized.stderr, /selection contains 2 cases/);
    const slicedOutput = path.join(testcaseDir, 'demo-one.pom-plan.json');
    const sliced = spawnSync('node', [
      planScript,
      '--manifest', manifestPath,
      '--testcase-id', 'DEMO-01',
      '--max-cases', '1',
      '--output', slicedOutput,
    ], { encoding: 'utf8' });
    assert.equal(sliced.status, 0, sliced.stderr);
    assert.equal(JSON.parse(fs.readFileSync(slicedOutput, 'utf8')).testcases.length, 1);
    const unifiedRunner = path.join(
      REPO_ROOT,
      'dynamic-testing/web-automation/assets/templates/scripts/run-testcase-pom.mjs',
    );
    const uiInventoryPath = writeUiInventory(root);
    const unifiedPlanOutput = path.join(root, 'reports', 'testcase-pom-plan.json');
    const unifiedPlan = spawnSync('node', [
      unifiedRunner,
      '--phase', 'plan',
      '--project-root', root,
      '--manifest', manifestPath,
      '--testcase-id', 'DEMO-01',
      '--max-cases', '1',
      '--ui-inventory', uiInventoryPath,
      '--app-build', 'cross-skill-fixture-build',
      '--plan-output', unifiedPlanOutput,
    ], { encoding: 'utf8' });
    const uiCoverageOutput = path.join(root, 'reports', 'ui-function-coverage.json');
    const uiCoverageDiagnostics = fs.existsSync(uiCoverageOutput)
      ? fs.readFileSync(uiCoverageOutput, 'utf8')
      : '';
    assert.equal(
      unifiedPlan.status,
      0,
      `${unifiedPlan.stdout}\n${unifiedPlan.stderr}\n${uiCoverageDiagnostics}`,
    );
    assert.equal(JSON.parse(fs.readFileSync(unifiedPlanOutput, 'utf8')).testcases[0].testcase_id, 'DEMO-01');
    assert.ok(plan.testcases[0].outcome_assertions.some(item => item.assertion.target === 'dashboard_heading'));
    assert.deepEqual(plan.testcases[0].rbac_refs, ['RBAC-DASH-001']);

    const specLines = [
      "import { test, expect } from '@playwright/test';",
      "import { GeneratedPage } from '../../pages/generated.page';",
      `const source = '${plan.source_marker}';`,
    ];
    for (const testcase of plan.testcases) {
      specLines.push(`test('${testcase.testcase_id} @ui', async ({ page }) => {`);
      specLines.push('  const generatedPage = new GeneratedPage(page);');
      if (testcase.required_markers.role) {
        specLines.push(`  test.info().annotations.push({ type: 'contract', description: '${testcase.required_markers.role}' });`);
      }
      for (const marker of testcase.required_markers.rbac) {
        specLines.push(`  test.info().annotations.push({ type: 'contract', description: '${marker}' });`);
      }
      for (const marker of testcase.required_markers.coverage) {
        specLines.push(`  test.info().annotations.push({ type: 'contract', description: '${marker}' });`);
      }
      for (const step of testcase.steps) {
        const primitiveValue = ['string', 'number', 'boolean'].includes(typeof step.value)
          ? JSON.stringify(step.value)
          : '';
        specLines.push(`  await test.step('${step.marker}', async () => { await generatedPage.${step.required_method}(${primitiveValue}); });`);
        for (const assertion of step.assertions) {
          const matcher = assertion.required_matchers.find(item => item !== 'expect(') || 'toBeTruthy';
          specLines.push(`  await test.step('${assertion.marker}', async () => { await expect(generatedPage.outcomeLocator).${matcher}(); });`);
        }
      }
      for (const outcome of testcase.outcome_assertions) {
        const matcher = outcome.required_matchers.find(item => item !== 'expect(') || 'toBeTruthy';
        specLines.push(`  await test.step('${outcome.marker}', async () => { await expect(generatedPage.outcomeLocator).${matcher}(); });`);
      }
      if (testcase.required_markers.cleanup) {
        specLines.push(`  await test.step('${testcase.required_markers.cleanup}', async () => { await generatedPage.cleanup(); });`);
      }
      specLines.push('});');
    }
    fs.writeFileSync(path.join(specDir, 'demo.ui.spec.ts'), `${specLines.join('\n')}\n`, 'utf8');
    const pageLines = [
      "import type { Locator, Page } from '@playwright/test';",
      "import { generatedSelectors } from '../selectors/demo.selectors';",
      'export class GeneratedPage {',
      '  constructor(private readonly page: Page) {}',
    ];
    const emittedMethods = new Set();
    for (const testcase of plan.testcases) {
      for (const step of testcase.steps) {
        if (emittedMethods.has(step.required_method)) continue;
        emittedMethods.add(step.required_method);
        const locator = `generatedSelectors.byStep(this.page, '${step.id}')`;
        const implementation = step.action === 'navigate'
          ? "await this.page.goto('/fixture');"
          : step.action === 'fill'
            ? `await ${locator}.fill('fixture');`
            : step.action === 'clear'
              ? `await ${locator}.clear();`
              : step.action === 'select'
                ? `await ${locator}.selectOption('fixture');`
                : step.action === 'press'
                  ? `await ${locator}.press('Enter');`
                  : `await ${locator}.click();`;
        pageLines.push(`  async ${step.required_method}(): Promise<void> { ${implementation} }`);
      }
    }
    pageLines.push(
      '  get outcomeLocator(): Locator { return generatedSelectors.outcome(this.page); }',
      "  async cleanup(): Promise<void> { await this.page.goto('/cleanup'); }",
      '}',
    );
    fs.writeFileSync(path.join(pageDir, 'generated.page.ts'), `${pageLines.join('\n')}\n`, 'utf8');

    const selectorLines = [
      "import type { Page } from '@playwright/test';",
      'export const generatedSelectors = {',
      "  byStep: (page: Page, stepId: string) => page.getByTestId(`step-${stepId}`),",
      "  outcome: (page: Page) => page.getByTestId('dashboard_heading'),",
    ];
    const evidenceTargets = [];
    for (const testcase of parsed.cases) {
      for (const targetKey of testcase.target_keys) {
        const locator = `page.getByTestId('${targetKey}')`;
        selectorLines.push(`  '${testcase.id}-${targetKey}': (page) => ${locator},`);
        evidenceTargets.push({
          target_key: targetKey,
          status: 'runtime_verified',
          strategy: 'testid',
          locator,
          route: testcase.target_routes[targetKey],
          role: testcase.role_key,
          candidates: [{ strategy: 'testid', available: true, source: 'fixture DOM contract' }],
          verification: {
            count: 1,
            visible: testcase.expected_visibility_by_target[targetKey] !== false,
            actionable: testcase.expected_visibility_by_target[targetKey] !== false,
          },
        });
      }
    }
    selectorLines.push('} as const;');
    fs.writeFileSync(path.join(selectorDir, 'demo.selectors.ts'), `${selectorLines.join('\n')}\n`, 'utf8');
    fs.writeFileSync(path.join(evidenceDir, 'demo.json'), JSON.stringify({
      schema_version: 1,
      feature: 'demo',
      captured_at: new Date().toISOString(),
      run_id: 'fixture-selector-run',
      app_build: 'fixture-build',
      targets: evidenceTargets,
    }, null, 2), 'utf8');

    const report = buildTraceability({
      testcasePath: markdownPath,
      manifestPath,
      automationRoot: root,
      evidenceDir,
      mode: 'ui',
    });
    assert.equal(report.status, 'PASS', JSON.stringify(report.violations, null, 2));
    assert.equal(report.source.automation_manifest_sha256, fileSha256(manifestPath));
    assert.equal(report.summary.testcase_mapped_count, 2);
    assert.ok(report.cases.every(item => item.implementation_markers.every(marker => marker.present)));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
