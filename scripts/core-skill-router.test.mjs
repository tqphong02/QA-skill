import test from 'node:test'
import assert from 'node:assert/strict'

import {
  loadRoutingContract,
  normalizeRoutingIntent,
  routeRequest,
  validateRoutingContract,
} from './core-skill-router.mjs'

test('core routing golden dataset and host documents stay synchronized', () => {
  assert.deepEqual(validateRoutingContract(), [])
})

test('ambiguous Sheet execution is owned by automation instead of exploratory QA', () => {
  const result = routeRequest(
    'Chạy testcase LOGIN từ https://docs.google.com/spreadsheets/d/demo',
    loadRoutingContract(),
  )
  assert.deepEqual(result.route, [
    'integration-google-drive',
    'dynamic-web-automation',
    'integration-google-drive',
  ])
  assert.equal(result.mode, 'BUILD_AND_RUN')
})

test('UI-first exploratory routing does not require a business brief', () => {
  const result = routeRequest('Khám phá feature checkout trên web không có tài liệu')
  assert.deepEqual(result.route, ['dynamic-web-exploratory'])
  assert.equal(result.requires_brief, false)
})

test('negated secondary intents do not override the requested route', () => {
  const result = routeRequest('Open https://example.com and extract five titles; do not run a load test or create an issue')
  assert.deepEqual(result.route, ['dynamic-web-exploratory'])
  assert.equal(result.mode, 'FAST')
})

test('combined automation and static-requirements skill review keeps both owners', () => {
  const result = routeRequest('verify skill automation POM and static testing requirements for improvements')
  assert.deepEqual(result.route, ['dynamic-web-automation', 'static-requirements-analysis'])
  assert.equal(result.mode, 'DESIGN_HARDENING')
  assert.equal(result.requires_brief, false)
})

test('English and Vietnamese negation clauses are removed before matching', () => {
  const normalized = normalizeRoutingIntent('Review Figma spacing; exclude WCAG testing. Chỉ convert file.pptx, chưa phân tích requirement')
  assert.equal(normalized, 'Review Figma spacing; . Chỉ convert file.pptx,')
})
