#!/usr/bin/env node

/**
 * Verify the chain:
 * testcase Markdown -> Playwright test IDs -> runtime selector evidence -> selector source
 *
 * This is an audit gate, not a locator generator. It can prove that the generated
 * code is traceable to the testcase and that a recorded runtime-verified locator
 * is present in selector code. Only a live Playwright run can prove the locator
 * still works against the current application build.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const EXCLUDED_DIRS = new Set([
  '.git',
  'node_modules',
  'reports',
  'test-results',
  'playwright-report',
  'allure-results',
  'allure-report',
  'sessions',
  'testdata',
]);
const ACTIONABLE_ACTIONS = new Set([
  'click',
  'fill',
  'select',
  'select_option',
  'check',
  'uncheck',
  'press',
  'hover',
  'drag',
  'upload',
]);
const SELECTOR_PRIORITY = ['testid', 'id', 'css', 'role', 'label', 'placeholder', 'text', 'xpath'];

function normalizeStrategy(value) {
  const normalized = String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (normalized.includes('testid') || normalized.includes('datatest')) return 'testid';
  if (normalized === 'id' || normalized.includes('stableid')) return 'id';
  if (normalized.includes('css')) return 'css';
  if (normalized.includes('role')) return 'role';
  if (normalized.includes('label')) return 'label';
  if (normalized.includes('placeholder')) return 'placeholder';
  if (normalized.includes('text')) return 'text';
  if (normalized.includes('xpath')) return 'xpath';
  return normalized;
}

function selectorPriorityIndex(value) {
  return SELECTOR_PRIORITY.indexOf(normalizeStrategy(value));
}

function getArg(flag, fallback = '') {
  const index = process.argv.indexOf(flag);
  return index === -1 ? fallback : process.argv[index + 1] || fallback;
}

function displayPath(filePath, baseDir) {
  return path.relative(baseDir, filePath).replaceAll(path.sep, '/') || '.';
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function isTestcaseId(value) {
  if (!value || /^S\d+$/i.test(value) || /^(?:OUTCOME|CLEANUP)$/i.test(value)) return false;
  return /^TC_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)+$/i.test(value)
    || /^[A-Za-z][A-Za-z0-9]*-\d+$/i.test(value)
    || /^[A-Za-z][A-Za-z0-9]*_\d+$/i.test(value);
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function parseTestcases(markdown) {
  const cases = [];
  const byId = new Map();
  let current = null;
  const duplicateIds = [];

  for (const line of markdown.split(/\r?\n/)) {
    const heading = line.match(/^#{5}\s+.*?\[([A-Za-z][A-Za-z0-9_-]*)\]/);
    const tableId = line.match(/^\|\s*`?([^|`]+?)`?\s*\|/);
    const candidateId = heading?.[1]
      || (tableId && /^TC_/i.test(tableId[1].trim()) ? tableId[1].trim() : null);

    if (candidateId && isTestcaseId(candidateId)) {
      if (byId.has(candidateId)) {
        duplicateIds.push(candidateId);
      } else {
        current = {
          id: candidateId,
          target_keys: [],
          actions_by_target: {},
          structured: false,
        };
        byId.set(candidateId, current);
        cases.push(current);
      }
    }

    if (!current) continue;

    const stepRow = line.match(/^\|\s*(S\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/);
    if (stepRow) {
      const stepId = stepRow[1].trim();
      const action = stepRow[2].trim();
      const targetKey = stepRow[3].trim();
      if (targetKey && !/^target key$/i.test(targetKey)) {
        current.structured = true;
        if (!current.target_keys.includes(targetKey)) current.target_keys.push(targetKey);
        current.actions_by_target[targetKey] = current.actions_by_target[targetKey] || [];
        current.actions_by_target[targetKey].push({ step_id: stepId, action });
      }
    }
  }

  return { cases, duplicateIds };
}

function walkFiles(rootDir, predicate = () => true) {
  if (!fs.existsSync(rootDir)) return [];
  const output = [];
  const queue = [rootDir];
  while (queue.length) {
    const current = queue.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory() && EXCLUDED_DIRS.has(entry.name)) continue;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) queue.push(fullPath);
      else if (predicate(fullPath)) output.push(fullPath);
    }
  }
  return output.sort();
}

function codeFiles(rootDir) {
  return walkFiles(rootDir, filePath => CODE_EXTENSIONS.has(path.extname(filePath).toLowerCase()));
}

function specFiles(rootDir) {
  return codeFiles(rootDir).filter(filePath => (
    /(?:\.(?:spec|test)\.)[cm]?[jt]sx?$/.test(filePath)
    || /(^|[/\\])tests?[/\\]/.test(filePath)
  ));
}

function selectorFiles(rootDir) {
  return codeFiles(rootDir).filter(filePath => /(^|[/\\])selectors?[/\\]/.test(filePath));
}

function pageFiles(rootDir) {
  return codeFiles(rootDir).filter(filePath => /(^|[/\\])pages?[/\\]/.test(filePath));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compactCode(value) {
  return String(value || '').replace(/\s+/g, '');
}

function locatorAppearsInSource(locator, source) {
  const compactLocator = compactCode(locator);
  if (!compactLocator) return false;
  const compactSource = compactCode(source);
  const variants = new Set([
    compactLocator,
    compactLocator.replace(/^this\.page\./, ''),
    compactLocator.replace(/^page\./, ''),
    `page.${compactLocator}`,
    `this.page.${compactLocator}`,
  ]);
  return [...variants].some(candidate => compactSource.includes(candidate));
}

function parseSelectorEvidence(evidenceDir) {
  const files = walkFiles(evidenceDir, filePath => path.extname(filePath).toLowerCase() === '.json');
  const records = [];
  const parseErrors = [];

  for (const filePath of files) {
    try {
      const parsed = JSON.parse(readText(filePath));
      const targets = Array.isArray(parsed.targets)
        ? parsed.targets
        : parsed.target_key
          ? [parsed]
          : [];
      for (const target of targets) {
        if (target?.target_key) {
          records.push({
            ...target,
            route: target.route ?? parsed.route,
            role: target.role ?? parsed.role,
            locale: target.locale ?? parsed.locale,
            state: target.state ?? parsed.state,
            evidence_file: filePath,
          });
        }
      }
    } catch (error) {
      parseErrors.push({
        file: filePath,
        message: `Invalid selector evidence JSON: ${error.message}`,
      });
    }
  }

  return { files, records, parseErrors };
}

function readTokenUsage(filePath) {
  const fields = [
    'input_tokens',
    'output_tokens',
    'total_tokens',
    'cache_read_tokens',
    'cache_write_tokens',
    'latency_ms',
    'cost_usd',
    'request_count',
  ];
  const result = {
    measurement: 'not_available',
    source_file: filePath || null,
    note: 'Exact model usage is available only when the host/provider writes a usage file',
  };
  if (!filePath || !fs.existsSync(filePath)) return result;

  try {
    const parsed = JSON.parse(readText(filePath));
    for (const field of fields) {
      const value = Number(parsed[field]);
      if (Number.isFinite(value) && value >= 0) result[field] = value;
    }
    if (result.total_tokens === undefined
      && (result.input_tokens !== undefined || result.output_tokens !== undefined)) {
      result.total_tokens = (result.input_tokens || 0) + (result.output_tokens || 0);
    }
    if (result.total_tokens === undefined) return result;
    return {
      measurement: 'provider_reported',
      source_file: filePath,
      provider: String(parsed.provider || parsed.host || 'unknown'),
      model: String(parsed.model || 'unknown'),
      recorded_at: parsed.recorded_at || null,
      ...Object.fromEntries(fields.filter(field => result[field] !== undefined).map(field => [field, result[field]])),
    };
  } catch (error) {
    return {
      ...result,
      note: `Usage file could not be read: ${error.message}`,
    };
  }
}

function addViolation(violations, code, message, details = {}) {
  violations.push({ code, message, ...details });
}

function testDeclarationEvidence(content, testcaseId) {
  const id = escapeRegExp(testcaseId);
  return new RegExp(`\\btest\\s*\\([\\s\\S]{0,600}?${id}`).test(content)
    || new RegExp(`\\ballure\\.tms\\s*\\([\\s\\S]{0,200}?${id}`).test(content)
    || new RegExp(`\\b(?:tcId|testCaseId)\\s*:\\s*['\"\`]${id}['\"\`]`).test(content);
}

function relativeList(files, baseDir) {
  return files.map(filePath => displayPath(filePath, baseDir));
}

function buildTraceability({
  testcasePath,
  automationRoot,
  evidenceDir,
  tokenUsagePath,
  mode = 'ui',
}) {
  const markdown = readText(testcasePath);
  const parsedCases = parseTestcases(markdown);
  const cases = parsedCases.cases;
  const specs = specFiles(automationRoot);
  const selectors = selectorFiles(automationRoot);
  const pages = pageFiles(automationRoot);
  const selectorEvidence = parseSelectorEvidence(evidenceDir);
  const sourceHash = sha256(testcasePath);
  const violations = [...selectorEvidence.parseErrors.map(error => ({
    code: 'SELECTOR_EVIDENCE_INVALID_JSON',
    message: error.message,
    file: displayPath(error.file, automationRoot),
  }))];

  for (const duplicateId of parsedCases.duplicateIds) {
    addViolation(violations, 'DUPLICATE_TESTCASE_ID', `Testcase ID xuất hiện nhiều lần: ${duplicateId}`, {
      testcase_id: duplicateId,
    });
  }
  if (cases.length === 0) {
    addViolation(violations, 'NO_TESTCASES_FOUND', 'Không tìm thấy Testcase ID trong Markdown source');
  }

  const selectorCoverage = new Map();
  const selectorRecordsByKey = new Map();
  for (const record of selectorEvidence.records) {
    const list = selectorRecordsByKey.get(record.target_key) || [];
    list.push(record);
    selectorRecordsByKey.set(record.target_key, list);
  }

  const testcaseResults = cases.map(testcase => {
    const matchedSpecFiles = specs.filter(filePath => readText(filePath).includes(testcase.id));
    const declarationFiles = matchedSpecFiles.filter(filePath => testDeclarationEvidence(readText(filePath), testcase.id));
    if (matchedSpecFiles.length === 0) {
      addViolation(violations, 'TESTCASE_NOT_IN_SPEC', `Không tìm thấy ${testcase.id} trong spec automation`, {
        testcase_id: testcase.id,
      });
    } else if (declarationFiles.length === 0) {
      addViolation(violations, 'TESTCASE_ID_NOT_DECLARED', `${testcase.id} có trong code nhưng chưa thấy test declaration/TMS mapping`, {
        testcase_id: testcase.id,
        spec_files: relativeList(matchedSpecFiles, automationRoot),
      });
    }

    if (mode === 'ui') {
      if (!testcase.structured || testcase.target_keys.length === 0) {
        addViolation(violations, 'LEGACY_TEXT_ONLY', `${testcase.id} chưa có execution contract/target key`, {
          testcase_id: testcase.id,
        });
      }

      for (const targetKey of testcase.target_keys) {
        if (selectorCoverage.has(targetKey)) continue;
        const records = selectorRecordsByKey.get(targetKey) || [];
        const record = records[0] || null;
        const action = testcase.actions_by_target[targetKey]?.[0]?.action || null;
        const requiresActionable = ACTIONABLE_ACTIONS.has(action);
        const targetResult = {
          target_key: targetKey,
          action,
          status: record?.status || 'missing',
          evidence_file: record ? displayPath(record.evidence_file, automationRoot) : null,
          strategy: record?.strategy || null,
          locator: record?.locator || null,
          candidates: Array.isArray(record?.candidates) ? record.candidates : null,
          verification: record?.verification || null,
          selector_files: [],
        };

        if (!record) {
          addViolation(violations, 'SELECTOR_EVIDENCE_MISSING', `Chưa có selector evidence cho target key ${targetKey}`, {
            testcase_id: testcase.id,
            target_key: targetKey,
          });
        } else {
          if (records.length > 1) {
            addViolation(violations, 'SELECTOR_EVIDENCE_DUPLICATE', `Có nhiều selector evidence cho target key ${targetKey}; cần route/state mapping rõ ràng`, {
              testcase_id: testcase.id,
              target_key: targetKey,
              evidence_files: records.map(item => displayPath(item.evidence_file, automationRoot)),
            });
          }
          if (record.status !== 'runtime_verified') {
            addViolation(violations, 'SELECTOR_NOT_RUNTIME_VERIFIED', `Selector ${targetKey} có status=${record.status}, chưa runtime_verified`, {
              testcase_id: testcase.id,
              target_key: targetKey,
              evidence_file: displayPath(record.evidence_file, automationRoot),
            });
          }
          const verification = record.verification || {};
          if (Number(verification.count) !== 1) {
            addViolation(violations, 'SELECTOR_COUNT_NOT_ONE', `Selector ${targetKey} chưa chứng minh count=1`, {
              testcase_id: testcase.id,
              target_key: targetKey,
            });
          }
          if (verification.visible !== true) {
            addViolation(violations, 'SELECTOR_NOT_VISIBLE', `Selector ${targetKey} chưa chứng minh visible=true`, {
              testcase_id: testcase.id,
              target_key: targetKey,
            });
          }
          if (requiresActionable && verification.actionable !== true) {
            addViolation(violations, 'SELECTOR_NOT_ACTIONABLE', `Selector ${targetKey} cần actionable=true cho action=${action}`, {
              testcase_id: testcase.id,
              target_key: targetKey,
            });
          }
          const locatorText = `${record.strategy || ''} ${record.locator || ''}`;
          const usesXPath = /xpath|\/html\/|locator\s*\(\s*['"`]\/\//i.test(locatorText);
          if (usesXPath && !record.reason) {
            addViolation(violations, 'XPATH_REASON_MISSING', `XPath của ${targetKey} thiếu reason vì sao semantic locator không dùng được`, {
              testcase_id: testcase.id,
              target_key: targetKey,
            });
          }
          if (!record.locator) {
            addViolation(violations, 'SELECTOR_LOCATOR_MISSING', `Evidence của ${targetKey} chưa ghi locator expression`, {
              testcase_id: testcase.id,
              target_key: targetKey,
            });
          }
          if (!record.route) {
            addViolation(violations, 'SELECTOR_ROUTE_MISSING', `Evidence của ${targetKey} chưa ghi route đã verify`, {
              testcase_id: testcase.id,
              target_key: targetKey,
            });
          }
          if (record.status === 'runtime_verified') {
            const candidates = Array.isArray(record.candidates) ? record.candidates : [];
            if (candidates.length === 0) {
              addViolation(violations, 'SELECTOR_PRIORITY_EVIDENCE_MISSING', `Evidence của ${targetKey} chưa ghi ordered candidates theo testid → id → CSS → semantic → XPath`, {
                testcase_id: testcase.id,
                target_key: targetKey,
              });
            } else {
              if (normalizeStrategy(candidates[0]?.strategy) !== 'testid') {
                addViolation(violations, 'SELECTOR_TESTID_CANDIDATE_MISSING', `Ordered candidates của ${targetKey} phải bắt đầu bằng testid, kể cả khi available=false`, {
                  testcase_id: testcase.id,
                  target_key: targetKey,
                });
              }
              const available = candidates.filter(candidate => candidate?.available === true);
              const firstAvailable = available[0];
              const selectedStrategy = normalizeStrategy(record.strategy);
              const firstAvailableStrategy = normalizeStrategy(firstAvailable?.strategy);
              const candidateIndexes = candidates
                .map(candidate => selectorPriorityIndex(candidate?.strategy))
                .filter(index => index >= 0);
              if (candidateIndexes.some((index, indexPosition) => indexPosition > 0 && index < candidateIndexes[indexPosition - 1])) {
                addViolation(violations, 'SELECTOR_PRIORITY_ORDER_INVALID', `Ordered candidates của ${targetKey} không theo testid → id → CSS → semantic → XPath`, {
                  testcase_id: testcase.id,
                  target_key: targetKey,
                });
              }
              if (!firstAvailable) {
                addViolation(violations, 'SELECTOR_PRIORITY_NO_AVAILABLE_CANDIDATE', `Evidence của ${targetKey} không có candidate nào available=true`, {
                  testcase_id: testcase.id,
                  target_key: targetKey,
                });
              } else if (selectedStrategy !== firstAvailableStrategy) {
                addViolation(violations, 'SELECTOR_PRIORITY_MISMATCH', `Selector ${targetKey} chọn ${record.strategy} nhưng candidate ưu tiên đầu tiên là ${firstAvailable.strategy}`, {
                  testcase_id: testcase.id,
                  target_key: targetKey,
                  selected_strategy: record.strategy,
                  expected_strategy: firstAvailable.strategy,
                });
              }
            }
          }
        }

        if (record?.locator) {
          targetResult.selector_files = selectors
            .filter(filePath => locatorAppearsInSource(record.locator, readText(filePath)))
            .map(filePath => displayPath(filePath, automationRoot));
          if (targetResult.selector_files.length === 0) {
            addViolation(violations, 'SELECTOR_NOT_IN_CODE', `Locator evidence của ${targetKey} không xuất hiện trong selectors/`, {
              testcase_id: testcase.id,
              target_key: targetKey,
            });
          }
        }
        selectorCoverage.set(targetKey, targetResult);
      }
    }

    return {
      testcase_id: testcase.id,
      structured_execution_contract: testcase.structured,
      target_keys: testcase.target_keys,
      matched_spec_files: relativeList(matchedSpecFiles, automationRoot),
      declaration_files: relativeList(declarationFiles, automationRoot),
    };
  });

  for (const filePath of selectors) {
    const content = readText(filePath);
    const relativeFile = displayPath(filePath, automationRoot);
    if (/\/html\/body/i.test(content)) {
      addViolation(violations, 'ABSOLUTE_XPATH', `Selector file chứa absolute XPath: ${relativeFile}`, { file: relativeFile });
    }
    if (/:nth-child\(|\.first\(\)|\.last\(\)/i.test(content)) {
      addViolation(violations, 'POSITIONAL_SELECTOR', `Selector file chứa positional selector: ${relativeFile}`, { file: relativeFile });
    }
  }

  for (const filePath of specs) {
    const content = readText(filePath);
    if (/(?:page|this\.page)\.locator\s*\(/.test(content)) {
      addViolation(violations, 'RAW_LOCATOR_IN_SPEC', `Spec chứa raw locator; chuyển selector vào Page Object: ${displayPath(filePath, automationRoot)}`, {
        file: displayPath(filePath, automationRoot),
      });
    }
  }

  const allTargetKeys = [...new Set(cases.flatMap(testcase => testcase.target_keys))];
  const verifiedTargetKeys = [...selectorCoverage.values()].filter(item => item.status === 'runtime_verified');
  const sourceBytes = Buffer.byteLength(markdown, 'utf8');
  const tokenUsage = readTokenUsage(tokenUsagePath);
  const report = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    status: violations.length === 0 ? 'PASS' : 'BLOCKED',
    mode,
    source: {
      path: displayPath(testcasePath, automationRoot),
      sha256: sourceHash,
      format: path.extname(testcasePath).toLowerCase().replace('.', '') || 'unknown',
      testcase_count: cases.length,
      testcase_ids: cases.map(testcase => testcase.id),
      structured_execution_contract_count: cases.filter(testcase => testcase.structured).length,
      legacy_case_ids: cases.filter(testcase => !testcase.structured).map(testcase => testcase.id),
      source_context_estimate: {
        utf8_bytes: sourceBytes,
        estimated_tokens: Math.ceil(sourceBytes / 4),
        estimator: 'utf8_bytes_div_4_estimate',
        scope: 'testcase_file_only; not the full AI prompt',
      },
    },
    automation: {
      root: '.',
      selector_priority: SELECTOR_PRIORITY,
      spec_files: relativeList(specs, automationRoot),
      selector_files: relativeList(selectors, automationRoot),
      page_files: relativeList(pages, automationRoot),
    },
    cases: testcaseResults,
    selector_coverage: [...selectorCoverage.values()],
    token_usage: tokenUsage,
    summary: {
      testcase_count: cases.length,
      testcase_mapped_count: testcaseResults.filter(testcase => testcase.declaration_files.length > 0).length,
      target_key_count: allTargetKeys.length,
      target_key_runtime_verified_count: verifiedTargetKeys.length,
      selector_evidence_file_count: selectorEvidence.files.length,
      violation_count: violations.length,
    },
    violations,
  };

  return report;
}

function printUsage() {
  console.log(`Usage: node scripts/verify-testcase-traceability.mjs [options]

Options:
  --testcases <file>             Generated testcase Markdown companion
  --automation-root <dir>        POM project root (default: .)
  --selector-evidence-dir <dir> Selector evidence directory (default: selector-evidence)
  --token-usage <file>           Provider-reported usage JSON (or QA_TOKEN_USAGE_FILE)
  --mode <ui|api>                UI checks selector evidence; API checks ID mapping only
  --output <file>                Audit JSON (default: reports/testcase-automation-traceability.json)
`);
}

function discoverTestcaseFile(automationRoot) {
  const explicit = getArg('--testcases', process.env.TESTCASE_FILE || '');
  if (explicit) return path.resolve(automationRoot, explicit);
  const candidates = walkFiles(path.join(automationRoot, 'testcases'), filePath => (
    path.extname(filePath).toLowerCase() === '.md'
    && !path.basename(filePath).startsWith('TEMPLATE')
  ));
  if (candidates.length === 1) return candidates[0];
  if (candidates.length === 0) {
    throw new Error('BLOCKED: --testcases is required or exactly one generated Markdown file must exist under testcases/');
  }
  throw new Error(`BLOCKED: multiple testcase Markdown files found; pass --testcases explicitly: ${candidates.map(file => displayPath(file, automationRoot)).join(', ')}`);
}

export {
  buildTraceability,
  parseSelectorEvidence,
  parseTestcases,
  readTokenUsage,
};

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printUsage();
    return;
  }

  const automationRoot = path.resolve(getArg('--automation-root', '.'));
  const mode = getArg('--mode', 'ui').toLowerCase();
  if (!['ui', 'api'].includes(mode)) throw new Error(`BLOCKED: unsupported --mode ${mode}; use ui or api`);
  const testcasePath = discoverTestcaseFile(automationRoot);
  if (!fs.existsSync(testcasePath)) throw new Error(`BLOCKED: testcase file not found: ${testcasePath}`);
  if (path.extname(testcasePath).toLowerCase() !== '.md') {
    throw new Error('BLOCKED: use the generated testcase Markdown companion as the automation source; do not audit a raw Excel file');
  }
  const evidenceDir = path.resolve(automationRoot, getArg('--selector-evidence-dir', 'selector-evidence'));
  const tokenUsageArg = getArg('--token-usage', process.env.QA_TOKEN_USAGE_FILE || '');
  const tokenUsagePath = tokenUsageArg ? path.resolve(automationRoot, tokenUsageArg) : '';
  const outputPath = path.resolve(automationRoot, getArg('--output', 'reports/testcase-automation-traceability.json'));

  const report = buildTraceability({
    testcasePath,
    automationRoot,
    evidenceDir,
    tokenUsagePath,
    mode,
  });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    status: report.status,
    output: outputPath,
    source: report.source.path,
    source_sha256: report.source.sha256,
    testcases: `${report.summary.testcase_mapped_count}/${report.summary.testcase_count}`,
    selectors: `${report.summary.target_key_runtime_verified_count}/${report.summary.target_key_count}`,
    token_measurement: report.token_usage.measurement,
    total_tokens: report.token_usage.total_tokens ?? null,
    violations: report.summary.violation_count,
  }, null, 2));
  if (report.status !== 'PASS') process.exitCode = 1;
}

const invokedAsScript = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedAsScript) {
  main().catch(error => {
    console.error(`[traceability] ${error.message}`);
    process.exitCode = 2;
  });
}
