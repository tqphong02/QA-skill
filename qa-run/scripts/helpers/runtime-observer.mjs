#!/usr/bin/env node
/**
 * runtime-observer.mjs — Real-Time Streaming Observer
 *
 * Lắng nghe và ghi nhận các sự kiện live trong suốt quá trình test:
 *   - Network requests & responses (HTTP status >= 400)
 *   - Browser console errors & warnings
 *   - Uncaught page exceptions & crash events
 *   - Failed API contracts
 *
 * Ghi liên tục vào evidence/.runtime-events.json để đảm bảo không mất sự kiện khi test dở dang.
 *
 * Usage:
 *   node runtime-observer.mjs attach <PAGE_OR_CONTEXT_ID>
 *   node runtime-observer.mjs dump
 */

import fs from 'node:fs';
import path from 'node:path';

const DATA = process.env.QA_DATA_DIR || process.cwd();
const EVID = path.join(DATA, 'evidence');
const EVENTS_FILE = path.join(EVID, '.runtime-events.json');

fs.mkdirSync(EVID, { recursive: true });

const SENSITIVE_KEY = /authorization|cookie|token|password|passwd|secret|api[-_]?key|session|email|phone|address/i;

function redactText(value) {
  return String(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer <redacted>')
    .replace(/([?&][^=\s]+)=([^&#\s]+)/g, '$1=<redacted>')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '<redacted-email>')
    .slice(0, 1000);
}

function sanitizeUrl(value) {
  try {
    const url = new URL(value);
    for (const key of url.searchParams.keys()) {
      url.searchParams.set(key, '<redacted>');
    }
    return url.toString().slice(0, 300);
  } catch {
    return redactText(value).slice(0, 300);
  }
}

function sanitizeJson(value, key = '') {
  if (SENSITIVE_KEY.test(key)) return '<redacted>';
  if (Array.isArray(value)) return value.slice(0, 20).map(item => sanitizeJson(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).slice(0, 50).map(([childKey, childValue]) => [
        childKey,
        sanitizeJson(childValue, childKey),
      ]),
    );
  }
  if (typeof value === 'string') return redactText(value);
  return value;
}

async function responseBodyPreview(response) {
  let contentType = '';
  try {
    contentType = response.headers()['content-type'] || '';
  } catch { /* optional metadata */ }
  if (!/json|graphql|text|xml|javascript/i.test(contentType)) return '';

  try {
    const text = await response.text();
    if (!text) return '';
    try {
      return JSON.stringify(sanitizeJson(JSON.parse(text))).slice(0, 1000);
    } catch {
      return redactText(text);
    }
  } catch {
    return '';
  }
}

function appendEvent(eventsFile, entry) {
  let existing = [];
  if (fs.existsSync(eventsFile)) {
    try {
      existing = JSON.parse(fs.readFileSync(eventsFile, 'utf8'));
      if (!Array.isArray(existing)) existing = [];
    } catch {
      existing = [];
    }
  }
  existing.push(entry);
  fs.mkdirSync(path.dirname(eventsFile), { recursive: true });
  fs.writeFileSync(eventsFile, JSON.stringify(existing.slice(-500), null, 2), 'utf8');
}

function compactEvent(event) {
  const payload = event?.payload || {};
  const compact = value => value === undefined || value === null
    ? undefined
    : String(value).replace(/\s+/g, ' ').trim().slice(0, 360);
  return {
    type: event?.type || 'UNKNOWN',
    timestamp: event?.timestamp || null,
    method: compact(payload.method),
    url: compact(payload.url),
    status: payload.status,
    error: compact(payload.error || payload.message || payload.response_error || payload.bodyPreview),
    console: compact(payload.text),
  };
}

export function summarizeRuntimeEvents(events, { actionId = null, maxPerType = 8 } = {}) {
  const grouped = {
    HTTP_FAILURE: [],
    REQUEST_FAILED: [],
    GRAPHQL_ERROR: [],
    CONSOLE_ERROR: [],
    PAGE_CRASH_ERROR: [],
    WEBSOCKET_ERROR: [],
  };
  for (const event of events || []) {
    if (!grouped[event?.type]) continue;
    if (grouped[event.type].length < maxPerType) {
      grouped[event.type].push(compactEvent(event));
    }
  }
  return {
    action_id: actionId,
    event_count: (events || []).length,
    counts: Object.fromEntries(Object.entries(grouped).map(([type, items]) => [type, items.length])),
    failures: grouped.HTTP_FAILURE,
    request_failures: grouped.REQUEST_FAILED,
    graphql_errors: grouped.GRAPHQL_ERROR,
    console_errors: grouped.CONSOLE_ERROR,
    page_errors: grouped.PAGE_CRASH_ERROR,
    websocket_errors: grouped.WEBSOCKET_ERROR,
  };
}

export function createRuntimeObserver(page, { eventsFile = EVENTS_FILE } = {}) {
  const events = [];

  function logEvent(type, payload) {
    const entry = {
      timestamp: new Date().toISOString(),
      type,
      payload,
    };
    events.push(entry);
    try {
      appendEvent(eventsFile, entry);
    } catch { /* ignore async write errors */ }
  }

  if (page) {
    page.on('console', msg => {
      if (['error', 'warning'].includes(msg.type())) {
        logEvent('CONSOLE_ERROR', { text: redactText(msg.text()).slice(0, 300), type: msg.type() });
      }
    });

    page.on('pageerror', err => {
      logEvent('PAGE_CRASH_ERROR', { message: redactText(err).slice(0, 300) });
    });

    page.on('requestfailed', request => {
      const failure = request.failure?.();
      logEvent('REQUEST_FAILED', {
        method: request.method?.() || 'UNKNOWN',
        url: sanitizeUrl(request.url?.() || ''),
        error: redactText(failure?.errorText || 'unknown').slice(0, 300),
      });
    });

    page.on('response', async resp => {
      const status = resp.status();
      const url = resp.url();
      const isGraphql = /graphql/i.test(url);
      const shouldInspect = status >= 400 || isGraphql;
      const bodyPreview = shouldInspect ? await responseBodyPreview(resp) : '';

      if (status >= 400) {
        logEvent('HTTP_FAILURE', {
          method: resp.request?.().method?.() || 'UNKNOWN',
          url: sanitizeUrl(url),
          status,
          statusText: resp.statusText(),
          bodyPreview,
        });
      }

      if (isGraphql && bodyPreview) {
        try {
          const parsed = JSON.parse(bodyPreview);
          if (Array.isArray(parsed.errors) && parsed.errors.length > 0) {
            logEvent('GRAPHQL_ERROR', {
              method: resp.request?.().method?.() || 'UNKNOWN',
              url: sanitizeUrl(url),
              status,
              errors: parsed.errors.slice(0, 10),
              partialData: parsed.data !== undefined && parsed.data !== null,
            });
          }
        } catch { /* non-JSON GraphQL transport */ }
      }
    });

    page.on('websocket', socket => {
      socket.on?.('socketerror', error => {
        logEvent('WEBSOCKET_ERROR', {
          url: sanitizeUrl(socket.url?.() || ''),
          error: redactText(error).slice(0, 300),
        });
      });
    });
  }

  return {
    getEvents: () => events,
    getCursor: () => events.length,
    getEventsSince: cursor => events.slice(Math.max(0, Number(cursor) || 0)),
    summarizeSince: (cursor = 0, metadata = {}) => summarizeRuntimeEvents(
      events.slice(Math.max(0, Number(cursor) || 0)),
      metadata,
    ),
    clearEvents: () => { events.length = 0; },
  };
}

const args = process.argv.slice(2);
if (args[0] === 'dump') {
  if (fs.existsSync(EVENTS_FILE)) {
    const data = fs.readFileSync(EVENTS_FILE, 'utf8');
    console.log(data);
  } else {
    console.log('[]');
  }
}
