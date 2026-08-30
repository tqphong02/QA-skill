import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = name => path.join(root, 'scripts', name);
const read = name => fs.readFileSync(script(name), 'utf8');

function resolveBash() {
  const candidates = process.platform === 'win32'
    ? [
        process.env.QA_SKILL_BASH,
        'C:\\Program Files\\Git\\bin\\bash.exe',
        'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
      ]
    : [process.env.QA_SKILL_BASH, 'bash'];
  for (const candidate of candidates.filter(Boolean)) {
    const result = spawnSync(candidate, ['--version'], { encoding: 'utf8', timeout: 10000 });
    if (!result.error && result.status === 0) return candidate;
  }
  return null;
}

test('device target gate fails closed before device interaction', t => {
  const bash = resolveBash();
  if (!bash) return t.skip('bash runtime is unavailable');
  const env = { ...process.env };
  delete env.EXECUTION_TARGET;
  delete env.ANDROID_UDID;
  delete env.IOS_SIMULATOR_UDID;
  const result = spawnSync(bash, [script('check-device-target.sh')], {
    encoding: 'utf8',
    env,
    timeout: 15000,
  });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  assert.notEqual(result.status, 0);
  assert.match(output, /BLOCKED: EXECUTION_TARGET is not set/);
});

test('bash and PowerShell doctors preserve typed capability classifications', () => {
  const bashDoctor = read('mobile-doctor.sh');
  const powershellDoctor = read('mobile-doctor.ps1');
  for (const classification of ['runtime_missing', 'mcp_not_loaded']) {
    assert.match(bashDoctor, new RegExp(classification));
    assert.match(powershellDoctor, new RegExp(classification));
  }
  assert.match(bashDoctor, /check_command xcodebuild/);
  assert.match(bashDoctor, /check_command xcrun/);
  assert.match(powershellDoctor, /unsupported_platform/);
  assert.match(bashDoctor, /required_tools=select_device,appium_session_management/);
  assert.match(powershellDoctor, /required_tools=select_device,appium_session_management/);
});

test('HAR analyzer has deterministic redaction and self-test contracts', () => {
  const source = read('analyze-mobile-har.py');
  assert.match(source, /def self_test\(\)/);
  assert.match(source, /"headers_included": False/);
  assert.match(source, /"cookies_included": False/);
  assert.match(source, /"query_values_included": False/);
  assert.match(source, /"bodies_included": False/);
  assert.match(source, /"secret" not in json\.dumps\(result\)/);
});

test('Appium MCP configurator is dry-run safe, atomic and read-back verified', () => {
  const source = read('configure-appium-mcp.py');
  assert.match(source, /if args\.dry_run:/);
  assert.match(source, /DRY_RUN write=none/);
  assert.match(source, /NamedTemporaryFile/);
  assert.match(source, /os\.replace\(temporary, path\)/);
  assert.match(source, /shutil\.copy2\(config_path, backup_path\)/);
  assert.match(source, /Appium MCP read-back mismatch/);
});

test('mobile scaffolds retain explicit target and selector ownership', () => {
  const required = [
    'assets/wdio-template/wdio.conf.mjs',
    'assets/wdio-template/pageobjects/app.page.mjs',
    'assets/wdio-template/selectors/app.selectors.mjs',
    'assets/wdio-template/test/specs/smoke.e2e.mjs',
    'assets/ci/github/pr-android-smoke.yml',
  ];
  for (const relative of required) {
    assert.equal(fs.existsSync(path.join(root, relative)), true, `missing ${relative}`);
  }
  const workflow = fs.readFileSync(path.join(root, 'assets/ci/github/pr-android-smoke.yml'), 'utf8');
  assert.match(workflow, /EXECUTION_TARGET/);
  assert.match(workflow, /check-device-target\.sh/);
});
