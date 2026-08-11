# Mobile proxy tool matrix

Resolve the installed runtime with `scripts/network-proxy-doctor.sh` on macOS/Linux or `scripts/network-proxy-doctor.ps1` on Windows. Prefer official MCP or CLI surfaces; do not depend on an unverified community MCP server.

Status verified against official documentation on 2026-07-29.

| Tool | Official MCP | CLI/headless | Mobile fit | Route |
|---|---|---|---|---|
| Proxyman | Yes, bundled stdio bridge to the local app | Yes, bundled `proxyman-cli` | Excellent on macOS for iOS and Android interactive inspection | Primary interactive engine on macOS |
| mitmproxy | No official MCP found | Excellent: `mitmproxy`, `mitmdump`, `mitmweb`, Python addons | Strong for Android/iOS proxy capture and deterministic CI | Primary headless and CI engine |
| Fiddler Everywhere | Yes, local HTTP MCP server | Terminal capture exists; not the primary automation surface | Strong cross-platform remote-device capture | Licensed MCP alternative |
| Charles Proxy | No official MCP found | `-headless`, `-config`, conversion and certificate CLI tools | Mature manual/headless mobile proxy | Fallback when an existing Charles setup is supplied |
| HTTP Toolkit | No official MCP or general-purpose end-user CLI found | UI-driven; Mockttp is a programmable library | Very good Android ADB/QR/VPN onboarding | Manual Android-focused fallback |

## Selection order

1. Use Proxyman MCP when the user is on macOS, Proxyman is running, its embedded `mcp-server` exists, and the MCP tools are loaded
2. Use `mitmdump` for headless, repeatable, scripted, or CI capture
3. Use Proxyman GUI plus its CLI when Proxyman is installed but MCP is unavailable
4. Use Fiddler MCP when the user has Fiddler Everywhere Pro or higher, a local API key, and an active internet connection
5. Use Charles or HTTP Toolkit only when the user already uses that product or needs its onboarding/UI

On Windows, prefer Fiddler Everywhere MCP for licensed interactive inspection and `mitmdump` for repeatable or CI capture. Proxyman remains the macOS route in this skill.

Never install or purchase a proxy product merely to satisfy a default route. Report the available engine and the missing layer.

## Capability notes

### Proxyman

- MCP can list flows, inspect details, filter, export cURL, manage capture, SSL proxying, Breakpoints, Map Local/Remote, and other rules depending on the active version
- CLI can export/import rules, toggle the system proxy and debugging tools, and clear/export sessions; HAR export is version-dependent and must be proven from `proxyman-cli help export-log`
- Scripting uses JavaScript and supports request/response mutation, GraphQL operation matching, and limited WebSocket handshake/header modification

Official sources:

- https://docs.proxyman.com/mcp
- https://docs.proxyman.com/command-line
- https://docs.proxyman.com/scripting/script

### mitmproxy

- `mitmdump` is the command-line capture engine
- Python addons can inspect, modify, replay, redirect, mock, and process WebSocket messages
- `hardump` writes HAR on graceful exit; HTTP/2 and HTTP/3 options are available

Official sources:

- https://github.com/mitmproxy/mitmproxy
- https://docs.mitmproxy.org/stable/addons/overview/
- https://docs.mitmproxy.org/stable/concepts/options/

### Fiddler Everywhere

- Official MCP runs locally over HTTP and requires Fiddler Everywhere Pro or higher, an API key, and internet access
- MCP supports status checks, traffic capture, session analysis, and application capture depending on platform prerequisites
- Remote-device capture supports Android and iOS on the same reachable network

Official sources:

- https://www.telerik.com/fiddler/fiddler-everywhere/documentation/agent-tools/fiddler-mcp-server
- https://www.telerik.com/fiddler/fiddler-everywhere/documentation/capture-traffic/capturing-modes

### Charles

- Supports `-headless`, alternative configuration files, throttling, a control web interface, Rewrite, Breakpoints, SSL Proxying, and session conversion
- Its CLI is useful for an existing licensed setup but is less agent-native than Proxyman MCP or mitmproxy

Official sources:

- https://www.charlesproxy.com/documentation/using-charles/command-line-options/
- https://www.charlesproxy.com/documentation/tools/command-line-tools/

### HTTP Toolkit

- Provides guided Android interception over ADB or QR/VPN
- HTTPS interception may require an authorized debug network-security configuration or a rooted/emulator system CA
- Use the UI for capture and Mockttp only when the task explicitly needs programmatic proxy rules

Official sources:

- https://httptoolkit.com/docs/guides/android/
- https://github.com/httptoolkit/mockttp
