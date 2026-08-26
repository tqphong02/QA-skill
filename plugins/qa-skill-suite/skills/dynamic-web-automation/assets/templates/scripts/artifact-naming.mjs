#!/usr/bin/env node

/**
 * Canonical names for deterministic testcase/POM artifacts.
 *
 * Module identity is domain + feature. Legacy manifests that only provide a
 * group remain deterministic: a single-segment group maps to app/<group>,
 * while "Domain / Feature" maps to <domain>/<feature>.
 */

import path from 'node:path';

const DEFAULT_MODULE_SLUG = 'other';
const DEFAULT_DOMAIN_SLUG = 'app';
const MAX_MODULE_SLUG_LENGTH = 80;
const SUPPORTED_SURFACES = new Set(['ui', 'api', 'functional']);
const SUPPORTED_CAPABILITIES = new Set(['ui', 'api']);
const RESERVED_MODULE_SLUGS = new Set(['base', 'shared', 'core']);
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

function splitGroup(group) {
  return String(group || '')
    .split(/\s*(?:\/|>|::)\s*/)
    .map(value => value.trim())
    .filter(Boolean);
}

function resolveModuleIdentity(value, overrides = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : { group: value };
  const nested = source.module && typeof source.module === 'object' ? source.module : {};
  const group = String(source.group || overrides.group || 'Other').trim() || 'Other';
  const parts = splitGroup(group);
  const explicitDomain = source.domain ?? nested.domain ?? overrides.domain;
  const explicitFeature = source.feature ?? nested.feature ?? overrides.feature;
  const domainSource = explicitDomain || (parts.length > 1 ? parts[0] : DEFAULT_DOMAIN_SLUG);
  const featureSource = explicitFeature || (parts.length > 1 ? parts.slice(1).join(' ') : group);
  const domain = resolveModuleSlug(domainSource, DEFAULT_DOMAIN_SLUG);
  const feature = resolveModuleSlug(featureSource, DEFAULT_MODULE_SLUG);
  return {
    group,
    domain,
    feature,
    key: `${domain}/${feature}`,
    slug: domain === DEFAULT_DOMAIN_SLUG ? feature : `${domain}-${feature}`,
  };
}

function normalizeSurface(surface = 'functional') {
  const normalized = String(surface || '').trim().toLowerCase();
  if (!SUPPORTED_SURFACES.has(normalized)) {
    throw new Error(`Unsupported surface "${surface}"; expected one of ${[...SUPPORTED_SURFACES].join(', ')}`);
  }
  return normalized;
}

function normalizeCapabilities(surface = 'functional', capabilities) {
  const normalizedSurface = normalizeSurface(surface);
  const defaults = normalizedSurface === 'functional'
    ? ['ui', 'api']
    : SUPPORTED_CAPABILITIES.has(normalizedSurface) ? [normalizedSurface] : [];
  const source = capabilities === undefined || capabilities === null
    ? defaults
    : Array.isArray(capabilities) ? capabilities : [capabilities];
  const normalized = [...new Set(source.map(value => String(value || '').trim().toLowerCase()))];
  const unsupported = normalized.filter(value => !SUPPORTED_CAPABILITIES.has(value));
  if (unsupported.length > 0) {
    throw new Error(`Unsupported module capabilities: ${unsupported.join(', ')}; expected ui and/or api`);
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
    ...(normalizedCapabilities.includes('api') ? ['client'] : []),
    'spec',
  ];
}

function canonicalIdentity(value) {
  if (typeof value === 'string') {
    if (!isCanonicalModuleSlug(value)) throw new Error(`Invalid canonical module slug: "${value}"`);
    return resolveModuleIdentity({ group: value, domain: DEFAULT_DOMAIN_SLUG, feature: value });
  }
  const identity = resolveModuleIdentity(value);
  if (![identity.domain, identity.feature].every(isCanonicalModuleSlug)) {
    throw new Error(`Invalid canonical module identity: "${identity.key}"`);
  }
  return identity;
}

function moduleArtifactNames(moduleValue, surface = 'functional', capabilities) {
  const identity = canonicalIdentity(moduleValue);
  const normalizedSurface = normalizeSurface(surface);
  const kinds = moduleArtifactKinds(normalizedSurface, capabilities);
  const names = { slug: identity.slug, domain: identity.domain, feature: identity.feature };
  if (kinds.includes('selector')) names.selector = `${identity.feature}.selectors.ts`;
  if (kinds.includes('page')) names.page = `${identity.feature}.page.ts`;
  if (kinds.includes('client')) names.client = `${identity.feature}.client.ts`;
  names.spec = `${identity.feature}.${normalizedSurface}.spec.ts`;
  return names;
}

function moduleSourceRoot(projectRoot, moduleValue) {
  const identity = canonicalIdentity(moduleValue);
  return path.join(projectRoot, 'src', 'modules', identity.domain, identity.feature);
}

function moduleSchemaRoot(projectRoot, moduleValue) {
  return path.join(moduleSourceRoot(projectRoot, moduleValue), 'api', 'schemas');
}

function moduleOperationInventoryPath(projectRoot, moduleValue) {
  const identity = canonicalIdentity(moduleValue);
  return path.join(projectRoot, 'operation-inventory', identity.domain, `${identity.feature}.api-operations.json`);
}

function moduleArtifactPaths(projectRoot, moduleValue, surface = 'functional', capabilities) {
  const identity = canonicalIdentity(moduleValue);
  const normalizedSurface = normalizeSurface(surface);
  const names = moduleArtifactNames(identity, normalizedSurface, capabilities);
  const sourceRoot = moduleSourceRoot(projectRoot, identity);
  const paths = {};
  if (names.selector) paths.selector = path.join(sourceRoot, 'ui', names.selector);
  if (names.page) paths.page = path.join(sourceRoot, 'ui', names.page);
  if (names.client) paths.client = path.join(sourceRoot, 'api', names.client);
  paths.spec = path.join(projectRoot, 'tests', normalizedSurface, identity.domain, names.spec);
  return paths;
}

function relativeImport(fromFile, toFile) {
  let relative = path.relative(path.dirname(fromFile), toFile)
    .replace(/\\/g, '/')
    .replace(/\.(?:ts|mts|cts)$/i, '');
  if (!relative.startsWith('.')) relative = `./${relative}`;
  return relative;
}

function slugToPascalCase(value) {
  const slug = String(value || '');
  if (!isCanonicalModuleSlug(slug)) throw new Error(`Invalid canonical module slug: "${value}"`);
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
  DEFAULT_DOMAIN_SLUG,
  DEFAULT_MODULE_SLUG,
  MAX_MODULE_SLUG_LENGTH,
  RESERVED_MODULE_SLUGS,
  SUPPORTED_CAPABILITIES,
  SUPPORTED_SURFACES,
  isCanonicalModuleSlug,
  moduleArtifactKinds,
  moduleArtifactNames,
  moduleArtifactPaths,
  moduleOperationInventoryPath,
  moduleSchemaRoot,
  moduleSourceRoot,
  normalizeCapabilities,
  normalizeSurface,
  relativeImport,
  resolveModuleIdentity,
  resolveModuleSlug,
  slugToCamelCase,
  slugToPascalCase,
};
