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

export function createRuntimeObserver(page) {
  const events = [];

  function logEvent(type, payload) {
    const entry = {
      timestamp: new Date().toISOString(),
      type,
      payload,
    };
    events.push(entry);
    try {
      let existing = [];
      if (fs.existsSync(EVENTS_FILE)) {
        existing = JSON.parse(fs.readFileSync(EVENTS_FILE, 'utf8'));
      }
      existing.push(entry);
      fs.writeFileSync(EVENTS_FILE, JSON.stringify(existing.slice(-500), null, 2), 'utf8');
    } catch { /* ignore async write errors */ }
  }

  if (page) {
    page.on('console', msg => {
      if (['error', 'warning'].includes(msg.type())) {
        logEvent('CONSOLE_ERROR', { text: msg.text().slice(0, 300), type: msg.type() });
      }
    });

    page.on('pageerror', err => {
      logEvent('PAGE_CRASH_ERROR', { message: String(err).slice(0, 300) });
    });

    page.on('response', resp => {
      if (resp.status() >= 400) {
        logEvent('HTTP_FAILURE', {
          url: resp.url().slice(0, 150),
          status: resp.status(),
          statusText: resp.statusText(),
        });
      }
    });
  }

  return {
    getEvents: () => events,
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
