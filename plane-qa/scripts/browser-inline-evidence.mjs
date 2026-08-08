#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(SCRIPT_DIR, "..");
const DESCRIPTION_TOKEN = "{{PLANE_DESCRIPTION_IMAGE_%d}}";
const COMMENT_TOKEN = "{{PLANE_COMMENT_IMAGE_%d}}";
const IMAGE_COMPONENT_RE = /<image-component\b[^>]*\bsrc="([^"]+)"[^>]*><\/image-component>/gi;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MIME_BY_EXTENSION = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

function parseEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return {};
  const values = {};
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
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

function loadSettings() {
  const localPath = path.join(SKILL_DIR, ".env");
  const localValues = parseEnvFile(localPath);
  const configuredDir = process.env.PLANE_LOCAL_CONFIG_DIR || localValues.PLANE_LOCAL_CONFIG_DIR;
  const sharedPath = configuredDir ? path.resolve(configuredDir, ".env") : "";
  const sharedValues = sharedPath ? parseEnvFile(sharedPath) : {};
  const envPath = fs.existsSync(sharedPath) ? sharedPath : (fs.existsSync(localPath) ? localPath : "");
  return { values: { ...sharedValues, ...localValues }, envPath };
}

const settings = loadSettings();

function setting(name, fallback = "") {
  return process.env[name] || settings.values[name] || fallback;
}

