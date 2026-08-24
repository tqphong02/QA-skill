#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const ALLURE_CONTRACT_VERSION = 1;
export const REQUIRED_PARAMETERS = Object.freeze([
  'account',
  'url',
  'evidence_image',
  'evidence_video',
]);
export const CANONICAL_ATTACHMENTS = Object.freeze({
  image: Object.freeze({ name: 'evidence-image', contentType: 'image/png' }),
  video: Object.freeze({ name: 'evidence-video', contentType: 'video/webm' }),
});

const MEDIA_MODES = new Set(['ui', 'functional', 'mixed']);
const ALLOWED_MODES = new Set(['ui', 'api', 'functional', 'mixed']);
const ALLOWED_PARAMETER_NAMES = new Set([
  ...REQUIRED_PARAMETERS,
  'testcase_id',
  'run_id',
  'role',
  'browser',
  'app_build',
]);
const SECRET_RE = /(password|passwd|token|secret|authorization|bearer|api[_-]?key|cookie)/i;
const SECRET_VALUE_RE = /(password|passwd|token|secret|authorization|bearer|api[_-]?key|cookie)\s*[:=]|bearer\s+\S+/i;

function getArg(flag, fallback = '') {
  const index = process.argv.indexOf(flag);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function resultFiles(resultsDir) {
  if (!fs.existsSync(resultsDir)) return [];
  return fs.readdirSync(resultsDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && /-result\.json$/i.test(entry.name))
    .map(entry => path.join(resultsDir, entry.name))
    .sort();
}

function readResult(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return {
      __parse_error: error instanceof Error ? error.message : String(error),
    };
  }
}

function violation(code, file, message, details = {}) {
  return { code, file, message, ...details };
}

function parameterMap(result, file, violations, warnings, { requireRequired = true } = {}) {
  const parameters = Array.isArray(result.parameters) ? result.parameters : [];
  const byName = new Map();
  for (const parameter of parameters) {
    const name = typeof parameter?.name === 'string' ? parameter.name.trim() : '';
    const value = parameter?.value == null ? '' : String(parameter.value).trim();
    if (!name) {
      violations.push(violation(
        'ALLURE_PARAMETER_NAME_MISSING',
        file,
        'Every Allure parameter must have a non-empty name',
      ));
      continue;
    }
    if (byName.has(name)) {
      violations.push(violation(
        'ALLURE_PARAMETER_DUPLICATE',
        file,
        `Canonical parameter appears more than once: ${name}`,
        { parameter: name },
      ));
    }
    byName.set(name, value);
    if (!ALLOWED_PARAMETER_NAMES.has(name)) {
      warnings.push({
        code: 'ALLURE_PARAMETER_ADDITIONAL',
        file,
        message: `Additional parameter is retained outside the canonical fields: ${name}`,
        parameter: name,
      });
    }
    if (SECRET_RE.test(name) || SECRET_VALUE_RE.test(value)) {
      violations.push(violation(
        'ALLURE_PARAMETER_SECRET',
        file,
        `Secret-like data is not allowed in Allure parameter ${name}`,
        { parameter: name },
      ));
    }
  }
  if (requireRequired) {
    for (const name of REQUIRED_PARAMETERS) {
      if (!byName.has(name)) {
        violations.push(violation(
          'ALLURE_PARAMETER_REQUIRED_MISSING',
          file,
          `Missing required Allure parameter: ${name}`,
          { parameter: name },
        ));
      } else if (!byName.get(name)) {
        violations.push(violation(
          'ALLURE_PARAMETER_VALUE_MISSING',
          file,
          `Required Allure parameter has an empty value: ${name}`,
          { parameter: name },
        ));
      }
    }
  }
  return byName;
}

function validHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function pathIsWithin(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return !relative || (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function isApiResult(result) {
  const labels = Array.isArray(result.labels) ? result.labels : [];
  const labelMatch = labels.some(label => (
    ['tag', 'suite', 'parentSuite'].includes(label?.name)
    && /(^|[@\s])api($|[@\s])/i.test(String(label?.value || ''))
  ));
  return labelMatch || /(^|\s)@api\b/i.test(`${result.name || ''} ${result.fullName || ''}`);
}

function attachmentMap(result, file, resultsDir, violations) {
  const attachments = Array.isArray(result.attachments) ? result.attachments : [];
  const byName = new Map();
  for (const attachment of attachments) {
    const name = typeof attachment?.name === 'string' ? attachment.name.trim() : '';
    if (!name) continue;
    const list = byName.get(name) || [];
    list.push(attachment);
    byName.set(name, list);
  }
  for (const [kind, expected] of Object.entries(CANONICAL_ATTACHMENTS)) {
    const matches = byName.get(expected.name) || [];
    if (matches.length > 1) {
      violations.push(violation(
        'ALLURE_ATTACHMENT_DUPLICATE',
        file,
        `Canonical ${kind} attachment appears more than once`,
        { attachment: expected.name },
      ));
    }
    for (const attachment of matches) {
      const actualType = String(attachment.type || '').toLowerCase();
      if (kind === 'image' && !actualType.startsWith('image/')) {
        violations.push(violation(
          'ALLURE_ATTACHMENT_TYPE_INVALID',
          file,
          'evidence-image must be an image attachment',
          { attachment: expected.name, content_type: attachment.type || null },
        ));
      }
      if (kind === 'video' && !actualType.startsWith('video/')) {
        violations.push(violation(
          'ALLURE_ATTACHMENT_TYPE_INVALID',
          file,
          'evidence-video must be a video attachment',
          { attachment: expected.name, content_type: attachment.type || null },
        ));
      }
      if (!attachment.source) {
        violations.push(violation(
          'ALLURE_ATTACHMENT_SOURCE_MISSING',
          file,
          `Canonical attachment has no source: ${expected.name}`,
          { attachment: expected.name },
        ));
      } else {
        const source = String(attachment.source);
        const sourcePath = path.resolve(resultsDir, source);
        if (path.isAbsolute(source) || !pathIsWithin(resultsDir, sourcePath)) {
          violations.push(violation(
            'ALLURE_ATTACHMENT_SOURCE_OUTSIDE_RESULTS',
            file,
            `Canonical attachment must resolve inside the Allure results directory: ${expected.name}`,
            { attachment: expected.name, source },
          ));
        } else if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
          violations.push(violation(
            'ALLURE_ATTACHMENT_FILE_MISSING',
            file,
            `Canonical attachment source does not exist: ${expected.name}`,
            { attachment: expected.name, source },
          ));
        }
      }
    }
  }
  return byName;
}

export function verifyAllureContract(options = {}) {
  const resultsDir = options.resultsDir;
  const mode = String(options.mode || 'ui').toLowerCase();
  const requireMedia = MEDIA_MODES.has(mode);
  const resolvedResultsDir = path.resolve(resultsDir || 'reports/allure-results');
  const files = resultFiles(resolvedResultsDir);
  const violations = [];
  const warnings = [];
  const results = [];

  if (!ALLOWED_MODES.has(mode)) {
    violations.push(violation(
      'ALLURE_MODE_UNKNOWN',
      resolvedResultsDir,
      `Unknown Allure mode: ${mode}. Expected ui, api, functional or mixed`,
      { mode },
    ));
  }
  if (Object.hasOwn(options, 'requireMedia')) {
    violations.push(violation(
      'ALLURE_MEDIA_OVERRIDE_FORBIDDEN',
      resolvedResultsDir,
      'Canonical media requirements are derived from mode and cannot be overridden',
    ));
  }

  if (!fs.existsSync(resolvedResultsDir)) {
    violations.push(violation(
      'ALLURE_RESULTS_DIR_MISSING',
      resolvedResultsDir,
      'Allure results directory does not exist',
    ));
  } else if (files.length === 0) {
    violations.push(violation(
      'ALLURE_RESULTS_EMPTY',
      resolvedResultsDir,
      'Allure results directory has no *-result.json files',
    ));
  }

  for (const filePath of files) {
    const file = path.basename(filePath);
    const result = readResult(filePath);
    if (result.__parse_error) {
      violations.push(violation('ALLURE_RESULT_INVALID_JSON', file, result.__parse_error));
      continue;
    }
    const status = String(result.status || 'unknown');
    const skipped = status === 'skipped';
    const parameters = parameterMap(result, file, violations, warnings, { requireRequired: !skipped });
    const attachments = attachmentMap(result, file, resolvedResultsDir, violations);
    const mediaRequired = !skipped && requireMedia && !(mode === 'mixed' && isApiResult(result));
    if (mediaRequired) {
      for (const [kind, expected] of Object.entries(CANONICAL_ATTACHMENTS)) {
        if ((attachments.get(expected.name) || []).length === 0) {
          violations.push(violation(
            'ALLURE_ATTACHMENT_REQUIRED_MISSING',
            file,
            `Missing canonical ${kind} evidence attachment`,
            { attachment: expected.name, status },
          ));
        }
      }
    }
    const urlValue = parameters.get('url');
    if (!skipped && !validHttpUrl(urlValue)) {
      violations.push(violation(
        'ALLURE_URL_INVALID',
        file,
        'The canonical url parameter must be an absolute http(s) URL',
        { value: urlValue },
      ));
    }
    for (const [kind, parameterName] of [['image', 'evidence_image'], ['video', 'evidence_video']]) {
      if (!parameters.has(parameterName)) continue;
      const expected = CANONICAL_ATTACHMENTS[kind];
      const value = parameters.get(parameterName);
      const attachmentCount = (attachments.get(expected.name) || []).length;
      const allowedValues = mediaRequired ? [expected.name] : [expected.name, 'N/A'];
      if (!allowedValues.includes(value)) {
        violations.push(violation(
          'ALLURE_EVIDENCE_PARAMETER_INVALID',
          file,
          `${parameterName} must be ${allowedValues.join(' or ')}`,
          { parameter: parameterName, value },
        ));
      }
      if (value === expected.name && attachmentCount === 0) {
        violations.push(violation(
          kind === 'image' ? 'ALLURE_IMAGE_PARAMETER_UNRESOLVED' : 'ALLURE_VIDEO_PARAMETER_UNRESOLVED',
          file,
          `${parameterName} does not resolve to the canonical attachment`,
        ));
      }
    }
    results.push({
      file,
      uuid: result.uuid || null,
      status,
      media_required: mediaRequired,
      parameters: Object.fromEntries(parameters),
      attachments: [...attachments.keys()],
    });
  }

  return {
    schema_version: ALLURE_CONTRACT_VERSION,
    contract: 'allure-canonical-v1',
    status: violations.length > 0 ? 'BLOCKED' : 'PASS',
    mode,
    require_media: Boolean(requireMedia),
    results_dir: resolvedResultsDir,
    result_count: results.length,
    required_parameters: [...REQUIRED_PARAMETERS],
    canonical_attachments: CANONICAL_ATTACHMENTS,
    warnings,
    violations,
    results,
  };
}

function main() {
  const mode = getArg('--mode', 'ui').toLowerCase();
  const result = verifyAllureContract({
    resultsDir: getArg('--results-dir', 'reports/allure-results'),
    mode,
    ...(process.argv.includes('--no-media') ? { requireMedia: false } : {}),
  });
  const outputArg = getArg('--output');
  if (outputArg) {
    const outputPath = path.resolve(outputArg);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  }
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'PASS') process.exitCode = 2;
}

const isDirectRun = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isDirectRun) main();
