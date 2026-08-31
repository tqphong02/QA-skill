import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  allureMode,
  detectCiSurfaces,
  expectedCiArtifacts,
  isExecutableSpec,
  playwrightSurface,
} from '../assets/templates/scripts/ci-surfaces.mjs';

function withProject(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-surfaces-'));
  try {
    return run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function write(root, relativePath, content = '') {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}

test('CI surface detection follows executable spec paths and ignores empty surfaces', () => {
  withProject(root => {
    write(root, 'tests/ui/app/login.ui.spec.ts');
    write(root, 'tests/functional/app/order.functional.spec.js');
    write(root, 'tests/api/README.md');

    const detection = detectCiSurfaces(root);

    assert.deepEqual(detection.surfaces, ['ui', 'functional']);
    assert.deepEqual(detection.counts, { ui: 1, api: 0, functional: 1 });
    assert.equal(playwrightSurface(detection.surfaces), 'all');
    assert.equal(allureMode(detection.surfaces), 'mixed');
    assert.deepEqual(expectedCiArtifacts(detection.surfaces, '42'), [
      'qa-ui-chromium-42',
      'qa-ui-firefox-42',
      'qa-functional-chromium-42',
      'qa-functional-firefox-42',
    ]);
  });
});

test('API-only projects select one API job, API report mode and one artifact', () => {
  withProject(root => {
    write(root, 'tests/api/orders.api.spec.mts');
    const detection = detectCiSurfaces(root);

    assert.deepEqual(detection.surfaces, ['api']);
    assert.equal(playwrightSurface(detection.surfaces), 'api');
    assert.equal(allureMode(detection.surfaces), 'api');
    assert.deepEqual(expectedCiArtifacts(detection.surfaces, '99'), ['qa-api-99']);
  });
});

test('CI surface detection fails closed when no executable specs exist', () => {
  assert.throws(() => playwrightSurface([]), /CI_SURFACE_EMPTY/);
});

test('copyable example specs are documentation and never activate CI surfaces', () => {
  withProject(root => {
    write(root, 'tests/ui/example.ui.spec.ts');
    write(root, 'tests/api/example.api.spec.ts');
    write(root, 'tests/functional/example.functional.spec.ts');
    write(root, 'tests/ui/example.data-driven.ui.spec.ts');

    const detection = detectCiSurfaces(root);

    assert.deepEqual(detection.surfaces, []);
    assert.deepEqual(detection.counts, { ui: 0, api: 0, functional: 0 });
    assert.equal(isExecutableSpec('example.ui.spec.ts'), false);
    assert.equal(isExecutableSpec('checkout.ui.spec.ts'), true);
    assert.throws(() => playwrightSurface(detection.surfaces), /CI_SURFACE_EMPTY/);
  });
});
