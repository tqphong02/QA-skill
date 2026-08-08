#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(SCRIPT_DIR, "..");
let ROUTING_BASE_DIR = SKILL_DIR;
const SAFE_ENV_KEYS = new Set([
  "PLANE_BASE_URL",
  "PLANE_WORKSPACE_SLUG",
  "PLANE_EMAIL",
  "PLANE_PASSWORD",
  "PLANE_BROWSER_STATE_PATH",
  "PLANE_QA_RUN_ROOT",
  "PLANE_LOCAL_CONFIG_DIR",
]);

function readRoutingFile(envPath) {
  if (!fs.existsSync(envPath)) return {};

  const values = {};
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || !SAFE_ENV_KEYS.has(match[1])) continue;

    let value = match[2].trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

function readLocalRouting() {
  const localValues = readRoutingFile(path.join(SKILL_DIR, ".env"));
  const configuredDir = process.env.PLANE_LOCAL_CONFIG_DIR || localValues.PLANE_LOCAL_CONFIG_DIR;
  if (!configuredDir) return localValues;
  ROUTING_BASE_DIR = path.resolve(configuredDir);
  const sharedValues = readRoutingFile(path.join(ROUTING_BASE_DIR, ".env"));
  return { ...sharedValues, ...localValues };
}

const localRouting = readLocalRouting();

function setting(name, fallback = "") {
  const processValue = process.env[name];
  if (typeof processValue === "string" && processValue.length > 0) return processValue;
  return localRouting[name] || fallback;
}

