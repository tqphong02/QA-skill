# QA Run — Antigravity Fallback & Common Mistakes

> Read this file when: Claude Code + Playwright MCP is unavailable, or when debugging common workflow mistakes.

## Google Antigravity Fallback

If Claude Code loses access, or Playwright MCP is removed/broken -> **skill still runs on Antigravity** (Google's agentic platform: CLI + IDE + Gemini-in-Chrome). Most skill assets are **portable** — only swapping the "UI driving brain".

### Portable assets (runs in any env with Node >= 18)

| Asset | Portability Reason |
|---|---|
| `lib/driver.mjs`, `lib/ui.mjs`, `lib/assert.mjs` | Pure Node + playwright npm |
| `scripts/sweep.mjs`, `api-health.mjs`, `explore.mjs`, `login.mjs` | Pure Node, call `node <script>` |
| `scripts/log-bug.mjs` | Pure `fetch` HTTP → Plane API |
| `report/export-pdf.sh`, `report/upload-to-drive.py` | Bash/Python stdlib |
| Principle #1 (understand context first), 5 testing techniques, retest/sanity workflow | **Methodology** — tool-independent |
| `.env`, `auth.json`, `evidence/` | Located in project folder, DOES NOT depend on Claude Code |

### Needs swapping (only "UI driving brain")

| Task | Claude Code (default) | Antigravity (fallback) |
|---|---|---|
| Interactive UI driving | `mcp__playwright__browser_*` | **Gemini-in-Chrome** (Antigravity controls Chrome itself) |
| Fetch ticket from URL | `WebFetch` | Antigravity web tool / `curl` in terminal |
| Agent reasoning | Claude | Gemini (Antigravity default) |
| Run probe script | `node scripts/x.mjs` via Bash tool | `node scripts/x.mjs` via terminal |
| Log bug | `node log-bug.mjs ...` | `node log-bug.mjs ...` |

### Workflow on Antigravity
1. Open Antigravity IDE -> open project folder (e.g. `MyProject/qa/`)
2. Agent (Gemini) uses **Gemini-in-Chrome** itself to navigate/click/snapshot/probe API
3. When needing batch/regression -> agent runs `node <skill-root>/scripts/sweep.mjs`
4. When logging bug -> agent runs `node log-bug.mjs ...` (portable script)
5. Verdict + report in same format (`report/REPORT-TEMPLATE.md`)

### Notes on fallback
- `auth.json` must exist (Antigravity running npm Playwright scripts needs `auth.json`)
- Antigravity's Gemini-in-Chrome **DOES NOT** auto-share with playwright headless -> must re-login using `login.mjs`
- Different model prompt: Gemini understands this workflow if prompted clearly

## Common Mistakes

| Mistake | Why it's wrong | Fix |
|---|---|---|
| Blind clicking without reading spec | AI generates wrong verdict (mistaking PASS for FAILED or vice versa) | MANDATORY to go through Step A-D in [PROCESS-GUIDE.md](PROCESS-GUIDE.md) |
| Skip adjacent area check | Functional fixes sometimes break UI elsewhere | Step 4 (RETEST_PLUS) is MANDATORY |
| Snapshot full page every time | Large payload, wastes tokens | Scope snapshot — only interactive elements |
| Use hard `wait_for_timeout` | Flaky CI | Always `browser_wait_for` text/event |
| Hardcode URL/auth in prompt | Secret leak | Use `.env` + `auth.json` in project folder |
| Skip teardown | DB pollution, affects other tests | Wrap in `withRevert()` or use `afterAll` |
| Not writing business guide after run | AI has to re-explore from scratch next time | Always merge valid knowledge, write guide and validate read-back |
| Absolute trust in old guides | Environment/version can change | Check verify date, source and confidence then re-verify parts within current scope |
| Lumped "overall OK" verdict | Hides individual failed ACs | MUST mark PASS/FAILED per AC |
| Image in Plane bug appears broken | Used base64 data URI instead of asset URL | Upload via `issues/{id}/issue-attachments/` then embed URL |
| `Cannot find .env` | Wrong cwd | `cd ~/Documents/QA-MDS/<project>` before running |
| `401 Unauthorized` (Plane) | Wrong/expired API key | Rotate key in Plane Profile |
| Skill not appearing | Folder in wrong location | Run `scripts/doctor-agent.sh --agent=<host>` from repository then open new agent session |
