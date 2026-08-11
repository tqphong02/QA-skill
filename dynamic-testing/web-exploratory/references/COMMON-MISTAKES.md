# QA Run — Common Mistakes & Troubleshooting

> Read this file when: encountering unexpected workflow errors, debugging failed runs, or during post-mortem review. This is NOT part of the critical path — hard gates in SKILL.md operate independently of this file.

## Workflow Mistakes

| Mistake | Why it's wrong | Fix |
|---|---|---|
| Blind clicking without reading spec | AI generates wrong verdict (mistaking PASS for FAILED or vice versa) | MANDATORY: go through Steps A-D in [PROCESS-GUIDE.md](PROCESS-GUIDE.md) |
| Skip adjacent area check | Functional fixes sometimes break UI elsewhere | Step 4 (RETEST_PLUS) is MANDATORY — see [RETEST-PLUS.md](RETEST-PLUS.md) |
| Snapshot full page every time | Large payload, wastes tokens | Scope snapshot — only interactive elements; see [MCP-CHEATSHEET.md](MCP-CHEATSHEET.md) |
| Use hard `wait_for_timeout` | Flaky CI | Always `browser_wait_for` text/event |
| Hardcode URL/auth in prompt | Secret leak | Use `.env` + `auth.json` in project folder |
| Skip teardown after self-created data | DB pollution, affects other tests | Wrap in `withRevert()` or use `afterAll` |
| Not writing business guide after run | AI has to re-explore from scratch next time | Always merge valid knowledge and validate read-back |
| Absolute trust in old guides | Environment/version can change | Check verify date, source and confidence; re-verify parts within current scope |
| Lumped "overall OK" verdict | Hides individual failed ACs | MUST mark PASS/FAILED per AC |
| Image in Plane bug appears as an attachment | Used the ticket-level Attach control or API attachment route | Paste it in the authenticated browser editor and verify `Attachments 0` |
| Ticket FAILED because of a new unrelated bug | Mixes two independent root causes | Keep original verdict separate; open new bug in Todo |

## Environment & Setup Errors

| Symptom | Root cause | Fix |
|---|---|---|
| `Cannot find .env` | Wrong cwd | `cd ~/Documents/QA-MDS/<project>` before running |
| `401 Unauthorized` (Plane) | Wrong or expired API key | Rotate key in Plane Profile |
| Skill not appearing in agent | Folder in wrong location | Run `scripts/doctor-agent.sh --agent=<host>` from repo root then open new agent session |
| `auth.json` missing for npm scripts | Never ran `login.mjs` | `node scripts/login.mjs` in project qa/ folder |
| Knowledge index stale after release | Guide not refreshed | Run `validate-knowledge.mjs --check`; re-run `extract-flow.mjs` for changed modules |

## Evidence & Reporting Mistakes

| Mistake | Fix |
|---|---|
| Sheet evidence from every function mixed in one run folder | Write media to `evidence/sheet/<functional-group>/<YYYY-MM-DD>/<run-id>/worker-<id>/` and metadata to `evidence/sheet/_runs/<YYYY-MM-DD>/<run-id>/` |
| FINDINGS.md written as a wall of text | Each bug: Quan sát → Expected → Evidence path → Severity → TC; one bullet per point |
| Screenshot returned as image bytes into context | Use `lib/driver.mjs` — saves to file; reference path, not bytes |
| Multiple run artifacts mixed in one folder | Each `run-manifest.mjs start` creates unique `run-id`; never share folders across runs |

## MCP Not Working

For full fallback workflow when Playwright MCP is unavailable, read [ANTIGRAVITY-FALLBACK.md](ANTIGRAVITY-FALLBACK.md).

Quick diagnosis:
1. `mcp_not_configured` — MCP server not in config; add `playwright` to agent MCP list
2. `runtime_missing` — Playwright npm not installed; `npm install playwright`
3. `auth_required` — Session expired; re-run `scripts/login.mjs`
4. `permission_denied` — Agent lacks file/network permission; check agent config
