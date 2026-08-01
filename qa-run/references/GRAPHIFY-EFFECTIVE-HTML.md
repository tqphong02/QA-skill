# Graphify and effective HTML integration

Read this reference when repository-wide relationships, cross-file impact, a call-flow diagram, or an interactive QA intelligence report is requested

## Audited upstreams

| Capability | Repository | Audited revision | License |
|---|---|---|---|
| Repository knowledge graph | `Graphify-Labs/graphify` | `ecfcd160d56b420eb8241430fa7b5b1951c7829f` (`0.9.30`) | Apache-2.0 with bundled MIT notices |
| Visual conventions | `plannotator/effective-html` | `63b1bf04d3e48b426a31fdb82b1319c33663fde4` | MIT |

Treat these revisions as the reviewed compatibility baseline. A newer installed Graphify runtime is allowed only when the adapter doctor reports its actual version and smoke validation succeeds

## Graphify boundary

Graphify is an optional static discovery provider. It is not a business oracle, runtime observer, test executor or coverage engine

Run the doctor:

```bash
node scripts/discovery/graphify-adapter.mjs --doctor
```

Run repository discovery with the default privacy boundary:

```bash
node scripts/orchestrators/repo-business-discovery.mjs \
  --repo /absolute/repository \
  --mode full \
  --graphify auto
```

Use `--graphify required` only when the requested deliverable explicitly depends on Graphify. `auto` continues with the canonical QA-skill scanners when the runtime is absent. `off` disables it

The adapter always invokes Graphify with `--code-only` and disables Graphify query logging for extraction. It never runs `graphify install`, `graphify codex install`, `graphify hook install`, semantic document extraction, MCP startup, a database push or a remote backend

The normalized artifact retains the complete project graph by default:

```text
qa-knowledge/repositories/<repo>/graphify-discovery.json
```

The raw Graphify output stays under:

```text
qa-knowledge/repositories/<repo>/graphify-code-only/graphify-out/
```

Every normalized relation remains `source-derived-candidate`

- `EXTRACTED`: explicit static relationship reported by Graphify, still not runtime proof
- `INFERRED`: candidate relationship requiring source or runtime verification
- `AMBIGUOUS`: unresolved candidate that cannot drive a verdict

Use candidates to select scope, identify dependency neighborhoods, rank impacted regression and choose exact functions for `whitebox-qa`. Never use them to invent a role, expected result, business rule, allowed state transition or coverage result

`nodes` and `candidates` are the canonical full-project normalized collections. Do not cap them during normal repository discovery. The adapter also writes `contextSlice.nodes` and `contextSlice.candidates`; only this bounded ranked slice may be loaded into routine AI context. A context slice is a retrieval optimization, never a completeness statement

Use `--max-nodes` or `--max-edges` only when the user explicitly accepts a capped canonical artifact. Defaults are `0`, meaning keep all. `--context-max-nodes` and `--context-max-edges` control token exposure without deleting canonical project knowledge

Import an already-built graph without requiring a Graphify runtime:

```bash
node scripts/discovery/graphify-adapter.mjs \
  --repo /absolute/repository \
  --graph /absolute/graphify-out/graph.json \
  --output qa-knowledge/repositories/<repo>/graphify-discovery.json
```

## Interactive HTML boundary

The HTML renderer is an optional companion view derived from validated JSON. The canonical JSON, Markdown, Excel and XMind outputs remain authoritative

Supported inputs:

- qa-run Business Execution Brief
- qa-run static repository architecture map
- normalized Graphify discovery
- business-analysis hidden JSON source
- whitebox-qa bounded call graph or NestJS graph

Render and validate:

```bash
node scripts/writers/render-intelligence-html.mjs \
  --input /absolute/validated-input.json \
  --output /absolute/report.html

node scripts/writers/render-intelligence-html.mjs \
  --check /absolute/report.html
```

Mọi interactive companion được sinh bởi renderer này phải dùng presentation contract `catalog-v2`, cùng visual family và interaction contract với `skill-catalog/.../QA-skill.html`: topbar QA-skill, tab nội bộ, intro/stat panel, canvas tương tác, tìm kiếm, detail drawer và dark mode. Trên trackpad, cuộn 2 ngón phải pan theo cả trục X/Y; chỉ pinch hoặc `Ctrl`/`Cmd`+wheel mới zoom. Edge label phải là pill có nền và dùng progressive disclosure: mặc định ẩn, chỉ hiện khi hover hoặc route active. Business-flow HTML phải sinh route chip từ module; chip nhánh phải giữ prefix/suffix của primary flow để hiển thị tuyến end-to-end. Click/tap node không vượt drag threshold phải chỉ sáng các edge vào/ra và mở detail drawer gồm `Làm được gì` lấy từ `module.purpose`, `Thông tin flow` lấy từ actor/entry/exit/status và `Đường đi liên quan` liệt kê `Đi từ`/`Đi tới`. `--check` phải từ chối output legacy hoặc output thiếu `trackpadPan`, `gestureZoom`, `pointerNodeDetail`, `readableEdgeLabels`, `progressiveEdgeLabels`, `routeNavigation`, `capabilityDetails`

For Graphify input, the renderer embeds the complete retained node/relation index and exposes search across all of it. The SVG canvas intentionally displays a readable overview neighborhood instead of mounting thousands of SVG elements at once. Never describe the canvas count as project coverage

The renderer must remain self-contained, use no external scripts or stylesheets, include dark mode, keyboard-operable nodes, a dismissible detail panel, full-project search, reduced-motion handling and pan/zoom controls

Do not expose hidden `source_ref`, secret, credential, personal data or internal diagnostics in a business-analysis HTML companion. Run `accessibility-qa` when the HTML itself is a release deliverable

## Failure handling

- Graphify `runtime_missing` with mode `auto`: continue canonical discovery and report the skipped optional provider
- Graphify `runtime_missing` with mode `required`: stop with `BLOCKED`
- Invalid or missing `graph.json`: stop Graphify import and preserve existing canonical knowledge
- HTML validation failure: do not deliver the HTML; canonical artifacts remain valid and unchanged
