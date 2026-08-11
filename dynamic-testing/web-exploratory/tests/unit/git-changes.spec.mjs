import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectChangedFiles } from '../../lib/git-changes.mjs';

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, stdio: 'ignore' });
}

test('collectChangedFiles includes unstaged files when HEAD is unchanged', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-git-delta-'));
  try {
    git(repo, 'init', '-q');
    git(repo, 'config', 'user.email', 'qa@example.test');
    git(repo, 'config', 'user.name', 'QA Test');
    fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'src', 'orders.ts'), 'export const version = 1;\n');
    git(repo, 'add', '.');
    git(repo, 'commit', '-qm', 'initial');
    const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
    fs.writeFileSync(path.join(repo, 'src', 'orders.ts'), 'export const version = 2;\n');
    const changed = collectChangedFiles(repo, commit);
    assert.deepEqual(changed, ['src/orders.ts']);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
