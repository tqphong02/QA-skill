/**
 * User-facing QA result values
 *
 * Internal safety, probe and coverage records may still use technical
 * classifications such as BLOCKED or PARTIAL. A completed exploratory QA
 * run, charter or business-guide result must expose only these values.
 */
export const QA_RESULT_VERDICTS = Object.freeze([
  'PASS',
  'FAILED',
  'N/A',
  'UNTEST',
]);

export const QA_RESULT_VERDICT_SET = new Set(QA_RESULT_VERDICTS);

const LEGACY_RESULT_VERDICT_MAP = Object.freeze({
  BLOCKED: 'UNTEST',
  PARTIAL: 'UNTEST',
});

export function normalizeQaResultVerdict(value) {
  const raw = String(value ?? '').trim().toUpperCase();
  return LEGACY_RESULT_VERDICT_MAP[raw] || raw;
}

export function isQaResultVerdict(value) {
  return QA_RESULT_VERDICT_SET.has(normalizeQaResultVerdict(value));
}
