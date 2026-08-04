/**
 * registry.mjs — Backward-compatible Script Registry for qa-run/scripts
 *
 * Ánh xạ toàn bộ tên script sang đường dẫn tương đối theo 7 nhóm thư mục chuyên trách:
 *   discovery/, rbac/, ui-reconciliation/, writers/, analysis/, orchestrators/, helpers/
 *
 * Hỗ trợ tra cứu cả tên có đuôi (.mjs, .py, .sh) và không có đuôi.
 * Có cơ chế fallback tự động tìm trong thư mục gốc khi file chưa được di chuyển.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SCRIPTS_DIR = __dirname;

export const SCRIPT_REGISTRY = {
  // ── 1. Discovery (Static Repo Scanning) ──────────────────────────────
  'architecture-discovery.mjs': 'discovery/architecture-discovery.mjs',
  'architecture-discovery': 'discovery/architecture-discovery.mjs',
  'api-contract-extractor.mjs': 'discovery/api-contract-extractor.mjs',
  'api-contract-extractor': 'discovery/api-contract-extractor.mjs',
  'business-rule-extractor.mjs': 'discovery/business-rule-extractor.mjs',
  'business-rule-extractor': 'discovery/business-rule-extractor.mjs',
  'business-flow-builder.mjs': 'discovery/business-flow-builder.mjs',
  'business-flow-builder': 'discovery/business-flow-builder.mjs',
  'database-domain-extractor.mjs': 'discovery/database-domain-extractor.mjs',
  'database-domain-extractor': 'discovery/database-domain-extractor.mjs',
  'state-machine-extractor.mjs': 'discovery/state-machine-extractor.mjs',
  'state-machine-extractor': 'discovery/state-machine-extractor.mjs',
  'source-indexer.mjs': 'discovery/source-indexer.mjs',
  'source-indexer': 'discovery/source-indexer.mjs',
  'repo-fingerprint.mjs': 'discovery/repo-fingerprint.mjs',
  'repo-fingerprint': 'discovery/repo-fingerprint.mjs',
  'graphify-adapter.mjs': 'discovery/graphify-adapter.mjs',
  'graphify-adapter': 'discovery/graphify-adapter.mjs',
  'traceability-matrix-generator.mjs': 'discovery/traceability-matrix-generator.mjs',
  'traceability-matrix-generator': 'discovery/traceability-matrix-generator.mjs',

  // ── 2. RBAC (Permission & Security) ──────────────────────────────────
  'permission-matrix-extractor.mjs': 'rbac/permission-matrix-extractor.mjs',
  'permission-matrix-extractor': 'rbac/permission-matrix-extractor.mjs',
  'rbac-api-tester.mjs': 'rbac/rbac-api-tester.mjs',
  'rbac-api-tester': 'rbac/rbac-api-tester.mjs',

  // ── 3. UI Business Reconciliation ───────────────────────────────────
  'ui-action-intent-classifier.mjs': 'ui-reconciliation/ui-action-intent-classifier.mjs',
  'ui-action-intent-classifier': 'ui-reconciliation/ui-action-intent-classifier.mjs',
  'ui-business-ambiguity-detector.mjs': 'ui-reconciliation/ui-business-ambiguity-detector.mjs',
  'ui-business-ambiguity-detector': 'ui-reconciliation/ui-business-ambiguity-detector.mjs',
  'ui-business-component-extractor.mjs': 'ui-reconciliation/ui-business-component-extractor.mjs',
  'ui-business-component-extractor': 'ui-reconciliation/ui-business-component-extractor.mjs',
  'ui-business-reconciler.mjs': 'ui-reconciliation/ui-business-reconciler.mjs',
  'ui-business-reconciler': 'ui-reconciliation/ui-business-reconciler.mjs',
  'ui-observed-flow-builder.mjs': 'ui-reconciliation/ui-observed-flow-builder.mjs',
  'ui-observed-flow-builder': 'ui-reconciliation/ui-observed-flow-builder.mjs',
  'ui-region-segmenter.mjs': 'ui-reconciliation/ui-region-segmenter.mjs',
  'ui-region-segmenter': 'ui-reconciliation/ui-region-segmenter.mjs',
  'ui-runtime-transition-verifier.mjs': 'ui-reconciliation/ui-runtime-transition-verifier.mjs',
  'ui-runtime-transition-verifier': 'ui-reconciliation/ui-runtime-transition-verifier.mjs',
  'ui-state-explorer.mjs': 'ui-reconciliation/ui-state-explorer.mjs',
  'ui-state-explorer': 'ui-reconciliation/ui-state-explorer.mjs',
  'visual-business-signal-extractor.mjs': 'ui-reconciliation/visual-business-signal-extractor.mjs',
  'visual-business-signal-extractor': 'ui-reconciliation/visual-business-signal-extractor.mjs',
  'visual-evidence-router.mjs': 'ui-reconciliation/visual-evidence-router.mjs',
  'visual-evidence-router': 'ui-reconciliation/visual-evidence-router.mjs',
  'capture-ui-business-evidence.mjs': 'ui-reconciliation/capture-ui-business-evidence.mjs',
  'capture-ui-business-evidence': 'ui-reconciliation/capture-ui-business-evidence.mjs',
  'ui-business-qna-generator.mjs': 'ui-reconciliation/ui-business-qna-generator.mjs',
  'ui-business-qna-generator': 'ui-reconciliation/ui-business-qna-generator.mjs',

  // ── 4. Writers (Guide & Report Generators) ───────────────────────────
  'write-business-guide.mjs': 'writers/write-business-guide.mjs',
  'write-business-guide': 'writers/write-business-guide.mjs',
  'write-repo-business-guide.mjs': 'writers/write-repo-business-guide.mjs',
  'write-repo-business-guide': 'writers/write-repo-business-guide.mjs',
  'write-ui-business-guide.mjs': 'writers/write-ui-business-guide.mjs',
  'write-ui-business-guide': 'writers/write-ui-business-guide.mjs',
  'render-intelligence-html.mjs': 'writers/render-intelligence-html.mjs',
  'render-intelligence-html': 'writers/render-intelligence-html.mjs',
  'write-rbac-matrix.mjs': 'writers/write-rbac-matrix.mjs',
  'write-rbac-matrix': 'writers/write-rbac-matrix.mjs',
  'business-qna-generator.mjs': 'writers/business-qna-generator.mjs',
  'business-qna-generator': 'writers/business-qna-generator.mjs',
  'validate-knowledge.mjs': 'writers/validate-knowledge.mjs',
  'validate-knowledge': 'writers/validate-knowledge.mjs',

  // ── 5. Analysis (Reconcilers & Attack Surface) ───────────────────────
  'finding-reconciler.mjs': 'analysis/finding-reconciler.mjs',
  'finding-reconciler': 'analysis/finding-reconciler.mjs',
  'repo-runtime-reconciler.mjs': 'analysis/repo-runtime-reconciler.mjs',
  'repo-runtime-reconciler': 'analysis/repo-runtime-reconciler.mjs',
  'attack-surface.mjs': 'analysis/attack-surface.mjs',
  'attack-surface': 'analysis/attack-surface.mjs',

  // ── 6. Orchestrators ─────────────────────────────────────────────────
  'repo-business-discovery.mjs': 'orchestrators/repo-business-discovery.mjs',
  'repo-business-discovery': 'orchestrators/repo-business-discovery.mjs',
  'ui-business-reconciliation.mjs': 'orchestrators/ui-business-reconciliation.mjs',
  'ui-business-reconciliation': 'orchestrators/ui-business-reconciliation.mjs',

  // ── 7. Helpers (Execution, Data, Evidence, Utils) ────────────────────
  'execute-sheet.mjs': 'helpers/execute-sheet.mjs',
  'execute-sheet': 'helpers/execute-sheet.mjs',
  'drive_sheet_execute.py': 'helpers/drive_sheet_execute.py',
  'drive_sheet_execute': 'helpers/drive_sheet_execute.py',
  'extract-flow.mjs': 'helpers/extract-flow.mjs',
  'extract-flow': 'helpers/extract-flow.mjs',
  'generate-checklist.mjs': 'helpers/generate-checklist.mjs',
  'generate-checklist': 'helpers/generate-checklist.mjs',
  'data-factory.mjs': 'helpers/data-factory.mjs',
  'data-factory': 'helpers/data-factory.mjs',
  'collect-evidence.mjs': 'helpers/collect-evidence.mjs',
  'collect-evidence': 'helpers/collect-evidence.mjs',
  'run-manifest.mjs': 'helpers/run-manifest.mjs',
  'run-manifest': 'helpers/run-manifest.mjs',
  'log-bug.mjs': 'helpers/log-bug.mjs',
  'log-bug': 'helpers/log-bug.mjs',
  'fetch-plane-issue.sh': 'helpers/fetch-plane-issue.sh',
  'fetch-plane-issue': 'helpers/fetch-plane-issue.sh',
  'login.mjs': 'helpers/login.mjs',
  'login': 'helpers/login.mjs',
  'compat.mjs': 'helpers/compat.mjs',
  'compat': 'helpers/compat.mjs',
  'context-builder.mjs': 'helpers/context-builder.mjs',
  'context-builder': 'helpers/context-builder.mjs',
  'context-card.mjs': 'helpers/context-card.mjs',
  'context-card': 'helpers/context-card.mjs',
  'prepare-test-intelligence.mjs': 'helpers/prepare-test-intelligence.mjs',
  'prepare-test-intelligence': 'helpers/prepare-test-intelligence.mjs',
  'record-model-usage.mjs': 'helpers/record-model-usage.mjs',
  'record-model-usage': 'helpers/record-model-usage.mjs',
  'evaluate-business-intelligence.mjs': 'helpers/evaluate-business-intelligence.mjs',
  'evaluate-business-intelligence': 'helpers/evaluate-business-intelligence.mjs',
  'validate-host-smoke.mjs': 'helpers/validate-host-smoke.mjs',
  'validate-host-smoke': 'helpers/validate-host-smoke.mjs',
  'exploratory-runner.mjs': 'helpers/exploratory-runner.mjs',
  'exploratory-runner': 'helpers/exploratory-runner.mjs',
  'native-browser-runtime.mjs': 'helpers/native-browser-runtime.mjs',
  'native-browser-runtime': 'helpers/native-browser-runtime.mjs',
  'native-browser-daemon.mjs': 'helpers/native-browser-daemon.mjs',
  'native-browser-daemon': 'helpers/native-browser-daemon.mjs',
  'drive_common.py': 'helpers/drive_common.py',
  'drive_common': 'helpers/drive_common.py',
  'explore.mjs': 'helpers/explore.mjs',
  'explore': 'helpers/explore.mjs',
  'journey-audit.mjs': 'helpers/journey-audit.mjs',
  'journey-audit': 'helpers/journey-audit.mjs',
  'sweep.mjs': 'helpers/sweep.mjs',
  'sweep': 'helpers/sweep.mjs',
  'visual-audit.mjs': 'helpers/visual-audit.mjs',
  'visual-audit': 'helpers/visual-audit.mjs',
  'visual-regression.mjs': 'helpers/visual-regression.mjs',
  'visual-regression': 'helpers/visual-regression.mjs',
  'ux-health.mjs': 'helpers/ux-health.mjs',
  'ux-health': 'helpers/ux-health.mjs',
  'api-health.mjs': 'helpers/api-health.mjs',
  'api-health': 'helpers/api-health.mjs',
  'runtime-observer.mjs': 'helpers/runtime-observer.mjs',
  'runtime-observer': 'helpers/runtime-observer.mjs',
};

/**
 * Resolve đường dẫn tuyệt đối cho script từ tên script hoặc đường dẫn tương đối
 */
