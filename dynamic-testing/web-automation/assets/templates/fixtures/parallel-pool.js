'use strict';

const fs = require('node:fs');
const path = require('node:path');

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function envSegment(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map(key => (
      `${JSON.stringify(key)}:${stableStringify(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

function packageProjectKey(projectRoot, environment = process.env) {
  const explicit = nonEmptyString(environment.QA_PROJECT_KEY);
  if (explicit) return envSegment(explicit) || 'QA';

  try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
    const packageName = isObject(packageJson) ? nonEmptyString(packageJson.name) : null;
    return packageName ? envSegment(packageName) || 'QA' : 'QA';
  } catch {
    return 'QA';
  }
}

function configuredPool(kind, projectKey, environment = process.env) {
  const candidates = [
    projectKey ? `${envSegment(projectKey)}_TEST_${kind}_JSON` : '',
    `QA_TEST_${kind}_JSON`,
    `TEST_${kind}_JSON`,
  ].filter(Boolean);

  for (const name of [...new Set(candidates)]) {
    const raw = nonEmptyString(environment[name]);
    if (raw) return { name, raw };
  }
  return null;
}

function parsePool(raw, envName) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`UNTEST: ${envName} must contain valid JSON`);
  }
  if (!Array.isArray(parsed) && !isObject(parsed)) {
    throw new Error(`UNTEST: ${envName} must be an array or a role map containing arrays`);
  }
  return parsed;
}

function declaredRoles(slot) {
  const roles = [];
  const role = nonEmptyString(slot.role);
  if (role) roles.push(role);
  if (Array.isArray(slot.roles)) {
    for (const value of slot.roles) {
      const declared = nonEmptyString(value);
      if (declared) roles.push(declared);
    }
  }
  return [...new Set(roles)];
}

function assertObjectSlots(value, envName, role) {
  if (!Array.isArray(value) || value.some(slot => !isObject(slot))) {
    throw new Error(
      `UNTEST: ${envName} must be an array or a role map containing object arrays; missing role pool: ${role}`,
    );
  }
  return value;
}

function selectPoolSlots(raw, envName, role, required = false) {
  const parsed = parsePool(raw, envName);
  if (Array.isArray(parsed)) {
    const slots = assertObjectSlots(parsed, envName, role);
    const roleCounts = slots.map(slot => declaredRoles(slot).length);
    const taggedCount = roleCounts.filter(count => count > 0).length;
    if (taggedCount > 0 && taggedCount !== slots.length) {
      throw new Error(`UNTEST: ${envName} cannot mix role-tagged and untagged slots`);
    }
    const selected = taggedCount > 0
      ? slots.filter(slot => declaredRoles(slot).includes(role))
      : slots;
    if (selected.length === 0 && required) {
      throw new Error(`UNTEST: ${envName} has no slots for required role: ${role}`);
    }
    return selected;
  }

  const selected = parsed[role] ?? parsed.default;
  if (selected === undefined && !required) return [];
  return assertObjectSlots(selected, envName, role);
}

function poolGroups(parsed, envName) {
  if (Array.isArray(parsed)) {
    const slots = assertObjectSlots(parsed, envName, 'default');
    const tagged = slots.map(slot => declaredRoles(slot));
    const taggedCount = tagged.filter(roles => roles.length > 0).length;
    if (taggedCount > 0 && taggedCount !== slots.length) {
      throw new Error(`UNTEST: ${envName} cannot mix role-tagged and untagged slots`);
    }
    if (taggedCount === 0) return [slots];
    return [...new Set(tagged.flat())].map(role => (
      slots.filter(slot => declaredRoles(slot).includes(role))
    ));
  }

  const entries = Object.entries(parsed);
  if (entries.length === 0) throw new Error(`UNTEST: ${envName} role map is empty`);
  return entries.map(([role, slots]) => assertObjectSlots(slots, envName, role));
}

function allPoolSlots(raw, envName) {
  const parsed = parsePool(raw, envName);
  if (Array.isArray(parsed)) {
    poolGroups(parsed, envName);
    return parsed;
  }
  return poolGroups(parsed, envName).flat();
}

function slotIdentity(slot, kind, projectRoot = process.cwd()) {
  return slotCollisionKeys(slot, kind, projectRoot).join('|');
}

function slotCollisionKeys(slot, kind, projectRoot = process.cwd()) {
  if (kind === 'ACCOUNTS') {
    const keys = [];
    const email = nonEmptyString(slot.email);
    if (email) keys.push(`email:${email.toLowerCase()}`);
    const state = nonEmptyString(slot.storageState) ?? nonEmptyString(slot.storage_state);
    if (state) keys.push(`storage:${path.resolve(projectRoot, state)}`);
    if (keys.length > 0) return keys;
    const id = nonEmptyString(slot.id);
    if (id) return [`id:${id}`];
  } else {
    const root = nonEmptyString(slot.dataRoot) ?? nonEmptyString(slot.data_root);
    const values = isObject(slot.values) ? slot.values : isObject(slot.data) ? slot.data : undefined;
    if (root || values !== undefined) {
      const resolvedRoot = root ? path.resolve(projectRoot, root) : '';
      return [`dataset:${resolvedRoot}:${stableStringify(values ?? {})}`];
    }
    const id = nonEmptyString(slot.id);
    if (id) return [`id:${id}`];
  }
  return [`slot:${stableStringify(slot)}`];
}

function parallelCapacity(groups, kind, projectRoot) {
  if (groups.length === 0) return 0;
  const maximum = Math.min(...groups.map(group => group.length));
  const groupKeys = groups.map(() => new Set());
  const keyPositions = new Map();
  for (let index = 0; index < maximum; index += 1) {
    for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
      const slot = groups[groupIndex][index];
      const keys = slotCollisionKeys(slot, kind, projectRoot);
      if (keys.some(key => groupKeys[groupIndex].has(key))) return index;
      if (keys.some(key => keyPositions.has(key) && keyPositions.get(key) !== index)) return index;
      keys.forEach(key => {
        groupKeys[groupIndex].add(key);
        keyPositions.set(key, index);
      });
    }
  }
  return maximum;
}

function poolCapacity(raw, kind, projectRoot = process.cwd()) {
  if (!nonEmptyString(raw)) return 0;
  try {
    const parsed = parsePool(raw, 'configured pool');
    const groups = poolGroups(parsed, 'configured pool');
    return parallelCapacity(groups, kind, projectRoot);
  } catch {
    return 0;
  }
}

function assertParallelPool(raw, workers, envName, kind, projectRoot = process.cwd()) {
  allPoolSlots(raw, envName);
  const capacity = poolCapacity(raw, kind, projectRoot);
  if (capacity < workers) {
    throw new Error(
      `UNTEST: ${envName} has safe parallel capacity ${capacity}, but ${workers} Playwright workers were requested`,
    );
  }
}

function assertPoolCapacity(slots, workers, envName, kind, projectRoot = process.cwd()) {
  if (slots.length < workers) {
    throw new Error(
      `UNTEST: ${envName} has ${slots.length} slot(s), but ${workers} Playwright workers require one slot each`,
    );
  }
  const keys = slots.slice(0, workers).flatMap(slot => slotCollisionKeys(slot, kind, projectRoot));
  if (new Set(keys).size !== keys.length) {
    const label = kind === 'ACCOUNTS' ? 'an account' : 'a dataset';
    throw new Error(`UNTEST: ${envName} reuses ${label} slot across parallel workers`);
  }
}

exports.assertPoolCapacity = assertPoolCapacity;
exports.assertParallelPool = assertParallelPool;
exports.allPoolSlots = allPoolSlots;
exports.configuredPool = configuredPool;
exports.envSegment = envSegment;
exports.packageProjectKey = packageProjectKey;
exports.poolCapacity = poolCapacity;
exports.selectPoolSlots = selectPoolSlots;
exports.slotIdentity = slotIdentity;
