#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const envPath = process.env.WIKI_ENV_FILE || path.join(scriptDir, '.env');
const outputDir = path.resolve(
    process.argv[2]
    || process.env.SJK_OUTPUT_DIR
    || path.join(scriptDir, 'SJK'),
);

function loadEnv(filePath) {
  const values = {};
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^"|"$/g, '');
    values[key] = value;
  }
  return values;
}

const env = loadEnv(envPath);
if (!env.URL || !env.api_key) throw new Error(`Missing URL or api_key in ${envPath}`);

const baseUrl = env.URL.replace(/\/+$/, '');
const headers = {
  Authorization: `Bearer ${env.api_key}`,
  'Content-Type': 'application/json',
};

async function searchDocuments() {
  const response = await fetch(`${baseUrl}/api/documents.search`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query: 'SJK', limit: 100, offset: 0 }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok === false) {
    throw new Error(`documents.search failed with HTTP ${response.status}`);
  }
  return body.data || [];
}

const sensitiveTitle = /(tài khoản|credential|smtp\s+login|password|secret)/i;
const sensitiveLine = /(password|mật khẩu|api[ _-]?key|secret|token|credential|private[ _-]?key|service[ _-]?role|connection[ _-]?string|database[ _-]?url|resend|\blogin\b|\bPW\b|\bpass\b)/i;
const sensitiveAssignment = /([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASS|PWD|DATABASE_URL|CONNECTION_STRING)[A-Z0-9_]*)\s*[:=]\s*([^\s|`]+)/gi;

function cleanUrl(value) {
  try {
    const url = new URL(value.replace(/[),.;]+$/, ''));
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '') || url.origin;
  } catch {
    return null;
  }
}

function extractUrls(text) {
  const urls = new Set();
  for (const match of text.matchAll(/https?:\/\/[^\s<>)\]`"']+/g)) {
    const url = cleanUrl(match[0]);
    if (url) urls.add(url);
  }
  return [...urls];
}

function sanitizeText(text) {
  return text
    .split(/\r?\n/)
    .map((line) => {
      if (sensitiveLine.test(line)) return '[REDACTED sensitive configuration line]';
      return line
        .replace(/Bearer\s+[^\s`|]+/gi, 'Bearer [REDACTED]')
        .replace(sensitiveAssignment, '$1=[REDACTED]')
        .replace(/\bSJK?@[A-Za-z0-9._-]+\b/g, '[REDACTED]');
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function slugify(title, id) {
  const slug = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 90);
  return `${slug || 'document'}-${id.slice(0, 8)}`;
}

function sourceUrl(document) {
  return new URL(document.url, `${baseUrl}/`).toString();
}

const results = await searchDocuments();
const records = results
  .map((result) => result.document)
  .filter((document) => document && document.id && document.title);
const safeRecords = records.filter((document) => !sensitiveTitle.test(document.title));
const omittedRecords = records.filter((document) => sensitiveTitle.test(document.title));
const links = new Map();

for (const document of records) {
  for (const url of extractUrls(document.text || '')) {
    const bucket = links.get(url) || [];
    bucket.push(document.title);
    links.set(url, bucket);
  }
}

fs.mkdirSync(path.join(outputDir, 'documents'), { recursive: true });

const index = records.map((document) => ({
  id: document.id,
  title: document.title,
  sourceUrl: sourceUrl(document),
  collectionId: document.collectionId,
  updatedAt: document.updatedAt,
  exported: !sensitiveTitle.test(document.title),
  omissionReason: sensitiveTitle.test(document.title) ? 'credential_or_secret_source' : null,
}));

fs.writeFileSync(
  path.join(outputDir, 'wiki-index.json'),
  `${JSON.stringify({ generatedAt: new Date().toISOString(), query: 'SJK', total: records.length, exported: safeRecords.length, omitted: omittedRecords.length, documents: index }, null, 2)}\n`,
);

for (const document of safeRecords) {
  const content = sanitizeText(document.text || 'No document text returned');
  const markdown = [
    `# ${document.title.replace(/^[🏠\s]+/, '').trim()}`,
    '',
    `- Source: ${sourceUrl(document)}`,
    `- Document ID: ${document.id}`,
    `- Collection ID: ${document.collectionId || 'unknown'}`,
    `- Updated at: ${document.updatedAt || 'unknown'}`,
    '',
    content,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(outputDir, 'documents', `${slugify(document.title, document.id)}.md`), markdown);
}

const environmentLinks = [...links.entries()]
  .filter(([url]) => /sjk|render\.com|supabase\.com|metasolutions/i.test(url))
  .sort(([a], [b]) => a.localeCompare(b));

const readme = [
  '# SJK project knowledge export',
  '',
  `Generated from ${baseUrl} using read-only search query \`SJK\``,
  '',
  `- Documents found: ${records.length}`,
  `- Documents exported: ${safeRecords.length}`,
  `- Sensitive sources omitted: ${omittedRecords.length}`,
  '- Credentials, passwords, tokens, API keys and connection strings are not copied',
  '',
  '## Files',
  '',
  '- `environment-links.md`: environment and project links with query strings removed',
  '- `wiki-index.json`: source metadata for all matched documents',
  '- `documents/`: sanitized business, functional, architecture and operational documents',
  '- `omitted-sensitive-sources.md`: titles and source links omitted from content export',
  '',
  '## Source collections',
  '',
  '- SJK project collection',
  '- Internal infrastructure references are included only when their content can be sanitized safely',
  '',
].join('\n');
fs.writeFileSync(path.join(outputDir, 'README.md'), readme);

const linksMarkdown = [
  '# SJK environment and project links',
  '',
  'Links are extracted from related Wiki documents. Query strings and fragments are removed',
  '',
  ...environmentLinks.flatMap(([url, sources]) => [`- ${url}`, `  - Source: ${[...new Set(sources)].join('; ')}`]),
  '',
].join('\n');
fs.writeFileSync(path.join(outputDir, 'environment-links.md'), linksMarkdown);

const omittedMarkdown = [
  '# Omitted sensitive sources',
  '',
  'The following sources were found but their content was not copied because they are credential or secret sources',
  '',
  ...omittedRecords.map((document) => `- ${document.title} — ${sourceUrl(document)}`),
  '',
].join('\n');
fs.writeFileSync(path.join(outputDir, 'omitted-sensitive-sources.md'), omittedMarkdown);

console.log(JSON.stringify({ outputDir, found: records.length, exported: safeRecords.length, omittedSensitive: omittedRecords.length, environmentLinks: environmentLinks.length }, null, 2));
