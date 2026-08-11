#!/usr/bin/env node
/**
 * state-machine-extractor.mjs — State Transition Detector
 *
 * Phát hiện Enum status, transition functions, conditional updates:
 *   - Enum STATUS values (DRAFT, PENDING, APPROVED, REJECTED, COMPLETED...)
 *   - Transition logic (update status from X to Y)
 *   - Invalid transition guards (throw when wrong status)
 *   - Event-driven transitions (on event → change status)
 *
 * Usage:
 *   node state-machine-extractor.mjs --repo /path/to/project
 *   node state-machine-extractor.mjs --repo . --output qa-knowledge/repositories/my-repo/state-machines.json
 */

import fs from 'node:fs';
import path from 'node:path';

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

const STATUS_KEYWORDS = /DRAFT|PENDING|PENDING_REVIEW|APPROVED|REJECTED|COMPLETED|CANCELLED|PROCESSING|ACTIVE|INACTIVE|ARCHIVED|DELETED|PUBLISHED|LOCKED|EXPIRED|SUSPENDED|VERIFIED|UNVERIFIED/i;

async function main() {
  if (!fs.existsSync(REPO_PATH)) {
    console.error(`[state-machine-extractor] ❌ Repo path không tồn tại: ${REPO_PATH}`);
    process.exit(1);
  }

  console.log(`[state-machine-extractor] Detecting state machines from: ${REPO_PATH}`);

  const stateMachines = {};
  let fileCount = 0;

  walkDir(REPO_PATH, (filePath) => {
    const relativePath = path.relative(REPO_PATH, filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    lines.forEach((line, i) => {
      const trim = line.trim();
      let m;

      // Enum with status values
      if ((m = trim.match(/^(?:export\s+)?enum\s+(\w*[Ss]tatus\w*|\w*[Ss]tate\w*|\w*[Tt]ype\w*)/))) {
        const enumName = m[1];
        const values = [];
        for (let j = i + 1; j < Math.min(i + 30, lines.length); j++) {
          if (lines[j].trim() === '}') break;
          const valMatch = lines[j].trim().match(/^(\w+)/);
          if (valMatch) values.push(valMatch[1]);
        }
        if (values.length > 0 && STATUS_KEYWORDS.test(values.join(' '))) {
          const entity = enumName.replace(/Status|State|Type|Enum/gi, '') || enumName;
          if (!stateMachines[entity]) {
            stateMachines[entity] = { entity, states: [], transitions: [], sources: [] };
          }
          values.forEach(v => {
            if (!stateMachines[entity].states.includes(v)) {
              stateMachines[entity].states.push(v);
            }
          });
          stateMachines[entity].sources.push(`${relativePath}:${i + 1}`);
        }
      }

      // Transition: status assignment e.g. record.status = OrderStatus.APPROVED
      if ((m = line.match(/\.status\s*=\s*(?:\w+\.)?(\w+)/))) {
        const toState = m[1];
        if (STATUS_KEYWORDS.test(toState)) {
          // Try to find from-state in nearby lines
          const context = lines.slice(Math.max(0, i - 5), i).join(' ');
          const fromMatch = context.match(/status\s*(?:!==?|===?)\s*(?:\w+\.)?(\w+)/);
          const fromState = fromMatch ? fromMatch[1] : 'ANY';

          const entity = line.match(/(\w+)\.status/)?.[1] || 'unknown';
          const entityKey = entity.replace(/s$/i, '');
          if (!stateMachines[entityKey]) {
            stateMachines[entityKey] = { entity: entityKey, states: [], transitions: [], sources: [] };
          }
          stateMachines[entityKey].transitions.push({
            from: fromState,
            to: toState,
            source: `${relativePath}:${i + 1}`,
          });
        }
      }
    });

    fileCount++;
  });

  const machines = Object.values(stateMachines).filter(m => m.states.length > 0 || m.transitions.length > 0);

  const output = {
    tool: 'state-machine-extractor.mjs',
    repoPath: REPO_PATH,
    extractedAt: new Date().toISOString(),
    totalStateMachines: machines.length,
    stateMachines: machines,
  };

  if (OUTPUT_FILE) {
    fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf8');
    console.log(`[state-machine-extractor] ✅ Saved to: ${OUTPUT_FILE}`);
  } else {
    console.log(JSON.stringify(output, null, 2));
  }

  console.log(`[state-machine-extractor] Scanned ${fileCount} files, found ${machines.length} state machines`);
  machines.forEach(m => {
    console.log(`  📊 ${m.entity.padEnd(20)} States: [${m.states.join(', ')}]`);
    m.transitions.forEach(t => console.log(`     ${t.from} → ${t.to}`));
  });
}

main().catch(err => {
  console.error('[state-machine-extractor] FATAL:', err.message);
  process.exit(1);
});
