import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

function computeHash(dataObj) {
  const str = JSON.stringify(dataObj || {});
  return crypto.createHash('sha256').update(str).digest('hex').slice(0, 12);
}

function compareKnowledgeHashes(oldMap, newMap) {
  const oldHashes = oldMap.hashes || {};
  const newHashes = {
    routesHash: computeHash((newMap.modules || []).map(m => m.url)),
    menuHash: computeHash((newMap.modules || []).map(m => m.name)),
    formSchemaHash: computeHash((newMap.modules || []).flatMap(m => m.forms || [])),
    apiContractHash: computeHash(newMap.api_contracts || []),
  };

  const changedAreas = [];
  for (const [k, v] of Object.entries(newHashes)) {
    if (oldHashes[k] && oldHashes[k] !== v) {
      changedAreas.push(k);
    }
  }

  return {
    status: changedAreas.length > 0 ? 'STALE' : 'VALID',
    changedAreas,
    affectedModules: (newMap.modules || []).map(m => m.name),
  };
}

test('Knowledge Hash: Identical knowledge returns VALID status', () => {
  const map = {
    modules: [{ name: 'Login', url: '/login', forms: ['email', 'password'] }],
    hashes: {},
  };
  map.hashes = {
    routesHash: computeHash(map.modules.map(m => m.url)),
    menuHash: computeHash(map.modules.map(m => m.name)),
    formSchemaHash: computeHash(map.modules.flatMap(m => m.forms)),
  };

  const res = compareKnowledgeHashes(map, map);
  assert.equal(res.status, 'VALID');
  assert.equal(res.changedAreas.length, 0);
});

test('Knowledge Hash: Form schema change detects STALE status and flags formSchemaHash', () => {
  const oldMap = {
    modules: [{ name: 'Register', url: '/register', forms: ['email'] }],
    hashes: {},
  };
  oldMap.hashes = {
    routesHash: computeHash(oldMap.modules.map(m => m.url)),
    menuHash: computeHash(oldMap.modules.map(m => m.name)),
    formSchemaHash: computeHash(oldMap.modules.flatMap(m => m.forms)),
  };

  const newMap = {
    modules: [{ name: 'Register', url: '/register', forms: ['email', 'phone', 'tax_id'] }],
  };

  const res = compareKnowledgeHashes(oldMap, newMap);
  assert.equal(res.status, 'STALE');
  assert.deepEqual(res.changedAreas, ['formSchemaHash']);
});
