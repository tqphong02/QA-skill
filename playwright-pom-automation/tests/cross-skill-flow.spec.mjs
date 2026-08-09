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

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function fileSha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

test('structured testcase generates a lossless POM plan and passes strict fixture traceability', () => {
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
    const generated = spawnSync('python3', [
      path.join(REPO_ROOT, 'testcase-template/scripts/gen-testcases.py'),
      path.join(REPO_ROOT, 'testcase-template/examples/structured-input.json'),
      excelPath,
      path.join(REPO_ROOT, 'testcase-template/assets/Template.xlsx'),
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
    assert.deepEqual(parsed.cases.map(item => item.id), ['DEMO-01', 'DEMO-02']);
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
      for (const step of testcase.steps) {
        specLines.push(`  await test.step('${step.marker}', async () => { await generatedPage.performStep('${step.id}'); });`);
      }
      for (const outcome of testcase.outcome_assertions) {
        specLines.push(`  await test.step('${outcome.marker}', async () => { await expect(generatedPage.outcomeLocator).toBeVisible(); });`);
      }
      if (testcase.required_markers.cleanup) {
        specLines.push(`  await test.step('${testcase.required_markers.cleanup}', async () => { await generatedPage.cleanup(); });`);
      }
      specLines.push('});');
    }
    fs.writeFileSync(path.join(specDir, 'demo.ui.spec.ts'), `${specLines.join('\n')}\n`, 'utf8');
    fs.writeFileSync(path.join(pageDir, 'generated.page.ts'), `
import type { Locator, Page } from '@playwright/test';
import { generatedSelectors } from '../selectors/demo.selectors';

export class GeneratedPage {
  constructor(private readonly page: Page) {}
  async performStep(stepId: string): Promise<void> {
    await generatedSelectors.byStep(this.page, stepId).click();
  }
  get outcomeLocator(): Locator {
    return generatedSelectors.outcome(this.page);
  }
  async cleanup(): Promise<void> {
    await this.page.goto('/cleanup');
  }
}
`, 'utf8');

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
