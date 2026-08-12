import path from 'node:path'

/**
 * Resolve the project that invoked a QA-skill command.
 *
 * QA_SKILL_PROJECT_ROOT is the explicit escape hatch for wrappers that change
 * cwd before invoking a skill. INIT_CWD preserves the original caller when
 * npm runs a script from another project. Direct node invocations fall back
 * to the current working directory.
 */
export function resolveInvocationRoot(env = process.env, cwd = process.cwd()) {
  return path.resolve(env.QA_SKILL_PROJECT_ROOT || env.INIT_CWD || cwd)
}

export function resolveReadinessOutputDir(env = process.env, cwd = process.cwd()) {
  return path.join(resolveInvocationRoot(env, cwd), 'evidence', 'skill-readiness')
}
