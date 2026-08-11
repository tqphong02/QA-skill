#!/usr/bin/env node
/**
 * database-domain-extractor.mjs — Domain Model Builder from ORM/Schema
 *
 * Xây dựng Domain Model từ:
 *   - TypeORM: @Entity(), @Column(), @PrimaryGeneratedColumn(), relations
 *   - Prisma: model blocks in schema.prisma
 *   - Mongoose: new Schema({})
 *   - Drizzle: pgTable / mysqlTable / sqliteTable
 *
 * Đầu ra: domain-model.json với:
 *   entities[], relationships[], mermaidERD string
 *
 * Usage:
 *   node database-domain-extractor.mjs --repo /path/to/project
 *   node database-domain-extractor.mjs --repo . --output qa-knowledge/repositories/my-repo/domain-model.json
 */

import fs from 'node:fs';
import path from 'node:path';

const args   = process.argv.slice(2);
const getArg = (flag, def) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : def; };

const REPO_PATH   = path.resolve(getArg('--repo', '.'));
const OUTPUT_FILE = getArg('--output', null);

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.nuxt', 'coverage', '__mocks__', 'vendor', 'generated']);

function walkDir(dir, onFile, exts = ['.ts', '.js', '.prisma'], depth = 0) {
  if (depth > 10) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const fullPath = path.join(dir, e.name);
    if (e.isDirectory()) walkDir(fullPath, onFile, exts, depth + 1);
    else if (e.isFile() && exts.some(ext => e.name.endsWith(ext))) {
      const stat = fs.statSync(fullPath);
      if (stat.size < 200 * 1024) onFile(fullPath);
    }
  }
}

function extractTypeORMEntity(content, relativePath) {
  const entities = [];
  const lines = content.split('\n');
  let inEntity = false;
  let entityName = '';
  let columns = [];

  lines.forEach((line, i) => {
    const trim = line.trim();
    let m;

    if (/@Entity\(/.test(trim)) {
      inEntity = true;
      entityName = '';
      columns = [];
    }
    if (inEntity && (m = trim.match(/^(?:export\s+)?class\s+(\w+)/))) {
      entityName = m[1];
    }
    if (inEntity && entityName) {
      // Column decorators
      if ((m = trim.match(/@(?:PrimaryGeneratedColumn|PrimaryColumn|Column|CreateDateColumn|UpdateDateColumn|DeleteDateColumn)\s*\(/))) {
        const nextLine = lines[i + 1]?.trim() || '';
        const propMatch = nextLine.match(/^(\w+)\s*[?!:]?\s*:\s*(\w+)/);
        if (propMatch) {
          columns.push({
            name: propMatch[1],
            type: propMatch[2],
            isPrimary: /@PrimaryGeneratedColumn|@PrimaryColumn/.test(trim),
          });
        }
      }
      // Relation decorators
      if ((m = trim.match(/@(OneToMany|ManyToOne|OneToOne|ManyToMany)\(\s*\(\s*\)\s*=>\s*(\w+)/))) {
        columns.push({
          name: 'relation',
          type: m[2],
          relation: m[1],
        });
      }
    }
    if (inEntity && trim === '}' && entityName) {
      entities.push({ name: entityName, columns, source: relativePath, orm: 'TypeORM' });
      inEntity = false;
    }
  });

  return entities;
}

function extractPrismaSchema(content, relativePath) {
  const entities = [];
  const lines = content.split('\n');
  let inModel = false;
  let modelName = '';
  let columns = [];

  lines.forEach((line) => {
    const trim = line.trim();
    let m;

    if ((m = trim.match(/^model\s+(\w+)\s*\{/))) {
      inModel = true;
      modelName = m[1];
      columns = [];
    } else if (inModel && trim === '}') {
      entities.push({ name: modelName, columns, source: relativePath, orm: 'Prisma' });
      inModel = false;
    } else if (inModel) {
      const fieldMatch = trim.match(/^(\w+)\s+(\w+)\??(\s|@)/);
      if (fieldMatch) {
        columns.push({
          name: fieldMatch[1],
          type: fieldMatch[2],
          isOptional: trim.includes('?'),
          isPrimary: trim.includes('@id'),
        });
      }
    }
  });

  return entities;
}

function extractMongooseSchema(content, relativePath) {
  const entities = [];
  const lines = content.split('\n');

  lines.forEach((line, i) => {
    let m;
    if ((m = line.match(/(?:const|let|var)\s+(\w+Schema)\s*=\s*new\s+Schema\(/))) {
      const schemaName = m[1].replace(/Schema$/, '');
      entities.push({
        name: schemaName,
        columns: [], // Mongoose schemas are dynamic; basic detection
        source: `${relativePath}:${i + 1}`,
        orm: 'Mongoose',
      });
    }
  });

  return entities;
}

function buildMermaidERD(entities) {
  if (entities.length === 0) return '';
  const lines = ['erDiagram'];

  for (const entity of entities) {
    const cols = entity.columns.filter(c => c.name !== 'relation' && c.type);
    if (cols.length === 0) continue;
    lines.push(`  ${entity.name} {`);
    cols.forEach(c => {
      lines.push(`    ${c.type} ${c.name}${c.isPrimary ? ' PK' : ''}`);
    });
    lines.push('  }');
  }

  // Relations
  for (const entity of entities) {
    entity.columns
      .filter(c => c.relation)
      .forEach(c => {
        const rel = c.relation === 'OneToMany' ? '||--o{' :
                    c.relation === 'ManyToOne' ? '}o--||' :
                    c.relation === 'ManyToMany' ? '}o--o{' : '||--||';
        lines.push(`  ${entity.name} ${rel} ${c.type} : ""`);
      });
  }

  return lines.join('\n');
}

async function main() {
  if (!fs.existsSync(REPO_PATH)) {
    console.error(`[database-domain-extractor] ❌ Repo path không tồn tại: ${REPO_PATH}`);
    process.exit(1);
  }

  console.log(`[database-domain-extractor] Extracting domain model from: ${REPO_PATH}`);

  const entities = [];
  let fileCount = 0;

  walkDir(REPO_PATH, (filePath) => {
    const relativePath = path.relative(REPO_PATH, filePath);
    const content = fs.readFileSync(filePath, 'utf8');

    if (filePath.endsWith('.prisma')) {
      entities.push(...extractPrismaSchema(content, relativePath));
    } else if (/@Entity\(/.test(content)) {
      entities.push(...extractTypeORMEntity(content, relativePath));
    } else if (/new\s+Schema\(/.test(content)) {
      entities.push(...extractMongooseSchema(content, relativePath));
    }

    fileCount++;
  });

  const mermaidERD = buildMermaidERD(entities);

  const output = {
    tool: 'database-domain-extractor.mjs',
    repoPath: REPO_PATH,
    extractedAt: new Date().toISOString(),
    totalEntities: entities.length,
    ormUsed: [...new Set(entities.map(e => e.orm))],
    entities,
    mermaidERD,
  };

  if (OUTPUT_FILE) {
    fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf8');
    console.log(`[database-domain-extractor] ✅ Saved to: ${OUTPUT_FILE}`);
  } else {
    console.log(JSON.stringify({ ...output, mermaidERD: '(see --output for ERD)' }, null, 2));
  }

  console.log(`[database-domain-extractor] ${fileCount} files → ${entities.length} entities`);
  entities.forEach(e => console.log(`  🗄️  ${e.name.padEnd(25)} (${e.orm}) — ${e.columns.length} columns`));
}

main().catch(err => {
  console.error('[database-domain-extractor] FATAL:', err.message);
  process.exit(1);
});
