# Mobile network inspection

Capture only authorized test traffic. Default to observation; mutation requires an explicit execution contract and cleanup.

## Required scope

Resolve before capture:

| Field | Required value |
|---|---|
| App/build | Exact debug or staging build and checksum |
| Device | Exact emulator, simulator, or authorized real device |
| Environment | Non-production by default |
| Domains | Explicit allowlist |
| Accounts/data | Disposable test identities and data |
| Protocols | HTTP/HTTPS, GraphQL, WebSocket, SSE, gRPC as applicable |
| Capture mode | Passive or approved mutation |
| Sensitive fields | Redaction rules |
| CA/proxy/VPN | Setup and cleanup owner |
| Expected behavior | Status, latency, retry, cache, error and recovery rules |

Never capture unrelated device or system traffic. Stop and report `BLOCKED` if domain scoping, authorization, or cleanup ownership is missing.

## Engine readiness

Run:

```bash
scripts/network-proxy-doctor.sh
```

On Windows:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\network-proxy-doctor.ps1
```

Use [PROXY_TOOL_MATRIX.md](PROXY_TOOL_MATRIX.md) to select exactly one engine. Do not combine proxies in the same device route.

## Device routing

### Android emulator

- Route the emulator to the host proxy with `10.0.2.2:<proxy-port>` or launch it with the appropriate `-http-proxy` option
- Prefer a non-Play emulator image when temporary system CA installation is required
- Prefer a debug-only `network_security_config` that trusts the test CA
- Restore the emulator proxy and remove temporary trust after the run

### Android real device

- Put the device and proxy host on the same reachable network
- Configure the Wi-Fi proxy to the host LAN IP and proxy port, or use the product's authorized VPN/ADB onboarding
- Install and trust the proxy CA only on the designated test device
- Android 7+ apps may reject user CAs unless the debug build opts in

### iOS simulator or real device

- Configure the HTTP proxy to the host and proxy port
- Install the CA profile and enable full trust only on the test simulator/device
- Remove the profile and restore proxy settings after capture

If the app uses certificate pinning or mTLS, request an authorized debug build with a test-specific configuration. Do not patch or bypass a release or third-party app under this skill.

## Passive capture workflow

1. Record the execution contract
2. Clear or isolate the proxy session
3. Start capture with the selected engine
4. Record a synchronized start timestamp
5. Execute the Appium business journey
6. Mark each UI action with its expected request or connection
7. Stop capture gracefully
8. Export a sanitized HAR or engine-native flow file
9. Run `scripts/analyze-mobile-har.py`
10. Restore proxy, CA, VPN, and rules

Verify:

- Expected request exists exactly when the UI action occurs
- Method, host, path, headers presence, content type, status, latency, and size are plausible
- No unexpected duplicate, retry storm, polling leak, stale cache, or cancelled request
- Offline and reconnect behavior matches the business contract
- Authentication refresh does not loop or expose secrets
- Error responses produce the expected user-visible recovery

## GraphQL

Correlate operation name with the UI action. Validate both transport and GraphQL semantics:

- HTTP status
- `data`, `errors`, and partial-data combinations
- operation name and variables shape without retaining sensitive values
- batching, retry, cache, and duplicate behavior
- user-visible handling of GraphQL errors returned with HTTP 200

## WebSocket

Validate:

- HTTP upgrade/handshake and authentication
- Connection establishment time
- Message direction, order, duplication, and schema
- Heartbeat/ping behavior
- Background/foreground and network-loss reconnect
- Backoff and subscription restoration

HAR may omit WebSocket message details. Preserve a sanitized engine-native export or summary when message-level evidence is required.

## Authorized mutation

Before Rewrite, Breakpoint, Map Local/Remote, scripting, throttling, replay, or forced errors, record:

```text
Target:
Operation:
Required inputs:
Write action:
Verification:
Cleanup:
```

Apply one rule at a time, read it back, execute a control request, execute the mutated request, then remove the rule and verify normal behavior returns.

## Engine recipes

### Proxyman MCP

Use the active MCP schemas as the source of truth. Begin with status, certificate state, SSL proxying scope, and a cleared session. Read-only tools may be used immediately; require approval before rule creation, recording changes, or session clearing when evidence already exists.

### Proxyman CLI

The macOS binary is normally:

```bash
/Applications/Proxyman.app/Contents/MacOS/proxyman-cli
```

Common operations:

```bash
proxyman-cli clear-session
proxyman-cli scripting on
proxyman-cli scripting off
```

Check installed export capabilities:

```bash
proxyman-cli help export-log
```

Only use `--format har` when that help output lists the option:

```bash
proxyman-cli export-log \
  -m domains \
  -o /absolute/evidence/path \
  --domains api.example.test \
  --format har
```

Older Proxyman CLI versions export only the native session format. Export HAR through the app UI or upgrade through the authorized product channel; do not pass an unsupported flag. Use the full application path when the CLI is not on `PATH`. Export before clearing evidence.

### mitmproxy

Start a headless proxy and write HAR on graceful exit:

```bash
mitmdump \
  --listen-host 0.0.0.0 \
  --listen-port 8080 \
  --set hardump=/absolute/evidence/mobile.har
```

Load an approved Python addon with `-s /absolute/path/addon.py`. Stop gracefully so `hardump` is written. Bind only to the interface required by the test network and restrict access with host firewall or isolation.

### Charles

Use an existing configuration:

```bash
charles -headless -config /absolute/path/charles.config
```

Do not assume GUI Breakpoints are suitable for unattended CI.

### HTTP Toolkit and Fiddler Everywhere

Use their guided device onboarding. For Fiddler MCP, start with `get_status` and confirm login, CA trust, capture mode, and session source. HTTP Toolkit is a manual fallback unless the user supplies a supported programmatic integration.

On Windows, use Fiddler Everywhere or mitmproxy as the primary routes. Read [WINDOWS_MOBILE_QA.md](WINDOWS_MOBILE_QA.md) for PowerShell readiness checks, Android routing, CA setup, MCP configuration, HAR analysis, and cleanup.

## HAR analysis

Run:

```bash
python scripts/analyze-mobile-har.py capture.har \
  --slow-ms 1000 \
  --format markdown \
  --output artifacts/mobile-network-summary.md
```

The analyzer intentionally excludes headers, cookies, query values, and bodies. Review the original capture in the authorized proxy tool when deeper evidence is required.

## Completion checks

- Engine and version recorded
- App/build, device, environment, account, and domains scoped
- UI actions correlated with network flows
- GraphQL/WebSocket semantics checked when applicable
- Sensitive fields redacted
- Active mutations have control comparisons
- Proxy, CA, VPN, capture, and rules restored
- Pinning, mTLS, QUIC, VPN, or protocol limitations remain visible