function parseArgs(argv) {
  const options = { input: "", apply: false, selfTest: false, headless: true, timeoutMs: 120_000 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--apply") options.apply = true;
    else if (arg === "--self-test") options.selfTest = true;
    else if (arg === "--headed") options.headless = false;
    else if (arg === "--input" || arg === "--timeout-ms") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value`);
      index += 1;
      if (arg === "--input") options.input = value;
      else options.timeoutMs = Number(value);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 10_000) {
    throw new Error("--timeout-ms must be at least 10000");
  }
  return options;
}

function usage() {
  return [
    "Usage:",
    "  node scripts/browser-inline-evidence.mjs --input request.json",
    "  node scripts/browser-inline-evidence.mjs --input request.json --apply",
    "  node scripts/browser-inline-evidence.mjs --self-test",
    "",
    "The default mode is a local dry run",
    "--apply stages images through Plane rich-text browser paste, then writes clean HTML and verifies Attachments 0",
  ].join("\n");
}

function resolveInputPath(input) {
  if (!input) throw new Error("--input is required unless --self-test is used");
  return path.resolve(process.cwd(), input);
}

function readRequest(inputPath) {
  const value = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Input must be a JSON object");
  }
  return value;
}

function asStringArray(value, field) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error(`${field} must be an array of non-empty paths`);
  }
  return value;
}

function resolveImages(request, inputPath, field) {
  const baseDir = path.dirname(inputPath);
  return asStringArray(request[field], field).map((item) =>
    path.isAbsolute(item) ? item : path.resolve(baseDir, item),
  );
}

function token(pattern, index) {
  return pattern.replace("%d", String(index + 1));
}

function countLiteral(text, value) {
  return text.split(value).length - 1;
}

function validateTemplate(html, images, pattern, field) {
  if (html === undefined) {
    if (images.length) throw new Error(`${field} is required when its image list is not empty`);
    return;
  }
  if (typeof html !== "string" || !html.trim()) throw new Error(`${field} must be non-empty HTML`);
  for (let index = 0; index < images.length; index += 1) {
    const placeholder = token(pattern, index);
    if (countLiteral(html, placeholder) !== 1) {
      throw new Error(`${field} must contain ${placeholder} exactly once`);
    }
  }
  if (/\{\{PLANE_(?:DESCRIPTION|COMMENT)_IMAGE_\d+\}\}/.test(
    images.reduce((value, _item, index) => value.replace(token(pattern, index), ""), html),
  )) {
    throw new Error(`${field} contains an undeclared Plane image placeholder`);
  }
}

function countImageComponents(html) {
  return [...String(html || "").matchAll(IMAGE_COMPONENT_RE)].length;
}

function validateBugLabels(html) {
  const labels = [
    "OS:", "Browser:", "Environment:", "URL:", "Test account:", "Test data:",
    "Precondition:", "Steps:", "Expected:", "Actual:", "Evidence:",
  ];
  for (const label of labels) {
    if (countLiteral(html, label) !== 1) throw new Error(`Bug description must contain ${label} exactly once`);
  }
}

function validateComment(request) {
  if (request.comment_html === undefined) return;
  const verdict = request.verdict;
  if (!verdict) return;
  if (!["PASS", "FAILED", "BLOCKED"].includes(verdict)) {
    throw new Error("verdict must be PASS, FAILED, or BLOCKED");
  }
  if (countLiteral(request.comment_html, `Result:</strong> ${verdict}`) !== 1 &&
      countLiteral(request.comment_html, `Result: ${verdict}`) !== 1) {
    throw new Error(`comment_html must contain Result: ${verdict}`);
  }
}

function validateRequest(request, inputPath, checkFiles = true) {
  if (typeof request.ticket_url !== "string" || !request.ticket_url.trim()) {
    throw new Error("ticket_url is required");
  }
  const target = new URL(request.ticket_url);
  const parts = target.pathname.split("/").filter(Boolean);
  const browseIndex = parts.indexOf("browse");
  if (parts.length < 3 || browseIndex < 1 || !parts[browseIndex + 1]) {
    throw new Error("ticket_url must contain /<workspace>/browse/<TICKET-REF>/");
  }
  const descriptionImages = resolveImages(request, inputPath, "description_images");
  const commentImages = resolveImages(request, inputPath, "comment_images");
  validateTemplate(request.description_html, descriptionImages, DESCRIPTION_TOKEN, "description_html");
  validateTemplate(request.comment_html, commentImages, COMMENT_TOKEN, "comment_html");
  if (request.content_format === "bug") validateBugLabels(request.description_html || "");
  validateComment(request);
  if (request.expected_attachment_count !== undefined && request.expected_attachment_count !== 0) {
    throw new Error("browser-inline workflow requires expected_attachment_count=0");
  }
  if (checkFiles) {
    for (const imagePath of [...descriptionImages, ...commentImages]) {
      if (!fs.statSync(imagePath, { throwIfNoEntry: false })?.isFile()) {
        throw new Error(`Evidence image does not exist: ${imagePath}`);
      }
      if (!MIME_BY_EXTENSION[path.extname(imagePath).toLowerCase()]) {
        throw new Error(`Unsupported evidence image type: ${imagePath}`);
      }
    }
  }
  return {
    origin: target.origin,
    workspace: decodeURIComponent(parts[0]),
    ticketRef: decodeURIComponent(parts[browseIndex + 1]),
    descriptionImages,
    commentImages,
  };
}

function materialize(html, assets, pattern) {
  let value = html;
  for (let index = 0; index < assets.length; index += 1) {
    value = value.replace(token(pattern, index), assets[index].component);
  }
  if (/\{\{PLANE_(?:DESCRIPTION|COMMENT)_IMAGE_\d+\}\}/.test(value)) {
    throw new Error("Final HTML still contains a Plane image placeholder");
  }
  return value;
}

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  const runtimeRoot = setting("PLANE_QA_RUN_ROOT", path.resolve(SKILL_DIR, "../qa-run"));
  for (const candidate of [path.join(runtimeRoot, "node_modules", "playwright"), "playwright"]) {
    try {
      return require(candidate);
    } catch {
      // Try the next configured runtime
    }
  }
  throw new Error("Playwright runtime not found; set PLANE_QA_RUN_ROOT to the qa-run directory");
}

function resolveStatePath() {
  const configured = setting("PLANE_BROWSER_STATE_PATH", "auth.json");
  if (path.isAbsolute(configured)) return configured;
  const baseDir = settings.envPath ? path.dirname(settings.envPath) : SKILL_DIR;
  return path.resolve(baseDir, configured);
}

async function browserFetch(page, endpoint, method = "GET", body) {
  const result = await page.evaluate(async ({ endpoint: url, method: requestMethod, body: requestBody }) => {
    const response = await fetch(url, {
      method: requestMethod,
      credentials: "include",
      headers: requestBody === undefined ? { Accept: "application/json" } : {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: requestBody === undefined ? undefined : JSON.stringify(requestBody),
    });
    const text = await response.text();
    return { ok: response.ok, status: response.status, text };
  }, { endpoint, method, body });
  let data = null;
  if (result.text) {
    try { data = JSON.parse(result.text); } catch { data = result.text; }
  }
  if (!result.ok) throw new Error(`${method} ${endpoint} failed with HTTP ${result.status}`);
  return data;
}

function resultList(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.results)) return value.results;
  return [];
}

function resolveProjectId(issue) {
  const candidates = [
    issue?.project_id, issue?.project?.id, issue?.project_detail?.id,
    typeof issue?.project === "string" ? issue.project : "",
  ];
  return candidates.find((value) => UUID_RE.test(String(value || ""))) || "";
}

function resolveStateName(issue) {
  return issue?.state_detail?.name || issue?.state?.name || issue?.state_name || "";
}

function resolveStateId(issue) {
  const value = issue?.state_detail?.id || issue?.state?.id || issue?.state;
  return UUID_RE.test(String(value || "")) ? value : "";
}

async function openCommentEditor(page) {
  const triggers = [
    /add comment/i, /write a comment/i, /leave a comment/i, /comment/i,
  ];
  for (const pattern of triggers) {
    const candidates = page.getByText(pattern, { exact: false });
    for (let index = (await candidates.count()) - 1; index >= 0; index -= 1) {
      const candidate = candidates.nth(index);
      if (await candidate.isVisible().catch(() => false)) {
        await candidate.click().catch(() => {});
        await page.waitForTimeout(250);
        break;
      }
    }
  }

  const editors = page.locator('[contenteditable="true"]');
  const visible = [];
  for (let index = 0; index < await editors.count(); index += 1) {
    const editor = editors.nth(index);
    if (!await editor.isVisible().catch(() => false)) continue;
    const metadata = await editor.evaluate((element) => {
      const parentText = element.closest("form, [role=dialog], section, div")?.textContent || "";
      return [
        element.getAttribute("aria-label") || "",
        element.getAttribute("data-placeholder") || "",
        element.getAttribute("placeholder") || "",
        parentText.slice(0, 300),
      ].join(" ");
    });
    visible.push({ editor, score: /comment|bình luận/i.test(metadata) ? 10 : 0, index });
  }
  if (!visible.length) throw new Error("Plane Comment rich-text editor was not found");
  visible.sort((left, right) => left.score - right.score || left.index - right.index);
  const editor = visible.at(-1).editor;
  await editor.scrollIntoViewIfNeeded();
  await editor.click();
  return editor;
}

function extractAssetId(value) {
  const queue = [value];
  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== "object") continue;
    for (const key of ["asset_id", "id"]) {
      if (UUID_RE.test(String(current[key] || ""))) return current[key];
    }
    for (const nested of Object.values(current)) {
      if (nested && typeof nested === "object") queue.push(nested);
    }
  }
  return "";
}

async function imageDimensions(page, bytes, mime) {
  return page.evaluate(async ({ base64, mimeType }) => {
    const binary = atob(base64);
    const data = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([data], { type: mimeType }));
    const result = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return result;
  }, { base64: bytes.toString("base64"), mimeType: mime });
}

async function pasteAndStageAsset(page, editor, imagePath, target, timeoutMs) {
  const bytes = fs.readFileSync(imagePath);
  const mime = MIME_BY_EXTENSION[path.extname(imagePath).toLowerCase()];
  const dimensions = await imageDimensions(page, bytes, mime);
  const beforeImages = await editor.locator("img").count();
  const assetResponse = page.waitForResponse((response) => {
    const request = response.request();
    const pathname = new URL(response.url()).pathname;
    return request.method() === "POST" &&
      pathname === `/api/assets/v2/workspaces/${target.workspace}/projects/${target.projectId}/`;
  }, { timeout: timeoutMs });

  await editor.evaluate((element, payload) => {
    const binary = atob(payload.base64);
    const bytesValue = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const file = new File([bytesValue], payload.name, { type: payload.mime });
    const clipboard = new DataTransfer();
    clipboard.items.add(file);
    element.dispatchEvent(new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: clipboard,
    }));
  }, { base64: bytes.toString("base64"), name: path.basename(imagePath), mime });

  const response = await assetResponse;
  const responseBody = await response.json().catch(() => null);
  const assetId = extractAssetId(responseBody);
  if (!assetId) throw new Error("Plane editor asset response did not contain an asset ID");

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await editor.locator("img").count() > beforeImages) break;
    await page.waitForTimeout(200);
  }
  if (await editor.locator("img").count() <= beforeImages) {
    throw new Error(`Pasted image did not render in the editor: ${path.basename(imagePath)}`);
  }
  await page.waitForLoadState("networkidle", { timeout: Math.min(timeoutMs, 10_000) }).catch(() => {});

  const displayWidth = Math.min(dimensions.width, 720);
  const displayHeight = Math.max(1, Math.round(dimensions.height * displayWidth / dimensions.width));
  const nodeId = crypto.randomUUID();
  const component = `<image-component data-id="${nodeId}" src="${assetId}" id="${nodeId}" width="${displayWidth}px" height="${displayHeight}px" aspectratio="${dimensions.width / dimensions.height}" alignment="left" status="uploaded"></image-component>`;
  return { asset_id: assetId, component, source: imagePath };
}

async function resolveNamedState(page, target, stateName) {
  const payload = await browserFetch(page, `/api/workspaces/${target.workspace}/projects/${target.projectId}/states/`);
  const state = resultList(payload).find((item) => item?.name === stateName);
  if (!state?.id) throw new Error(`Exact Plane state was not found: ${stateName}`);
  return state.id;
}

async function readAttachmentCount(page) {
  const text = await page.locator("body").innerText();
  const match = text.match(/Attachments\s+(\d+)/i);
  if (match) return Number(match[1]);
  const heading = page.getByText(/^Attachments$/i);
  for (let index = 0; index < await heading.count(); index += 1) {
    if (await heading.nth(index).isVisible().catch(() => false)) return null;
  }
  return 0;
}

async function verifyRenderedAssets(page, assetIds, timeoutMs) {
  const missing = [];
  for (const assetId of assetIds) {
    const locator = page.locator(`img[src*="${assetId}"], image-component[src="${assetId}"]`);
    const deadline = Date.now() + Math.min(timeoutMs, 20_000);
    let visible = false;
    while (Date.now() < deadline) {
      for (let index = 0; index < await locator.count(); index += 1) {
        if (await locator.nth(index).isVisible().catch(() => false)) {
          visible = true;
          break;
        }
      }
      if (visible) break;
      await page.mouse.wheel(0, 900).catch(() => {});
      await page.waitForTimeout(250);
    }
    if (!visible) missing.push(assetId);
  }
  return missing;
}

async function applyRequest(request, inputPath, options) {
  const target = validateRequest(request, inputPath, true);
  const statePath = resolveStatePath();
  if (!fs.existsSync(statePath)) {
    throw new Error(`BLOCKED (AUTH_REQUIRED): browser state does not exist at ${statePath}`);
  }
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ headless: options.headless });
  const context = await browser.newContext({ storageState: statePath });
  const page = await context.newPage();
  const prohibitedRequests = [];
  let observeImageFlow = false;
  page.on("request", (requestValue) => {
    if (observeImageFlow && requestValue.url().includes("/issue-attachments/")) {
      prohibitedRequests.push({ method: requestValue.method(), url: requestValue.url() });
    }
  });

  const rollback = { issue: null, createdCommentId: "", updatedComment: null };
  try {
    await page.goto(request.ticket_url, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    const authenticated = await page.evaluate(async () => (await fetch("/api/users/me/", { credentials: "include" })).status === 200);
    if (!authenticated) throw new Error("BLOCKED (AUTH_REQUIRED): saved browser session is not authenticated");

    const issueEndpoint = `/api/workspaces/${target.workspace}/work-items/${target.ticketRef}/`;
    const issue = await browserFetch(page, issueEndpoint);
    target.issueId = issue?.id;
    target.projectId = resolveProjectId(issue);
    if (!UUID_RE.test(String(target.issueId || "")) || !target.projectId) {
      throw new Error("Plane ticket response did not resolve exact issue and project IDs");
    }
    const commentEndpoint = `/api/workspaces/${target.workspace}/projects/${target.projectId}/issues/${target.issueId}/comments/`;
    const commentsBeforePayload = await browserFetch(page, commentEndpoint);
    const commentsBefore = resultList(commentsBeforePayload);
    const attachmentBefore = await readAttachmentCount(page);
    if (attachmentBefore !== 0) {
      throw new Error(`Inline evidence requires Attachments 0 before mutation, found ${attachmentBefore ?? "unknown"}`);
    }

    rollback.issue = {
      name: issue?.name,
      description_html: issue?.description_html || "",
      state: resolveStateId(issue),
    };
    if (request.comment_id) {
      const existing = commentsBefore.find((item) => item?.id === request.comment_id);
      if (!existing) throw new Error(`Comment was not found: ${request.comment_id}`);
      rollback.updatedComment = { id: existing.id, comment_html: existing.comment_html || "" };
    }

    const editor = [...target.descriptionImages, ...target.commentImages].length
      ? await openCommentEditor(page)
      : null;
    observeImageFlow = true;
    const descriptionAssets = [];
    for (const imagePath of target.descriptionImages) {
      descriptionAssets.push(await pasteAndStageAsset(page, editor, imagePath, target, options.timeoutMs));
    }
    const commentAssets = [];
    for (const imagePath of target.commentImages) {
      commentAssets.push(await pasteAndStageAsset(page, editor, imagePath, target, options.timeoutMs));
    }
    observeImageFlow = false;
    if (prohibitedRequests.length) throw new Error("FAILED: /issue-attachments/ was called during inline image staging");

    const finalDescription = request.description_html === undefined
      ? undefined
      : materialize(request.description_html, descriptionAssets, DESCRIPTION_TOKEN);
    const finalComment = request.comment_html === undefined
      ? undefined
      : materialize(request.comment_html, commentAssets, COMMENT_TOKEN);

    const issuePatch = {};
    if (request.title !== undefined) issuePatch.name = request.title;
    if (finalDescription !== undefined) issuePatch.description_html = finalDescription;
    if (Object.keys(issuePatch).length) {
      await browserFetch(page, `/api/workspaces/${target.workspace}/projects/${target.projectId}/issues/${target.issueId}/`, "PATCH", issuePatch);
    }

    let commentId = request.comment_id || "";
    if (finalComment !== undefined) {
      if (commentId) {
        await browserFetch(page, `${commentEndpoint}${commentId}/`, "PATCH", { comment_html: finalComment });
      } else {
        const created = await browserFetch(page, commentEndpoint, "POST", { comment_html: finalComment });
        commentId = created?.id || "";
        if (!commentId) throw new Error("Plane did not return the created comment ID");
        rollback.createdCommentId = commentId;
      }
    }

    const desiredState = request.state || ({ PASS: "Done", FAILED: "In Progress", BLOCKED: "" }[request.verdict] || "");
    if (desiredState) {
      const stateId = await resolveNamedState(page, target, desiredState);
      await browserFetch(page, `/api/workspaces/${target.workspace}/projects/${target.projectId}/issues/${target.issueId}/`, "PATCH", { state: stateId });
    }

    await page.reload({ waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    const issueAfter = await browserFetch(page, issueEndpoint);
    const commentsAfter = resultList(await browserFetch(page, commentEndpoint));
    const commentAfter = commentId ? commentsAfter.find((item) => item?.id === commentId) : null;
    const attachmentAfter = await readAttachmentCount(page);
    const allAssets = [...descriptionAssets, ...commentAssets];
    const missingRenderedAssets = await verifyRenderedAssets(page, allAssets.map((item) => item.asset_id), options.timeoutMs);

    const verification = {
      ticket_ref: target.ticketRef,
      description_image_nodes: countImageComponents(issueAfter?.description_html),
      expected_description_image_nodes: descriptionAssets.length,
      comment_id: commentId || null,
      comment_image_nodes: countImageComponents(commentAfter?.comment_html),
      expected_comment_image_nodes: commentAssets.length,
      attachments_count: attachmentAfter,
      issue_attachment_requests: prohibitedRequests,
      missing_rendered_asset_ids: missingRenderedAssets,
      state: resolveStateName(issueAfter),
      expected_state: desiredState || resolveStateName(issue),
      placeholders_absent: !/\{\{PLANE_(?:DESCRIPTION|COMMENT)_IMAGE_\d+\}\}/.test(
        `${issueAfter?.description_html || ""}${commentAfter?.comment_html || ""}`,
      ),
    };
    const failures = [];
    if (finalDescription !== undefined && verification.description_image_nodes !== descriptionAssets.length) failures.push("description image count");
    if (finalComment !== undefined && verification.comment_image_nodes !== commentAssets.length) failures.push("comment image count");
    if (attachmentAfter !== 0) failures.push("Attachments 0");
    if (prohibitedRequests.length) failures.push("prohibited route");
    if (missingRenderedAssets.length) failures.push("rendered preview");
    if (!verification.placeholders_absent) failures.push("placeholder cleanup");
    if (desiredState && verification.state !== desiredState) failures.push("state");
    if (failures.length) throw new Error(`Read-back verification failed: ${failures.join(", ")}`);

    rollback.issue = null;
    rollback.createdCommentId = "";
    rollback.updatedComment = null;
    return {
      verdict: "PASS",
      target: { workspace: target.workspace, ticket_ref: target.ticketRef, project_id: target.projectId, issue_id: target.issueId },
      pre_state: { attachments_count: attachmentBefore, comment_count: commentsBefore.length, state: resolveStateName(issue) },
      verification,
    };
  } catch (error) {
    try {
      if (rollback.createdCommentId) {
        await browserFetch(page, `/api/workspaces/${target.workspace}/projects/${target.projectId}/issues/${target.issueId}/comments/${rollback.createdCommentId}/`, "DELETE");
      }
      if (rollback.updatedComment) {
        await browserFetch(page, `/api/workspaces/${target.workspace}/projects/${target.projectId}/issues/${target.issueId}/comments/${rollback.updatedComment.id}/`, "PATCH", { comment_html: rollback.updatedComment.comment_html });
      }
      if (rollback.issue) {
        await browserFetch(page, `/api/workspaces/${target.workspace}/projects/${target.projectId}/issues/${target.issueId}/`, "PATCH", rollback.issue);
      }
    } catch {
      // Preserve the original error; caller must inspect the ticket when rollback cannot be confirmed
    }
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}

function selfTest() {
  const component = '<image-component data-id="11111111-1111-4111-8111-111111111111" src="22222222-2222-4222-8222-222222222222" id="11111111-1111-4111-8111-111111111111" width="100px" height="50px" aspectratio="2" alignment="left" status="uploaded"></image-component>';
  const rendered = materialize(`<p>Evidence:</p>${token(DESCRIPTION_TOKEN, 0)}`, [{ component }], DESCRIPTION_TOKEN);
  if (countImageComponents(rendered) !== 1 || rendered.includes("{{PLANE_")) {
    throw new Error("Self-test failed for image materialization");
  }
  return { verdict: "PASS", checks: ["placeholder replacement", "image-component count"] };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  if (options.selfTest) {
    console.log(JSON.stringify(selfTest(), null, 2));
    return;
  }
  const inputPath = resolveInputPath(options.input);
  const request = readRequest(inputPath);
  const target = validateRequest(request, inputPath, true);
  if (!options.apply) {
    console.log(JSON.stringify({
      verdict: "DRY_RUN_OK",
      target: { origin: target.origin, workspace: target.workspace, ticket_ref: target.ticketRef },
      write_action: "none",
      description_images: target.descriptionImages.length,
      comment_images: target.commentImages.length,
      expected_attachment_count: 0,
    }, null, 2));
    return;
  }
  console.log(JSON.stringify(await applyRequest(request, inputPath, options), null, 2));
}

main().catch((error) => {
  console.error(`PLANE_INLINE_EVIDENCE_FAILED: ${error instanceof Error ? error.message : "unexpected error"}`);
  process.exitCode = 1;
});
