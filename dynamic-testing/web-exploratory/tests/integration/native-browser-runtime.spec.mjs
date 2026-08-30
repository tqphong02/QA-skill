import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createNativeBrowserPool, createNativeBrowserSession } from '../../lib/native-browser.mjs';

const execFileAsync = promisify(execFile);
const testDir = path.dirname(fileURLToPath(import.meta.url));
const nativeCli = path.resolve(testDir, '..', '..', 'scripts', 'helpers', 'native-browser-runtime.mjs');

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
      '<a data-testid="download-report" download="report.txt" href="data:text/plain,READY">Download report</a>',
      '<label for="upload-file">Upload input</label>',
      '<input id="upload-file" data-testid="upload-file" type="file">',
      '<div role="status">Ready</div>',
      '</main>',
    ].join(''));

    const observation = await session.observe({ detail: 'standard' });
    assert.equal(observation.ax_tree.available, true);
    assert.equal(observation.interactive[0].ref, 'e1');
    assert.equal(observation.interactive[0].candidates[0].strategy, 'DATA_TEST_ID');
    assert.equal(observation.interactive[0].candidates[1].strategy, 'ID');
    assert.match(observation.content.text, /Orders/);

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

    const extract = await session.performAction({
      type: 'extract',
      format: 'structured',
      action: 'Extract the visible order page',
      intent: 'Read visible task state',
      capture_media: false,
    });
    assert.match(extract.extracted_content.text, /Search complete/);
    assert.equal(typeof extract.state_delta.progress_score, 'number');

    const downloadObservation = await session.observe();
    const downloadRef = downloadObservation.interactive.find(item => item.name === 'Download report')?.ref;
    const download = await session.performAction({
      type: 'download',
      target_ref: downloadRef,
      action: 'Download the visible report',
      intent: 'Save the requested non-sensitive task attachment',
      capture_media: false,
    });
    assert.equal(download.attachments.length, 1);
    assert.equal(fs.existsSync(download.attachments[0]), true);

    const uploadFixtureDir = path.join(dataDir, 'test-data');
    const uploadFixture = path.join(uploadFixtureDir, 'qa-upload.txt');
    fs.mkdirSync(uploadFixtureDir, { recursive: true });
    fs.writeFileSync(uploadFixture, 'QA upload fixture\n', 'utf8');
    const uploadObservation = await session.observe({ detail: 'standard' });
    const uploadRef = uploadObservation.interactive.find(item => item.name === 'Upload input')?.ref
      || uploadObservation.interactive.find(item => item.candidates?.some(candidate => candidate.value === 'upload-file'))?.ref;
    assert.ok(uploadRef);
    const upload = await session.performAction({
      type: 'upload',
      target_ref: uploadRef,
      file_path: uploadFixture,
      http_method: 'POST',
      action: 'Select the isolated QA upload fixture',
      intent: 'Prepare one bounded upload without submitting the form',
      capture_media: false,
    });
    assert.equal(upload.upload.file_name, 'qa-upload.txt');
    assert.equal(upload.upload.relative_path, 'test-data/qa-upload.txt');
    assert.equal(upload.attachments[0], 'test-data/qa-upload.txt');
    assert.equal(await page.locator('#upload-file').evaluate(element => element.files?.[0]?.name), 'qa-upload.txt');

    const outsideFixture = path.join(path.dirname(dataDir), 'outside-qa-upload.txt');
    fs.writeFileSync(outsideFixture, 'outside\n', 'utf8');
    await session.observe();
    await assert.rejects(
      () => session.performAction({
        type: 'upload',
        selector: '#upload-file',
        strategy: 'STABLE_CSS',
        file_path: outsideFixture,
        action: 'Attempt an out-of-bound upload',
        intent: 'Verify the upload data boundary',
        capture_media: false,
      }),
      error => error.code === 'UPLOAD_PATH_OUTSIDE_DATA_DIR',
    );
    fs.unlinkSync(outsideFixture);

    const secondPage = await session.context.newPage();
    await secondPage.setContent('<h1>Second task page</h1>');
    const secondPageId = await session.registerPage(secondPage);
    const switched = await session.performAction({
      type: 'switch_page',
      target_page_id: secondPageId,
      action: 'Switch to the second task page',
      capture_media: false,
    });
    assert.equal(switched.page_id, secondPageId);
    assert.match(switched.after.headings.join(' '), /Second task page/);

    const batch = await session.performReadOnlyBatch([
      { type: 'scroll', direction: 'down', distance: 100, capture_media: false },
      { type: 'extract', format: 'structured', capture_media: false },
    ]);
    assert.equal(batch.executed_action_count, 2);
    assert.match(batch.results[1].action.extracted_content.text, /Second task page/);
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

