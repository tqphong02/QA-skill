import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'

import { resolveInvocationRoot, resolveReadinessOutputDir } from './invocation-paths.mjs'

test('explicit project root has priority over npm and cwd values', () => {
  const env = {
    QA_SKILL_PROJECT_ROOT: '/tmp/caller-project',
    INIT_CWD: '/tmp/npm-project',
  }

  assert.equal(resolveInvocationRoot(env, '/tmp/current-directory'), '/tmp/caller-project')
})

test('npm preserves the original caller project through INIT_CWD', () => {
  const env = { INIT_CWD: '/tmp/npm-project' }

  assert.equal(resolveInvocationRoot(env, '/tmp/qa-skill'), '/tmp/npm-project')
})

test('direct invocation falls back to the current working directory', () => {
  assert.equal(resolveInvocationRoot({}, '/tmp/direct-project'), '/tmp/direct-project')
})

test('readiness reports are rooted in the invoking project', () => {
  assert.equal(
    resolveReadinessOutputDir({}, '/tmp/caller-project'),
    path.join('/tmp/caller-project', 'evidence', 'skill-readiness'),
  )
})
