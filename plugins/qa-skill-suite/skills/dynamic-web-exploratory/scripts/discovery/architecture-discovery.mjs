#!/usr/bin/env node
/**
 * architecture-discovery.mjs — Repository Architecture Map Builder
 *
 * Xây dựng bản đồ kiến trúc hệ thống từ source code:
 *   - Module → Controller → Service → Repository
 *   - External services (HTTP client, axios, fetch to external domains)
 *   - Queue/Event producers and consumers
 *   - Cron jobs / Scheduled tasks
 *   - Webhooks
 *   - Database connections
 *   - Cache (Redis)
 *   - Mail / SMS / Push notification
 *
 * Đầu ra: architecture-map.json
 *
 * Usage:
 *   node architecture-discovery.mjs --repo /path/to/project
 *   node architecture-discovery.mjs --repo . --output qa-knowledge/repositories/my-repo/architecture-map.json
 */

import fs from 'node:fs';
import path from 'node:path';

const args   = process.argv.slice(2);
const getArg = (flag, def) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : def; };

const REPO_PATH   = path.resolve(getArg('--repo', '.'));
const OUTPUT_FILE = getArg('--output', null);
const MAX_FILE_SIZE = 150 * 1024;

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
  'coverage', '__mocks__', 'vendor', 'generated',
]);

function walkDir(dir, onFile, depth = 0) {
  if (depth > 10) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }

  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const fullPath = path.join(dir, e.name);
    if (e.isDirectory()) walkDir(fullPath, onFile, depth + 1);
    else if (e.isFile() && /\.(ts|js|tsx|jsx|mjs)$/.test(e.name)) {
      const stat = fs.statSync(fullPath);
      if (stat.size < MAX_FILE_SIZE) onFile(fullPath);
    }
  }
}

function getModuleName(relativePath) {
  const parts = relativePath.replace(/\\/g, '/').split('/');
  const srcIdx = parts.indexOf('src');
  if (srcIdx !== -1 && parts[srcIdx + 1]) return parts[srcIdx + 1];
  return parts.length >= 2 ? parts[parts.length - 2] : 'root';
}

function getComponentType(filename) {
  if (/\.controller\.(ts|js)$/.test(filename)) return 'controller';
  if (/\.service\.(ts|js)$/.test(filename))    return 'service';
  if (/\.repository\.(ts|js)$/.test(filename)) return 'repository';
  if (/\.gateway\.(ts|js)$/.test(filename))    return 'gateway';
  if (/\.guard\.(ts|js)$/.test(filename))      return 'guard';
  if (/\.middleware\.(ts|js)$/.test(filename)) return 'middleware';
  if (/\.interceptor\.(ts|js)$/.test(filename)) return 'interceptor';
  if (/\.pipe\.(ts|js)$/.test(filename))       return 'pipe';
  if (/\.module\.(ts|js)$/.test(filename))     return 'module_def';
  if (/\.dto\.(ts|js)$/.test(filename))        return 'dto';
  if (/\.entity\.(ts|js)$/.test(filename))     return 'entity';
  if (/\.schema\.(ts|js)$/.test(filename))     return 'schema';
  if (/\.(spec|test)\.(ts|js)$/.test(filename)) return 'test';
  return 'other';
}

