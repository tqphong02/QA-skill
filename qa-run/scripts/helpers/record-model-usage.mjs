#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { normalizeModelUsage } from '../../lib/model-telemetry.mjs';

const args = process.argv.slice(2);
const getArg = (flag, fallback = '') => {
  const index = args.indexOf(flag);
  return index === -1 ? fallback : args[index + 1] || fallback;
};

const file = getArg('--file', process.env.QA_TOKEN_USAGE_FILE);
if (!file) {
  console.error('[model-telemetry] BLOCKED: --file or QA_TOKEN_USAGE_FILE is required');
  process.exit(2);
}

const usage = normalizeModelUsage({
  provider: getArg('--provider', process.env.QA_MODEL_PROVIDER || 'unknown'),
  model: getArg('--model', process.env.QA_MODEL_NAME || 'unknown'),
  input_tokens: getArg('--input-tokens', ''),
  output_tokens: getArg('--output-tokens', ''),
  total_tokens: getArg('--total-tokens', ''),
  cache_read_tokens: getArg('--cache-read-tokens', ''),
  cache_write_tokens: getArg('--cache-write-tokens', ''),
  latency_ms: getArg('--latency-ms', ''),
  cost_usd: getArg('--cost-usd', ''),
  request_count: getArg('--request-count', '1'),
});
if (!usage) {
  console.error('[model-telemetry] BLOCKED: at least one valid token count is required');
  process.exit(2);
}

const output = path.resolve(file);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(usage, null, 2), 'utf8');
console.log(`[model-telemetry] Saved provider-reported usage: ${output}`);