export function resolveScriptPath(scriptName, baseDir = SCRIPTS_DIR) {
  // 1. Nếu là đường dẫn tuyệt đối và tồn tại, trả về ngay
  if (path.isAbsolute(scriptName) && fs.existsSync(scriptName)) {
    return scriptName;
  }

  // 2. Tra cứu trong SCRIPT_REGISTRY
  let relPath = SCRIPT_REGISTRY[scriptName];
  if (!relPath) {
    const noExt = scriptName.replace(/\.(mjs|js|py|sh)$/, '');
    relPath = SCRIPT_REGISTRY[noExt] || SCRIPT_REGISTRY[`${noExt}.mjs`];
  }

  if (relPath) {
    const targetPath = path.resolve(baseDir, relPath);
    if (fs.existsSync(targetPath)) return targetPath;
  }

  // 3. Fallback: tìm trực tiếp ở baseDir (khi file chưa được di chuyển hoặc nằm ở thư mục ngang hàng)
  const directPath = path.resolve(baseDir, scriptName);
  if (fs.existsSync(directPath)) return directPath;
  if (!path.extname(scriptName) && fs.existsSync(`${directPath}.mjs`)) {
    return `${directPath}.mjs`;
  }

  // 4. Mặc định trả về targetPath theo registry nếu có, để log lỗi trỏ đúng vị trí kỳ vọng
  return relPath ? path.resolve(baseDir, relPath) : directPath;
}

/**
 * Hàm thực thi script chuẩn hóa cho các orchestrator
 */
export function runScript(scriptName, args = [], options = {}) {
  const scriptPath = resolveScriptPath(scriptName);
  const ext = path.extname(scriptPath);
  const runner = ext === '.py' ? 'python3' : (ext === '.sh' ? 'bash' : 'node');

  return spawnSync(runner, [scriptPath, ...args], {
    stdio: 'inherit',
    encoding: 'utf8',
    env: { ...process.env },
    ...options,
  });
}
