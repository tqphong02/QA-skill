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

The normalized artifact is:

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

The renderer must remain self-contained, use no external scripts or stylesheets, include dark mode, keyboard-operable nodes, a dismissible detail panel, reduced-motion handling and pan/zoom controls

Do not expose hidden `source_ref`, secret, credential, personal data or internal diagnostics in a business-analysis HTML companion. Run `accessibility-qa` when the HTML itself is a release deliverable

## Failure handling

- Graphify `runtime_missing` with mode `auto`: continue canonical discovery and report the skipped optional provider
- Graphify `runtime_missing` with mode `required`: stop with `BLOCKED`
- Invalid or missing `graph.json`: stop Graphify import and preserve existing canonical knowledge
- HTML validation failure: do not deliver the HTML; canonical artifacts remain valid and unchanged
