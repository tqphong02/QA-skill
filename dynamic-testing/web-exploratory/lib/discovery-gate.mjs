import fs from 'node:fs';
import path from 'node:path';

export const DISCOVERY_ARTIFACTS = {
  'repo-fingerprint.mjs': 'repo-metadata.json',
  'source-indexer.mjs': 'symbol-index.json',
  'architecture-discovery.mjs': 'architecture-map.json',
  'api-contract-extractor.mjs': 'api-contracts.json',
  'business-rule-extractor.mjs': 'business-rules.json',
  'business-flow-builder.mjs': 'business-flows.json',
  'state-machine-extractor.mjs': 'state-machines.json',
  'permission-matrix-extractor.mjs': 'permission-matrix.json',
  'database-domain-extractor.mjs': 'domain-model.json',
  'repo-runtime-reconciler.mjs': 'reconciliation-report.json',
  'business-qna-generator.mjs': 'business-qna.json',
  'write-repo-business-guide.mjs': 'business-guide.md',
  'traceability-matrix-generator.mjs': 'traceability-matrix.md',
  'write-rbac-matrix.mjs': 'rbac-matrix.md',
};

export function artifactExists(outputDir, taskName) {
  const relative = DISCOVERY_ARTIFACTS[taskName];
  return relative ? fs.existsSync(path.join(outputDir, relative)) : true;
}

/**
 * Fail closed on a real scanner error or on a reused artifact that is absent.
 * Optional Graphify may be unavailable in auto/off mode and is excluded by
 * the caller; every canonical business artifact remains required.
 */
export function assertDiscoveryStage({ stage, outputDir, tasks = [], results = [], optional = [] }) {
  const optionalSet = new Set(optional);
  const resultByName = new Map(results.map(result => [result.name, result]));
  const failures = [];
  const missing = [];

  for (const task of tasks) {
    const result = resultByName.get(task.name);
    if (result && !result.ok && !optionalSet.has(task.name)) {
      failures.push(`${task.name}${result.status === null ? '' : ` (exit ${result.status ?? 'error'})`}`);
      continue;
    }
    if (!optionalSet.has(task.name) && !artifactExists(outputDir, task.name)) {
      missing.push(`${task.name} -> ${DISCOVERY_ARTIFACTS[task.name] || 'artifact'}`);
    }
  }

  if (failures.length || missing.length) {
    const details = [
      failures.length ? `failed: ${failures.join(', ')}` : '',
      missing.length ? `missing: ${missing.join(', ')}` : '',
    ].filter(Boolean).join('; ');
    throw new Error(`[${stage}] BLOCKED: discovery gate failed closed (${details})`);
  }

  return {
    stage,
    status: 'PASS',
    task_count: tasks.length,
    reused_artifacts: tasks
      .filter(task => !resultByName.has(task.name) && artifactExists(outputDir, task.name))
      .map(task => task.name),
  };
}