function detectIntegrations(content) {
  const integrations = [];

  if (/axios\.create|new Axios|HttpService|fetch\(/.test(content))    integrations.push('http_client');
  if (/createClient.*redis|Redis\(|ioredis|new Redis/.test(content))  integrations.push('redis');
  if (/nodemailer|sendgrid|@sendgrid|mailgun|resend|smtp/i.test(content)) integrations.push('email');
  if (/twilio|vonage|nexmo|sms/i.test(content))                       integrations.push('sms');
  if (/firebase|fcm|apns|push.*notification/i.test(content))          integrations.push('push_notification');
  if (/bull|bullmq|RabbitMQ|amqplib|kafka|EventEmitter/i.test(content)) integrations.push('queue_event');
  if (/@Cron|CronJob|setInterval|schedule\.job/i.test(content))       integrations.push('cron_job');
  if (/stripe|paypal|momo|vnpay|zalopay/i.test(content))              integrations.push('payment_gateway');
  if (/s3|minio|cloudinary|multer|storage/i.test(content))            integrations.push('file_storage');
  if (/typeorm|prisma|mongoose|sequelize|drizzle/i.test(content))     integrations.push('database');

  return [...new Set(integrations)];
}

async function main() {
  if (!fs.existsSync(REPO_PATH)) {
    console.error(`[architecture-discovery] ❌ Repo path không tồn tại: ${REPO_PATH}`);
    process.exit(1);
  }

  console.log(`[architecture-discovery] Building architecture map from: ${REPO_PATH}`);

  const moduleMap = {};
  const allIntegrations = new Set();
  let fileCount = 0;

  walkDir(REPO_PATH, (filePath) => {
    const relativePath = path.relative(REPO_PATH, filePath);
    const filename = path.basename(filePath);
    const compType = getComponentType(filename);
    if (compType === 'test') return;

    const moduleName = getModuleName(relativePath);
    if (!moduleMap[moduleName]) {
      moduleMap[moduleName] = {
        name: moduleName,
        controllers: [], services: [], repositories: [],
        gateways: [], guards: [], middlewares: [],
        dtos: [], entities: [], integrations: [], otherFiles: [],
      };
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const integrations = detectIntegrations(content);
    integrations.forEach(i => {
      allIntegrations.add(i);
      if (!moduleMap[moduleName].integrations.includes(i)) {
        moduleMap[moduleName].integrations.push(i);
      }
    });

    const compInfo = { file: relativePath };
    switch (compType) {
      case 'controller':  moduleMap[moduleName].controllers.push(compInfo); break;
      case 'service':     moduleMap[moduleName].services.push(compInfo); break;
      case 'repository':  moduleMap[moduleName].repositories.push(compInfo); break;
      case 'gateway':     moduleMap[moduleName].gateways.push(compInfo); break;
      case 'guard':       moduleMap[moduleName].guards.push(compInfo); break;
      case 'middleware':  moduleMap[moduleName].middlewares.push(compInfo); break;
      case 'dto':         moduleMap[moduleName].dtos.push(compInfo); break;
      case 'entity':      moduleMap[moduleName].entities.push(compInfo); break;
    }

    fileCount++;
  });

  // Build summary
  const modules = Object.values(moduleMap).filter(m =>
    m.controllers.length + m.services.length + m.repositories.length +
    m.gateways.length + m.entities.length > 0
  );

  const archMap = {
    tool: 'architecture-discovery.mjs',
    repoPath: REPO_PATH,
    discoveredAt: new Date().toISOString(),
    totalModules: modules.length,
    totalFiles: fileCount,
    globalIntegrations: [...allIntegrations].sort(),
    modules,
  };

  if (OUTPUT_FILE) {
    fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(archMap, null, 2), 'utf8');
    console.log(`[architecture-discovery] ✅ Saved to: ${OUTPUT_FILE}`);
  } else {
    const preview = { ...archMap, modules: archMap.modules.map(m => ({
      name: m.name,
      controllers: m.controllers.length,
      services: m.services.length,
      repositories: m.repositories.length,
      integrations: m.integrations,
    }))};
    console.log(JSON.stringify(preview, null, 2));
  }

  console.log(`\n[architecture-discovery] ${modules.length} modules, ${fileCount} files scanned`);
  console.log(`Global integrations: ${[...allIntegrations].join(', ') || 'none'}`);
  modules.forEach(m => {
    console.log(`  📦 ${String(m.name).padEnd(25)} ctrl:${m.controllers.length} svc:${m.services.length} repo:${m.repositories.length} entity:${m.entities.length}`);
  });
}

main().catch(err => {
  console.error('[architecture-discovery] FATAL:', err.message);
  process.exit(1);
});
