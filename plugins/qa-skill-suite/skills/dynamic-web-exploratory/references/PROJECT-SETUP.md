# QA Run — Project Setup & Execution Guide

> Read this file when: setting up QA for a new project, running broad discovery, deep-diving into a specific area, logging bugs to Plane, or packaging evidence for handoff.

## 0. Setup (1 time per project)

In the **project's QA folder** (e.g. `MyProject/qa/`), create `.env`:
```
QA_BASE_URL=https://app-cua-du-an.com
QA_EMAIL=...
QA_PASSWORD=...
QA_PROJECT_NAME=MyProject
```

**Step 0.1 — Run extractor once to bootstrap all business knowledge:**
```bash
cd MyProject/qa
QA_RUN_SKILL_DIR=/path/to/dynamic-web-exploratory node /path/to/../scripts/extract-flow.mjs
# Output: qa-knowledge/knowledge-index.json + qa-knowledge/app-flow-map.json + shard guides
```
Options:
```bash
--max-pages 20    # limit scanned pages (default: 30)
--wait 1500       # ms wait after each navigate (default: 1200)
--reauth          # force re-login even if auth.json exists
--dry-run         # only print navigation, do not write files
```

After the guide exists, AI reads `qa-knowledge/app-flow-map.json` instead of rescanning — saves 80-90% tokens in "context understanding" phase, only open browser when actual verification needed.

Then (run FROM that folder so data writes to correct project) — use MCP Playwright to login:
- `browser_navigate(BASE + '/login')` → `browser_snapshot` → `browser_fill_form` (email/password) → `browser_click` submit → `browser_wait_for` url changes -> save cookie (Playwright MCP auto manages session).

> If project needs auth.json for npm Playwright scripts to run (regression/batch): `node scripts/login.mjs` -> create `auth.json` + `evidence/` here.

## 1. Broad discovery (APP_BASELINE_DISCOVERY)

With `APP_BASELINE_DISCOVERY`, create coverage ledger by module and traverse:
- Entry point, happy flow, role/permission
- State/persistence, validation/boundary
- Side effect/integration, API/network
- Observable UI/UX

Every discovered module must have status `covered`, `partial`, `blocked` or `not_covered` with reason/evidence before stopping.

## 2. Deep dive into 1 doubt

**Before diving**: reload logic map (Step B from [PROCESS-GUIDE.md](PROCESS-GUIDE.md)) for the doubtful area.

**Method 1** (preferred, fast & "smart") — use MCP Playwright interactively:
1. Hypothesize from logic map (no blind guessing) → `browser_click` / `browser_type` / `browser_evaluate` to verify
2. `browser_snapshot` re-read DOM (avoid guessing) — compare with expected state in map
3. `browser_network_requests` view response body / status — verify side-effect (DB persist, message queue, webhook)
4. `browser_wait_for` text appears or changes (no hard sleep)
5. When verdict is clear -> `browser_take_screenshot` only concluding step -> write `FINDINGS.md` in standard format

**Method 2** (needs recurring run / CI) — write short script:
```js
// MyProject/qa/probe-x.mjs  — only write when RECURRING RUN needed (risk-based / sanity / regression)
const skillRoot = process.env.QA_RUN_SKILL_DIR;
if (!skillRoot) throw new Error('QA_RUN_SKILL_DIR is required');
const { browser, snap, shot, BASE } = await import(`${skillRoot}/lib/driver.mjs`);
const { recordNet, waitForStable, withRevert } = await import(`${skillRoot}/lib/ui.mjs`);
const { eq, check, summary } = await import(`${skillRoot}/lib/assert.mjs`);
const { b, page } = await browser();
const net = recordNet(page, /api\/v1/i, { withBody:true });
await page.goto(BASE + '/path');
const total = await waitForStable(() => page.evaluate(readTotal));
printSnap(await snap(page), 'STATE');
eq('Total after filter', total, 6);
check('Backend persist', net.some(c => c.status===200 && !/\[\]/.test(c.body)));
await shot(page, 'probe-x'); process.exit(summary('#<ticket>') ? 0 : 1);
```
Run: `cd MyProject/qa && node probe-x.mjs`. REAL data WRITE operations -> wrap in `withRevert(mutate, revert)`.

## 3. Log -> `FINDINGS.md` (in project folder)

Each bug: **Quan sát → Expected → Evidence:<png> → Severity → TC**. Group by root-cause.

Report & comment following **standard format** in `report/REPORT-TEMPLATE.md`:
- Rule #1: **Actual & Steps must newline each point (bullet/numbered), DO NOT write in a single paragraph**
- If it's a retest ticket, report must include: requirement source, business flow, AC-by-AC verdict, adjacent check and distinct evidence paths; do not merge multiple verdicts into one line

## 4. Package / handoff — log Plane bug with browser-inline evidence

**Goal**: open Plane ticket -> scroll description -> **see image preview immediately**, NO need to click download file.

**Method**:
1. Open the exact ticket in an authenticated browser session
2. Paste the screenshot into the Description or Comment rich-text editor
3. Save and verify the rendered image is inside the content and `Attachments 0` remains unchanged

Do not click ticket-level `Attach` or call `/issue-attachments/`. If the browser editor is unavailable, return `BLOCKED`

Wrapper script `scripts/log-bug.mjs` is ready for text-only metadata. Image evidence
must be pasted later in the authenticated browser editor; do not pass `--screenshots`
to the helper in the default workflow:
```bash
node <project>/qa/log-bug.mjs --title "[W26][Login] Email validation sai" \
  --module "Login" --severity "High" \
  --steps "1. Mở /login\n2. Để trống Email\n3. Click Login" \
  --expected "Show prompt requesting Email" \
  --actual "No prompt, still submitted" \
  --assign "hungtn,phongtq" --state "Todo"
```
