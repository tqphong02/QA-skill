import { execFileSync } from 'node:child_process';

function lines(repoPath, args) {
  try {
    return execFileSync('git', args, {
      cwd: repoPath,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).split('\n').map(item => item.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Collect committed, staged, unstaged and untracked paths. The working tree
 * delta is essential: a stable HEAD does not prove that source is unchanged.
 */
export function collectChangedFiles(repoPath, lastCommit = '') {
  const changed = new Set();
  if (/^[0-9a-f]{4,40}$/i.test(lastCommit || '')) {
    lines(repoPath, ['diff', `${lastCommit}..HEAD`, '--name-only', '--diff-filter=ACDMRTUXB'])
      .forEach(file => changed.add(file));
  }
  lines(repoPath, ['diff', '--name-only', '--diff-filter=ACDMRTUXB'])
    .forEach(file => changed.add(file));
  lines(repoPath, ['diff', '--cached', '--name-only', '--diff-filter=ACDMRTUXB'])
    .forEach(file => changed.add(file));
  lines(repoPath, ['ls-files', '--others', '--exclude-standard'])
    .forEach(file => changed.add(file));
  return [...changed].sort();
}