test('quick-start and quick-finish execute a complete bounded FAST browser task lifecycle', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-native-quick-task-'));
  const server = http.createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<main><h1>Quick task page</h1><a href="/details">Details</a><table><tbody><tr><td>READY</td></tr></tbody></table></main>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    const started = await execFileAsync(process.execPath, [
      nativeCli,
      'quick-start',
      '--url', `${origin}/`,
      '--objective', 'Read the visible status and details link',
      '--allowed-domain', origin,
    ], {
      cwd: dataDir,
      env: { ...process.env, QA_DATA_DIR: dataDir },
      maxBuffer: 4_000_000,
    });
    const packet = JSON.parse(started.stdout);
    const runId = packet.run_id;
    assert.match(runId, /^fast-\d+$/);
    assert.equal(packet.allowed_origin, origin);
    assert.equal(packet.observation.detail, 'compact');
    assert.equal(packet.observation.context_budget.profile, 'compact');
    assert.match(packet.observation.content.text, /Quick task page/);
    assert.equal(fs.existsSync(packet.task_file), true);
    assert.equal(fs.existsSync(packet.manifest_file), true);

    const finished = await execFileAsync(process.execPath, [
      nativeCli,
      'quick-finish', runId,
      '--verdict', 'PASS',
    ], {
      cwd: dataDir,
      env: { ...process.env, QA_DATA_DIR: dataDir },
      maxBuffer: 2_000_000,
    });
    const result = JSON.parse(finished.stdout);
    assert.equal(result.verdict, 'PASS');
    assert.equal(result.closed.closed, true);
    assert.equal(result.closed.ready_for_cleanup, true);
    assert.equal(result.closed.status, 'CLOSED');
    const task = JSON.parse(fs.readFileSync(packet.task_file, 'utf8'));
    assert.equal(task.status, 'PASS');
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('compact observation materially reduces dense-page model context and exposes lossless escalation', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-native-compact-'));
  let session;
  try {
    session = await createNativeBrowserSession({ dataDir, runId: 'native-compact', headless: true });
    const { page } = session.getPage();
    const buttons = Array.from({ length: 120 }, (_, index) => (
      `<button data-testid="action-${index}">Action ${index}</button>`
    )).join('');
    const rows = Array.from({ length: 100 }, (_, index) => (
      `<tr><td>Order ${index}</td><td>Status ${index}</td><td>Owner ${index}</td></tr>`
    )).join('');
    await page.setContent(`<main><h1>Dense orders</h1>${buttons}<table><tbody>${rows}</tbody></table></main>`);

    const compact = await session.observe();
    const full = await session.observe({ detail: 'full' });
    const compactBytes = Buffer.byteLength(JSON.stringify(compact));
    const fullBytes = Buffer.byteLength(JSON.stringify(full));

    assert.equal(compact.detail, 'compact');
    assert.equal(compact.interactive.length, 32);
    assert.equal('candidates' in compact.interactive[0], false);
    assert.equal(compact.truncation.any, true);
    assert.equal(compact.context_budget.escalation_available, true);
    assert.equal(full.interactive.length, 120);
    assert.equal(full.interactive[0].candidates[0].strategy, 'DATA_TEST_ID');
    assert.ok(compactBytes < fullBytes * 0.5, `expected compact ${compactBytes} to be less than half of full ${fullBytes}`);
  } finally {
    await session?.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
