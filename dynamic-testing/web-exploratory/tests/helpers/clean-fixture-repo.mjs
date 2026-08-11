import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function runGit(repoPath, args) {
  const result = spawnSync('git', args, {
    cwd: repoPath,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

export function createCleanFixtureRepo(sourceDir, tempRoot, name = path.basename(sourceDir)) {
  const repoPath = path.join(tempRoot, name);
  fs.cpSync(sourceDir, repoPath, { recursive: true });
  runGit(repoPath, ['init', '--quiet']);
  runGit(repoPath, ['config', 'user.email', 'qa-skill-fixture@example.invalid']);
  runGit(repoPath, ['config', 'user.name', 'QA-skill fixture']);
  runGit(repoPath, ['config', 'commit.gpgsign', 'false']);
  runGit(repoPath, ['add', '.']);
  runGit(repoPath, ['commit', '--quiet', '--no-verify', '-m', 'fixture baseline']);
  return repoPath;
}
