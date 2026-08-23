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
const SUPPORTED_SURFACES = new Set(['ui', 'api', 'functional', 'performance']);
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

function moduleArtifactNames(moduleSlugValue, surface = 'functional') {
  const slug = String(moduleSlugValue || '');
  if (!isCanonicalModuleSlug(slug)) {
    throw new Error(`Invalid canonical module slug: "${moduleSlugValue}"`);
  }
  const normalizedSurface = normalizeSurface(surface);
  return {
    slug,
    selector: `${slug}.selectors.ts`,
    page: `${slug}.page.ts`,
    spec: `${slug}.${normalizedSurface}.spec.ts`,
  };
}

function moduleArtifactPaths(projectRoot, moduleSlugValue, surface = 'functional') {
  const normalizedSurface = normalizeSurface(surface);
  const names = moduleArtifactNames(moduleSlugValue, normalizedSurface);
  return {
    spec: path.join(projectRoot, 'tests', normalizedSurface, names.spec),
    page: path.join(projectRoot, 'pages', names.page),
    selector: path.join(projectRoot, 'selectors', names.selector),
  };
}

function isCanonicalModuleSlug(value) {
  const slug = String(value || '');
  return slug.length <= MAX_MODULE_SLUG_LENGTH && MODULE_SLUG_PATTERN.test(slug);
}

export {
  DEFAULT_MODULE_SLUG,
  MAX_MODULE_SLUG_LENGTH,
  RESERVED_MODULE_SLUGS,
  SUPPORTED_SURFACES,
  isCanonicalModuleSlug,
  moduleArtifactNames,
  moduleArtifactPaths,
  normalizeSurface,
  resolveModuleSlug,
};