function parseArgs(argv) {
  const options = {
    url: "",
    state: "",
    timeoutMs: 5 * 60 * 1000,
    headless: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--headless") {
      options.headless = true;
    } else if (arg === "--url" || arg === "--state" || arg === "--timeout-ms") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value`);
      index += 1;
      if (arg === "--url") options.url = value;
      if (arg === "--state") options.state = value;
      if (arg === "--timeout-ms") options.timeoutMs = Number(value);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 10_000) {
    throw new Error("--timeout-ms must be at least 10000");
  }
  return options;
}

function usage() {
  return [
    "Usage:",
    "  node scripts/browser-auth.mjs --url '<exact Plane URL>' [--state auth.json]",
    "",
    "The browser opens headed by default and uses PLANE_EMAIL plus PLANE_PASSWORD from the ignored local .env",
    "Credentials are never printed; complete MFA in the browser if required",
  ].join("\n");
}

function resolveTargetUrl(explicitUrl) {
  if (explicitUrl) return new URL(explicitUrl).toString();

  const baseUrl = setting("PLANE_BASE_URL");
  const workspace = setting("PLANE_WORKSPACE_SLUG");
  if (!baseUrl || !workspace) {
    throw new Error("Provide --url or set PLANE_BASE_URL and PLANE_WORKSPACE_SLUG");
  }
  return new URL(`${workspace}/`, `${baseUrl.replace(/\/$/, "")}/`).toString();
}

function resolveStatePath(explicitState) {
  const configured = explicitState || setting("PLANE_BROWSER_STATE_PATH", "auth.json");
  const statePath = path.isAbsolute(configured)
    ? configured
    : path.resolve(ROUTING_BASE_DIR, configured || "auth.json");

  const relativeToSkill = path.relative(SKILL_DIR, statePath);
  const isInsideSkill = relativeToSkill === "" || (!relativeToSkill.startsWith("..") && !path.isAbsolute(relativeToSkill));
  const filename = path.basename(statePath);
  const isIgnoredName =
    filename === "auth.json" ||
    filename.endsWith(".auth.json") ||
    filename.startsWith("storage-state") && filename.endsWith(".json") ||
    filename.endsWith(".storage-state.json") ||
    filename.startsWith("plane-browser-state") && filename.endsWith(".json");

  if (isInsideSkill && !isIgnoredName) {
    throw new Error("Browser state inside the skill folder must use an ignored auth or storage-state filename");
  }
  return statePath;
}

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  const runtimeRoot = setting("PLANE_QA_RUN_ROOT", path.resolve(SKILL_DIR, "../qa-run"));
  const candidates = [
    path.join(runtimeRoot, "node_modules", "playwright"),
    "playwright",
  ];

  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      // Try the next supported runtime location
    }
  }
  throw new Error("Playwright runtime not found; set PLANE_QA_RUN_ROOT to the qa-run directory");
}

async function hasVisible(page, selector) {
  const locator = page.locator(selector);
  const count = await locator.count();
  for (let index = 0; index < count; index += 1) {
    if (await locator.nth(index).isVisible().catch(() => false)) return true;
  }
  return false;
}

async function findEmailInput(page) {
  const selectors = [
    'input[type="email"]',
    'input[autocomplete="username"]',
    'input[name="email"]',
    'input[name="username"]',
  ];
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.count() && await locator.isVisible().catch(() => false)) return locator;
  }
  return null;
}

async function findPasswordInput(page) {
  const selectors = [
    'input[type="password"]',
    'input[autocomplete="current-password"]',
    'input[name="password"]',
  ];
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.count() && await locator.isVisible().catch(() => false)) return locator;
  }
  return null;
}

async function waitForPasswordInput(page, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const passwordInput = await findPasswordInput(page);
    if (passwordInput) return passwordInput;
    if (await hasAuthenticatedUser(page)) return null;
    await page.waitForTimeout(250);
  }
  return null;
}

async function clickSubmit(page, preferredName) {
  const namedButtons = page.getByRole("button", { name: preferredName });
  const namedCount = await namedButtons.count();
  for (let index = 0; index < namedCount; index += 1) {
    const button = namedButtons.nth(index);
    if (await button.isVisible().catch(() => false)) {
      await button.click();
      return true;
    }
  }

  const fallbackButtons = page.locator('button[type="submit"], input[type="submit"]');
  const fallbackCount = await fallbackButtons.count();
  for (let index = 0; index < fallbackCount; index += 1) {
    const button = fallbackButtons.nth(index);
    if (await button.isVisible().catch(() => false)) {
      await button.click();
      return true;
    }
  }
  return false;
}

async function isLoginPage(page) {
  let current;
  try {
    current = new URL(page.url());
  } catch {
    return true;
  }

  if (/\/(login|log-in|sign-in|signin|signup|register|auth)(\/|$)/i.test(current.pathname)) return true;
  if (current.searchParams.has("next_path") || current.searchParams.has("next")) return true;
  if (await hasVisible(page, 'input[type="password"]')) return true;
  return false;
}

async function hasAuthenticatedUser(page) {
  return page
    .evaluate(async () => {
      const response = await fetch("/api/users/me/", { credentials: "include" });
      return response.status === 200;
    })
    .catch(() => false);
}

async function waitForUserAuthentication(page, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await isLoginPage(page)) && (await hasAuthenticatedUser(page))) return;
    await page.waitForTimeout(1000);
  }
  throw new Error("Timed out while waiting for the user to complete Plane authentication");
}

async function automaticLogin(page, email, password, timeoutMs) {
  const emailInput = await findEmailInput(page);
  if (emailInput) {
    await emailInput.fill(email);
    const submittedEmail = await clickSubmit(page, /^(continue|next|sign in|log in|login)$/i);
    if (!submittedEmail) await emailInput.press("Enter");
  }

  const passwordInput = await waitForPasswordInput(page, Math.min(timeoutMs, 20_000));
  if (!passwordInput) return hasAuthenticatedUser(page);

  await passwordInput.fill(password);
  const submittedPassword = await clickSubmit(page, /^(continue|sign in|log in|login)$/i);
  if (!submittedPassword) await passwordInput.press("Enter");
  await waitForUserAuthentication(page, timeoutMs);
  return true;
}

async function saveState(context, statePath) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true, mode: 0o700 });
  await context.storageState({ path: statePath });
  try {
    fs.chmodSync(statePath, 0o600);
  } catch {
    // Best effort on filesystems without POSIX permissions
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const targetUrl = resolveTargetUrl(options.url);
  const statePath = resolveStatePath(options.state);
  const email = setting("PLANE_EMAIL");
  const password = setting("PLANE_PASSWORD");
  const { chromium } = loadPlaywright();
  const hasState = fs.existsSync(statePath);

  console.log(`PLANE_BROWSER_AUTH: opening ${new URL(targetUrl).origin}`);
  console.log(`PLANE_BROWSER_AUTH: storage state ${statePath}`);

  const browser = await chromium.launch({ headless: options.headless });
  try {
    const context = await browser.newContext(hasState ? { storageState: statePath } : {});
    const page = await context.newPage();
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    // Plane can redirect to /?next_path=... only after the client app boots
    await page.waitForLoadState("networkidle", { timeout: Math.min(options.timeoutMs, 15_000) }).catch(() => {});
    await page.waitForTimeout(500);

    if ((await isLoginPage(page)) || !(await hasAuthenticatedUser(page))) {
      if (email && password) {
        console.log("AUTH_LOGIN: submitting configured Plane credentials");
        const authenticated = await automaticLogin(page, email, password, options.timeoutMs);
        if (!authenticated) {
          console.log("AUTH_REQUIRED: complete the remaining Plane authentication step in the opened browser window");
          await waitForUserAuthentication(page, options.timeoutMs);
        }
      } else {
        const emailInput = await findEmailInput(page);
        if (emailInput && email) await emailInput.fill(email);
        console.log("AUTH_REQUIRED: PLANE_EMAIL or PLANE_PASSWORD is missing from the ignored local .env");
        await waitForUserAuthentication(page, options.timeoutMs);
      }
    }

    await saveState(context, statePath);
    console.log("AUTH_OK: authenticated browser storage state saved");
    await context.close();
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`AUTH_FAILED: ${error instanceof Error ? error.message : "unexpected browser authentication error"}`);
  process.exitCode = 1;
});
