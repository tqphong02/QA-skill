#!/usr/bin/env node

/**
 * Canonical names for deterministic testcase/POM artifacts.
 *
 * The manifest group is the single source for the module slug. Keep this
 * helper small and dependency-free because it is copied into generated
 * automation projects together with the other scripts.
 */

import path from 'node:path';

const DEFAULT_MODULE_SLUG = 'other';
const MAX_MODULE_SLUG_LENGTH = 80;
const SUPPORTED_SURFACES = new Set(['ui', 'api', 'functional']);
const SUPPORTED_CAPABILITIES = new Set(['ui', 'api']);
const RESERVED_MODULE_SLUGS = new Set(['base']);
const MODULE_SLUG_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

function resolveModuleSlug(value, fallback = DEFAULT_MODULE_SLUG) {
  const normalized = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/&/g, '-and-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!normalized) return fallback;
  const safe = /^[a-z]/.test(normalized) ? normalized : `module-${normalized}`;
  return safe.slice(0, MAX_MODULE_SLUG_LENGTH).replace(/-+$/g, '');
}

function normalizeSurface(surface = 'functional') {
  const normalized = String(surface || '').trim().toLowerCase();
  if (!SUPPORTED_SURFACES.has(normalized)) {
    throw new Error(
      `Unsupported surface "${surface}"; expected one of ${[...SUPPORTED_SURFACES].join(', ')}`,
    );
  }
  return normalized;
}

function normalizeCapabilities(surface = 'functional', capabilities) {
  const normalizedSurface = normalizeSurface(surface);
  const defaults = normalizedSurface === 'functional'
    ? ['ui', 'api']
    : SUPPORTED_CAPABILITIES.has(normalizedSurface)
      ? [normalizedSurface]
      : [];
  const source = capabilities === undefined || capabilities === null
    ? defaults
    : Array.isArray(capabilities)
      ? capabilities
      : [capabilities];
  const normalized = [...new Set(source.map(value => String(value || '').trim().toLowerCase()))];
  const unsupported = normalized.filter(value => !SUPPORTED_CAPABILITIES.has(value));
  if (unsupported.length > 0) {
    throw new Error(
      `Unsupported module capabilities: ${unsupported.join(', ')}; expected ui and/or api`,
    );
  }
  if (normalizedSurface === 'ui' && normalized.some(value => value !== 'ui')) {
    throw new Error('The ui surface cannot contain api module capabilities');
  }
  if (normalizedSurface === 'api' && normalized.some(value => value !== 'api')) {
    throw new Error('The api surface cannot contain ui module capabilities');
  }
  return ['ui', 'api'].filter(value => normalized.includes(value));
}

function moduleArtifactKinds(surface = 'functional', capabilities) {
  const normalizedSurface = normalizeSurface(surface);
  const normalizedCapabilities = normalizeCapabilities(normalizedSurface, capabilities);
  return [
    ...(normalizedCapabilities.includes('ui') ? ['selector', 'page'] : []),
    ...(normalizedCapabilities.includes('api') ? ['client', 'schema'] : []),
    'spec',
  ];
}

function moduleArtifactNames(moduleSlugValue, surface = 'functional', capabilities) {
  const slug = String(moduleSlugValue || '');
  if (!isCanonicalModuleSlug(slug)) {
    throw new Error(`Invalid canonical module slug: "${moduleSlugValue}"`);
  }
  const normalizedSurface = normalizeSurface(surface);
  const kinds = moduleArtifactKinds(normalizedSurface, capabilities);
  const names = { slug };
  if (kinds.includes('selector')) names.selector = `${slug}.selectors.ts`;
  if (kinds.includes('page')) names.page = `${slug}.page.ts`;
  if (kinds.includes('client')) names.client = `${slug}.client.ts`;
  if (kinds.includes('schema')) names.schema = `${slug}.schema.ts`;
  names.spec = `${slug}.${normalizedSurface}.spec.ts`;
  return names;
}

function moduleArtifactPaths(projectRoot, moduleSlugValue, surface = 'functional', capabilities) {
  const normalizedSurface = normalizeSurface(surface);
  const names = moduleArtifactNames(moduleSlugValue, normalizedSurface, capabilities);
  const paths = {};
  if (names.selector) paths.selector = path.join(projectRoot, 'selectors', names.selector);
  if (names.page) paths.page = path.join(projectRoot, 'pages', names.page);
  if (names.client) paths.client = path.join(projectRoot, 'clients', names.client);
  if (names.schema) paths.schema = path.join(projectRoot, 'schemas', names.schema);
  paths.spec = path.join(projectRoot, 'tests', normalizedSurface, names.spec);
  return paths;
}

function slugToPascalCase(value) {
  const slug = String(value || '');
  if (!isCanonicalModuleSlug(slug)) {
    throw new Error(`Invalid canonical module slug: "${value}"`);
  }
  return slug.split('-').map(part => `${part[0].toUpperCase()}${part.slice(1)}`).join('');
}

function slugToCamelCase(value) {
  const pascal = slugToPascalCase(value);
  return `${pascal[0].toLowerCase()}${pascal.slice(1)}`;
}

function isCanonicalModuleSlug(value) {
  const slug = String(value || '');
  return slug.length <= MAX_MODULE_SLUG_LENGTH && MODULE_SLUG_PATTERN.test(slug);
}

export {
  DEFAULT_MODULE_SLUG,
  MAX_MODULE_SLUG_LENGTH,
  RESERVED_MODULE_SLUGS,
  SUPPORTED_CAPABILITIES,
  SUPPORTED_SURFACES,
  isCanonicalModuleSlug,
  moduleArtifactKinds,
  moduleArtifactNames,
  moduleArtifactPaths,
  normalizeCapabilities,
  normalizeSurface,
  resolveModuleSlug,
  slugToCamelCase,
  slugToPascalCase,
};
