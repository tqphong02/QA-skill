#!/usr/bin/env node
/**
 * business-flow-builder.mjs — End-to-End Business Flow Reconstructor
 *
 * Ghép các function, controller, service thành flow end-to-end từ source code.
 * Mỗi flow có: flowId, name, actor, trigger, preconditions, steps, alternativeFlows,
 * failureFlows, sideEffects, sourceReferences, confidence.
 *
 * Usage:
 *   node business-flow-builder.mjs --repo /path/to/project
 *   node business-flow-builder.mjs --repo . --output qa-knowledge/repositories/my-repo/business-flows.json
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const args   = process.argv.slice(2);
const getArg = (flag, def) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : def; };

const REPO_PATH   = path.resolve(getArg('--repo', '.'));
const OUTPUT_FILE = getArg('--output', null);
const MAX_FILE_SIZE = 150 * 1024;

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.nuxt', 'coverage', '__mocks__', 'vendor', 'generated']);

function walkDir(dir, onFile, depth = 0) {
  if (depth > 10) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const fullPath = path.join(dir, e.name);
    if (e.isDirectory()) walkDir(fullPath, onFile, depth + 1);
    else if (e.isFile() && /\.(ts|js|tsx|jsx|mjs)$/.test(e.name) && !/\.(spec|test)\./.test(e.name)) {
      const stat = fs.statSync(fullPath);
      if (stat.size < MAX_FILE_SIZE) onFile(fullPath);
    }
  }
}

function getModuleName(relativePath) {
  const parts = relativePath.replace(/\\/g, '/').split('/');
  const srcIdx = parts.indexOf('src');
  if (srcIdx !== -1 && parts[srcIdx + 1]) return parts[srcIdx + 1];
  return parts[parts.length - 2] || 'root';
}

function detectActor(content) {
  if (/admin|Admin/i.test(content)) return 'Admin';
  if (/manager|Manager/i.test(content)) return 'Manager';
  if (/user|User|customer|Customer/i.test(content)) return 'User';
  if (/system|cron|scheduler|queue/i.test(content)) return 'System';
  return 'Actor';
}

function extractFlowSteps(content, filePath) {
  const steps = [];
  const lines = content.split('\n');

  lines.forEach((line, i) => {
    const trim = line.trim();

    // Service method calls that indicate a step
    let m;
    if ((m = trim.match(/(?:await\s+)?this\.(\w+Service|\w+Repository|\w+)\.(\w+)\(/))) {
      steps.push({ order: i + 1, action: `${m[1]}.${m[2]}()`, source: `${filePath}:${i + 1}` });
    }
    // Event publish
    if ((m = trim.match(/\.emit\(|\.publish\(|eventBus\.|this\.eventEmitter\./))) {
      steps.push({ order: i + 1, action: 'Publish event', source: `${filePath}:${i + 1}`, sideEffect: true });
    }
    // Notification
    if (/sendMail|sendSMS|sendNotification|notify/i.test(trim)) {
      steps.push({ order: i + 1, action: 'Send notification', source: `${filePath}:${i + 1}`, sideEffect: true });
    }
  });

  return steps.slice(0, 20); // Cap at 20 steps per flow
}

function extractSideEffects(content) {
  const effects = [];
  if (/\.emit\(|eventBus\.|\.publish\(/i.test(content))     effects.push('publish_event');
  if (/sendMail|sendEmail|nodemailer/i.test(content))        effects.push('send_email');
  if (/sendSMS|twilio|vonage/i.test(content))                effects.push('send_sms');
  if (/\.save\(|\.create\(|\.insert\(|\.update\(/i.test(content)) effects.push('database_write');
  if (/\.delete\(|\.remove\(/i.test(content))               effects.push('database_delete');
  if (/axios\.|fetch\(|HttpService/i.test(content))          effects.push('external_http_call');
  if (/stripe\.|paypal\.|momo\.|vnpay\./i.test(content))     effects.push('payment_processing');
  if (/redis\.|cache\./i.test(content))                      effects.push('cache_update');
  return effects;
}

async function main() {
  if (!fs.existsSync(REPO_PATH)) {
    console.error(`[business-flow-builder] ❌ Repo path không tồn tại: ${REPO_PATH}`);
    process.exit(1);
  }

  console.log(`[business-flow-builder] Reconstructing business flows from: ${REPO_PATH}`);

  const flows = [];
  let fileCount = 0;

  walkDir(REPO_PATH, (filePath) => {
    const relativePath = path.relative(REPO_PATH, filePath);
    const filename = path.basename(filePath);

    // Only analyze controller and service files — they contain flows
    if (!/(controller|service|handler|use-?case)\.(ts|js)$/.test(filename)) return;

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const module = getModuleName(relativePath);
    const actor = detectActor(content);

    // Extract NestJS routes as flow triggers
    lines.forEach((line, i) => {
      let m;
      if ((m = line.match(/@(Get|Post|Put|Patch|Delete)\(['"`]?([^'"`)\s]*)/i))) {
        const method = m[1].toUpperCase();
        const routePath = m[2] || '';

        // Find the handler function name (next @Public or next function def)
        let handlerName = '';
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const fnMatch = lines[j].match(/(?:async\s+)?(\w+)\s*\(/);
          if (fnMatch) { handlerName = fnMatch[1]; break; }
        }

        // Extract only this route handler. The old fixed 80-line window leaked
        // actions from adjacent handlers into every flow.
        const nextRouteOffset = lines.slice(i + 1).findIndex(candidate => (
          /@(Get|Post|Put|Patch|Delete)\(/i.test(candidate)
        ));
        const handlerEnd = nextRouteOffset === -1
          ? Math.min(i + 80, lines.length)
          : i + 1 + nextRouteOffset;
        const handlerContent = lines.slice(i, handlerEnd).join('\n');
        const steps = extractFlowSteps(handlerContent, relativePath);
        const sideEffects = extractSideEffects(handlerContent);

        // Guess preconditions
        const preconditions = [];
        if (/UseGuards|@Roles|isAuthenticated|verifyToken/i.test(handlerContent)) {
          preconditions.push('User phải được xác thực');
        }
        if (/Permission|@Roles\(/.test(handlerContent)) {
          preconditions.push('User phải có quyền thích hợp');
        }

        const flowId = crypto.createHash('md5')
          .update(`${module}:${method}:${routePath}`)
          .digest('hex').slice(0, 8).toUpperCase();

        flows.push({
          flowId: `${module.toUpperCase()}_${method}_${flowId}`,
          name: `${method} ${routePath || '/'} (${handlerName || 'handler'})`,
          module,
          actor,
          trigger: `${method} ${routePath}`,
          preconditions,
          steps: steps.map((s, idx) => ({ ...s, order: idx + 1 })),
          alternativeFlows: [],
          failureFlows: sideEffects.includes('payment_processing') ? ['Thanh toán thất bại → rollback'] : [],
          sideEffects,
          sourceReferences: [{ file: relativePath, line: i + 1 }],
          confidence: steps.length > 0 ? 'verified' : 'inferred',
        });
      }
    });

    fileCount++;
  });

  const output = {
    tool: 'business-flow-builder.mjs',
    repoPath: REPO_PATH,
    builtAt: new Date().toISOString(),
    totalFlows: flows.length,
    flows,
  };

  if (OUTPUT_FILE) {
    fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf8');
    console.log(`[business-flow-builder] ✅ Saved ${flows.length} flows to: ${OUTPUT_FILE}`);
  } else {
    console.log(JSON.stringify({ ...output, flows: `(${flows.length} flows)` }, null, 2));
  }

  console.log(`[business-flow-builder] Scanned ${fileCount} files, reconstructed ${flows.length} business flows`);
}

main().catch(err => {
  console.error('[business-flow-builder] FATAL:', err.message);
  process.exit(1);
});
