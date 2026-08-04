import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createNativeBrowserPool, createNativeBrowserSession } from '../../lib/native-browser.mjs';

test('native runtime observes AX state, resolves data-testid first and invalidates refs after action', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-native-runtime-'));
  let session;
  try {
    session = await createNativeBrowserSession({ dataDir, runId: 'native-integration', headless: true });
    const { page } = session.getPage();
    await page.setContent([
      '<main>',
      '<h1>Orders</h1>',
      '<label for="order-number">Order number</label>',
      '<input id="order-number" data-testid="order-number" placeholder="Order number">',
      '<button id="search" data-testid="search-order" onclick="document.querySelector(\'[role=status]\').textContent=\'Search complete\'">Search</button>',
      '<div role="status">Ready</div>',
      '</main>',
    ].join(''));

    const observation = await session.observe();
    assert.equal(observation.ax_tree.available, true);
    assert.equal(observation.interactive[0].ref, 'e1');
    assert.equal(observation.interactive[0].candidates[0].strategy, 'DATA_TEST_ID');
    assert.equal(observation.interactive[0].candidates[1].strategy, 'ID');

    const fill = await session.performAction({
      type: 'fill',
      target_ref: 'e1',
      decision_id: 'DEC-0001',
      value: 'ORD-001',
      action: 'Fill order number',
      intent: 'Prepare a read-only order search',
      capture_media: false,
    });
    assert.equal(fill.locator_evidence.strategy, 'DATA_TEST_ID');
    assert.equal(fill.decision_id, 'DEC-0001');
    assert.equal(fill.next_observation_required, true);

    await assert.rejects(
      () => session.performAction({ type: 'click', target_ref: 'e1', action: 'Click stale target' }),
      error => error.code === 'STALE_TARGET',
    );

    const refreshed = await session.observe();
    const searchRef = refreshed.interactive.find(item => item.name === 'Search')?.ref;
    assert.ok(searchRef);
    const click = await session.performAction({
      type: 'click',
      target_ref: searchRef,
      action: 'Click search button',
      intent: 'Run the order search',
    });
    assert.equal(click.locator_evidence.strategy, 'DATA_TEST_ID');
    assert.equal(click.media_refs.length, 1);
    assert.equal(fs.existsSync(click.media_refs[0]), true);
  } finally {
    await session?.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('native pool isolates page state, session IDs and evidence paths per worker', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-native-pool-'));
  let pool;
  try {
    pool = await createNativeBrowserPool({ dataDir, runId: 'native-pool', workers: 2, headless: true });
    const workerOne = pool.getWorker(1);
    const workerTwo = pool.getWorker(2);
    await workerOne.getPage().page.setContent('<h1>Worker one</h1>');
    await workerTwo.getPage().page.setContent('<h1>Worker two</h1>');
    const [one, two] = await Promise.all([workerOne.observe(), workerTwo.observe()]);
    assert.notEqual(one.session_id, two.session_id);
    assert.notEqual(pool.health().sessions[0].evidence_dir, pool.health().sessions[1].evidence_dir);
    assert.equal(one.ax_tree.available, true);
    assert.equal(two.ax_tree.available, true);
    assert.match(one.ax_tree.nodes.map(node => node.name).join(' '), /Worker one/);
    assert.match(two.ax_tree.nodes.map(node => node.name).join(' '), /Worker two/);
  } finally {
    await pool?.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
