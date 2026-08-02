// Adaptive browser readiness primitives shared by qa-run helpers.
//
// The tracker observes only request lifecycles. It never replaces the
// required same-session network/console/page-error evidence layer.

const TRACKED_RESOURCE_TYPES = new Set(['document', 'xhr', 'fetch', 'preflight']);

function positiveInt(value, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function requestType(request) {
  try { return request?.resourceType?.() || ''; } catch { return ''; }
}

function trackRequest(request) {
  return TRACKED_RESOURCE_TYPES.has(requestType(request));
}

/**
 * Install one same-page request tracker. WebSocket/EventSource connections
 * are intentionally excluded because they may remain open while the UI is
 * already ready; their lifecycle is still captured by the normal observer.
 */
export function installNetworkTracker(page) {
  if (!page || typeof page.on !== 'function') return null;
  if (page.__qaNetworkTracker) return page.__qaNetworkTracker;

  const pending = new Set();
  const onRequest = request => { if (trackRequest(request)) pending.add(request); };
  const onFinished = request => { pending.delete(request); };

  page.on('request', onRequest);
  page.on('requestfinished', onFinished);
  page.on('requestfailed', onFinished);

  const tracker = {
    pending,
    pendingCount: () => pending.size,
    dispose: () => {
      page.off?.('request', onRequest);
      page.off?.('requestfinished', onFinished);
      page.off?.('requestfailed', onFinished);
      pending.clear();
    },
  };
  page.__qaNetworkTracker = tracker;
  return tracker;
}

/**
 * Wait until tracked requests are quiet for a short bounded window.
 * Polling is event-state based; there is no fixed multi-second sleep.
 */
export async function waitForNetworkQuiet(page, {
  timeout = positiveInt(process.env.QA_READY_TIMEOUT_MS, 12000),
  quietMs = positiveInt(process.env.QA_READY_QUIET_MS, 120),
  pollMs = positiveInt(process.env.QA_READY_POLL_MS, 40),
} = {}) {
  const tracker = page?.__qaNetworkTracker;
  if (!tracker) return { ready: true, pending: 0, elapsedMs: 0, tracked: false };

  const startedAt = Date.now();
  let quietSince = null;
  while (Date.now() - startedAt <= timeout) {
    const pending = tracker.pendingCount();
    if (pending === 0) {
      quietSince ??= Date.now();
      if (Date.now() - quietSince >= quietMs) {
        return { ready: true, pending: 0, elapsedMs: Date.now() - startedAt, tracked: true };
      }
    } else {
      quietSince = null;
    }
    await new Promise(resolve => setTimeout(resolve, Math.max(10, pollMs)));
  }

  return {
    ready: false,
    pending: tracker.pendingCount(),
    elapsedMs: Date.now() - startedAt,
    tracked: true,
  };
}

/**
 * Wait for document readiness and same-page network quietness. A timeout is
 * a bounded observation result, not a failure by itself; callers must keep
 * their existing visual/network/error assertions and evidence gates.
 */
export async function waitForUiReady(page, options = {}) {
  const timeout = positiveInt(options.timeout, positiveInt(process.env.QA_READY_TIMEOUT_MS, 12000));
  const startedAt = Date.now();
  if (typeof page?.waitForLoadState === 'function') {
    try { await page.waitForLoadState('domcontentloaded', { timeout }); } catch { /* bounded */ }
  }
  const remainingTimeout = Math.max(0, timeout - (Date.now() - startedAt));
  const network = await waitForNetworkQuiet(page, { ...options, timeout: remainingTimeout });
  return {
    ready: network.ready,
    elapsedMs: network.elapsedMs,
    pending: network.pending,
    tracked: network.tracked,
  };
}
