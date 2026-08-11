import fs from 'node:fs';
import path from 'node:path';

const NUMERIC_FIELDS = [
  'input_tokens',
  'output_tokens',
  'total_tokens',
  'cache_read_tokens',
  'cache_write_tokens',
  'latency_ms',
  'cost_usd',
  'request_count',
];

function numberOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

/** Normalize host/provider usage without accepting prompt, credential or body fields. */
export function normalizeModelUsage(value, source = 'host_reported') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const usage = {
    schema_version: 1,
    measurement: 'provider_reported',
    source,
    provider: String(value.provider || value.host || 'unknown').trim().slice(0, 80),
    model: String(value.model || 'unknown').trim().slice(0, 160),
    recorded_at: String(value.recorded_at || new Date().toISOString()),
  };
  for (const field of NUMERIC_FIELDS) {
    const number = numberOrNull(value[field]);
    if (number !== null) usage[field] = number;
  }
  if (usage.total_tokens === undefined) {
    const input = usage.input_tokens || 0;
    const output = usage.output_tokens || 0;
    if (input || output) usage.total_tokens = input + output;
  }
  const hasTokenCount = ['input_tokens', 'output_tokens', 'total_tokens']
    .some(field => usage[field] !== undefined);
  if (!hasTokenCount) return null;
  return usage;
}

export function readModelUsage(filePath, baseDir = process.cwd()) {
  if (!filePath) return null;
  const resolved = path.resolve(baseDir, filePath);
  try {
    const parsed = JSON.parse(fs.readFileSync(resolved, 'utf8'));
    return normalizeModelUsage(parsed, 'host_reported_file');
  } catch {
    return null;
  }
}

export function resolveModelUsage(baseDir = process.cwd()) {
  return readModelUsage(process.env.QA_TOKEN_USAGE_FILE || '', baseDir);
}
