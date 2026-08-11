#!/usr/bin/env bash

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORKSPACE_CONFIG="${ANTIGRAVITY_WORKSPACE_MCP_CONFIG:-$REPO_DIR/.agents/mcp_config.json}"
GLOBAL_CONFIG="${ANTIGRAVITY_GLOBAL_MCP_CONFIG:-$HOME/.gemini/config/mcp_config.json}"

config=""
for candidate in "$GLOBAL_CONFIG" "$WORKSPACE_CONFIG"; do
  if [[ -f "$candidate" ]]; then
    config="$candidate"
    break
  fi
done

if [[ -z "$config" ]]; then
  printf '%s\n' 'FAILED mcp_not_configured github antigravity' >&2
  exit 1
fi

python3 - "$config" <<'PY'
import json
import sys

path = sys.argv[1]
with open(path, encoding="utf-8") as handle:
    data = json.load(handle)
server = data.get("mcpServers", {}).get("github")
if not isinstance(server, dict):
    raise SystemExit("FAILED github entry missing in " + path)
url = server.get("serverUrl", "")
if url not in {
    "https://api.githubcopilot.com/mcp/",
    "https://api.githubcopilot.com/mcp/x/all",
}:
    raise SystemExit("FAILED wrong GitHub MCP endpoint in " + path)
if server.get("disabled", False):
    raise SystemExit("FAILED github MCP is disabled in " + path)
print("PASS GitHub MCP configured for Antigravity in " + path)
print("MANUAL run /mcp, authenticate the correct GitHub account, then smoke test read-only")
PY
