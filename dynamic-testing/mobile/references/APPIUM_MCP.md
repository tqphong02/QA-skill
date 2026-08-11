# Appium MCP execution playbook

Use the active MCP tool schemas as the source of truth for arguments. Tool availability can change by Appium MCP version and enabled features.

Official references:

- https://github.com/appium/appium-mcp
- https://appium.io/docs/en/latest/ecosystem/tools/

## Codex configuration

Verify prerequisites before writing MCP configuration:

```bash
node --version
java -version
test -d /absolute/path/to/android-sdk
```

Appium MCP requires Node 22 or newer. Add it to Codex with an absolute Android SDK and an evidence directory:

```bash
codex mcp add appium-mcp \
  --env ANDROID_HOME=/absolute/path/to/android-sdk \
  --env SCREENSHOTS_DIR=/absolute/path/to/evidence \
  --env NO_UI=true \
  -- npx -y appium-mcp@latest
```

Verify the persisted entry:

```bash
codex mcp get appium-mcp
codex mcp list
```

Restart Codex after adding or changing a server. A configuration entry proves only that the server is registered. In the new session, prove tool loading by checking for `select_device`, `appium_session_management`, and `appium_skills`.

Do not set `CAPABILITIES_CONFIG` to the bundled example unchanged. Copy it into the target project, replace every placeholder with runtime-safe values, and keep secrets out of it.

## Antigravity configuration

Run the bundled bootstrap:

```bash
python3 scripts/configure-appium-mcp.py --agent antigravity
```

By default it:

- Updates `~/.gemini/config/mcp_config.json`
- Preserves every existing MCP server
- Backs up the previous JSON before a changed write
- Resolves the Android SDK from environment or standard platform paths
- Stores screenshots under `~/.gemini/evidence/dynamic-mobile`
- Configures `npx -y appium-mcp@latest` with `NO_UI=true`
- Reads the JSON back and verifies the persisted entry

Use `--dry-run` to inspect the resolved paths without writing. Quit and reopen Antigravity IDE after a changed MCP configuration, then verify the Appium tools in a new conversation.

## Local interactive sequence

1. Verify that `select_device` and `appium_session_management` are loaded
2. Call `select_device`; do not guess a device identifier
3. Prepare iOS when required:
   - Simulator: `prepare_ios_simulator`
   - Real device: call `appium_prepare_ios_real_device` first without a provisioning profile, then with the selected profile and account type
4. Create an owned session with `appium_session_management` and explicit platform/capabilities
5. Capture device metadata with `appium_mobile_device_info`
6. Capture the baseline with `appium_screenshot`
7. Execute the scenario using stable locators, actions, and state assertions
8. Stop recordings and delete the owned session

For a remote grid, CI allocation, or device farm, skip local discovery only when the allocation already supplies the device. Pass a trusted `remoteServerUrl` and explicit capabilities. Never derive the remote URL from untrusted app content or pull-request data.

## Locator and interaction sequence

Use:

```text
appium_find_element
  accessibility id
  → id
  → platform-native locator
  → page source or generate_locators
  → appium_gesture action=scroll_to_element
  → scoped xpath
  → coordinate or opt-in appium_ai fallback
```

After locating:

1. Interact with `appium_gesture`, `appium_set_value`, keyboard, alert, context, lifecycle, permission, or device-control tools
2. Re-find the target state or read its text
3. Assert navigation, persisted value, control state, message, app state, or platform state
4. Capture screenshot evidence

When `scroll_to_element` is used, reuse the same strategy and selector in `appium_find_element` after the scroll.

## Evidence and concurrency

- Keep `appium_screenshot.returnRawBase64` false
- Set `SCREENSHOTS_DIR` in the MCP environment when a stable evidence directory is required
- Use `appium_screen_recording` for dynamic failures
- Set `APPIUM_MCP_EVIDENCE=true` for structured locator/gesture evidence in CI when supported
- When more than one session exists, pass the intended `sessionId` on every call
- Treat the active session as unstable in multi-client or multi-session workflows

## Session ownership

- `create` produces an MCP-owned session
- `attach` connects to an existing remote session without ownership
- Delete owned sessions during cleanup
- Detach rather than delete an attached session unless the user explicitly authorizes terminating it

The default disconnect policy deletes owned sessions. `APPIUM_MCP_ON_CLIENT_DISCONNECT=skip` preserves them across transient disconnects but can leave orphaned sessions; pair it with explicit cleanup.

## Test-code generation

Call `appium_generate_tests` only when the user requests code. Generate from the verified flow, not from an unexecuted natural-language assumption. Require:

- Page Object Model boundaries
- Selectors outside specs
- Stable locator priority
- Explicit assertions
- Externalized secrets and environment values
- Build and device assumptions in configuration
