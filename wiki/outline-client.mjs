#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const envPath = process.env.WIKI_ENV_FILE || path.join(scriptDir, '.env');

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
if (!env.URL || !env.api_key) {
  throw new Error(`Missing URL or api_key in ${envPath}`);
}

const baseUrl = env.URL.replace(/\/+$/, '');
const headers = {
  Authorization: `Bearer ${env.api_key}`,
  'Content-Type': 'application/json',
};

async function call(endpoint, payload) {
  const response = await fetch(`${baseUrl}/api/${endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok === false) {
    const message = body.error || body.message || `HTTP ${response.status}`;
    throw new Error(`${endpoint}: ${message}`);
  }
  return body;
}

function collectionMetadata(collection) {
  return {
    id: collection.id,
    name: collection.name,
    slugId: collection.slugId,
    documentCount: collection.documentCount,
  };
}

function documentMetadata(document) {
  return {
    id: document.id,
    title: document.title,
    slugId: document.slugId,
    collectionId: document.collectionId,
    updatedAt: document.updatedAt,
  };
}

const command = process.argv[2] || 'summary';
const limit = Number.parseInt(process.argv[3] || '10', 10);
if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
  throw new Error('limit must be an integer between 1 and 100');
}

const payload = { limit, offset: 0 };
if (command === 'collections') {
  const result = await call('collections.list', payload);
  console.log(JSON.stringify({ endpoint: 'collections.list', count: result.data.length, data: result.data.map(collectionMetadata) }, null, 2));
} else if (command === 'documents') {
  const result = await call('documents.list', payload);
  console.log(JSON.stringify({ endpoint: 'documents.list', count: result.data.length, data: result.data.map(documentMetadata) }, null, 2));
} else if (command === 'summary') {
  const [collections, documents] = await Promise.all([
    call('collections.list', { limit: 100, offset: 0 }),
    call('documents.list', payload),
  ]);
  console.log(JSON.stringify({
    baseUrl: new URL(baseUrl).origin,
    collections: { count: collections.data.length, data: collections.data.map(collectionMetadata) },
    documents: { count: documents.data.length, data: documents.data.map(documentMetadata) },
  }, null, 2));
} else {
  throw new Error('Usage: node wiki/outline-client.mjs [summary|collections|documents] [limit]');
}
