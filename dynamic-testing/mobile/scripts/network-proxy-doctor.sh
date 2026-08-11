#!/usr/bin/env bash

set -u

if [ "${1:-}" = "--help" ]; then
  printf '%s\n' "Usage: $0"
  printf '%s\n' "Detect official mobile proxy MCP, CLI, and application runtimes without changing proxy state"
  exit 0
fi

find_app() {
  local app_name="$1"
  local standard_path="/Applications/${app_name}.app"
  local user_path="${HOME}/Applications/${app_name}.app"

  if [ -d "$standard_path" ]; then
    printf '%s\n' "$standard_path"
  elif [ -d "$user_path" ]; then
    printf '%s\n' "$user_path"
  fi
}

app_version() {
  local app_path="$1"
  local plist_path="${app_path}/Contents/Info.plist"
  if command -v plutil >/dev/null 2>&1 && [ -f "$plist_path" ]; then
    plutil -extract CFBundleShortVersionString raw "$plist_path" 2>/dev/null || printf '%s\n' "unknown"
  else
    printf '%s\n' "unknown"
  fi
}

print_command() {
  local command_name="$1"
  if command -v "$command_name" >/dev/null 2>&1; then
    printf 'PASS cli=%s path=%s\n' "$command_name" "$(command -v "$command_name")"
  else
    printf 'MISS cli=%s\n' "$command_name"
  fi
}

proxyman_app="$(find_app "Proxyman")"
if [ -n "$proxyman_app" ]; then
  printf 'PASS app=proxyman version=%s path=%s\n' "$(app_version "$proxyman_app")" "$proxyman_app"
  proxyman_cli="${proxyman_app}/Contents/MacOS/proxyman-cli"
  proxyman_mcp="${proxyman_app}/Contents/MacOS/mcp-server"
  if [ -x "$proxyman_cli" ]; then
    printf 'PASS cli=proxyman path=%s\n' "$proxyman_cli"
    proxyman_export_help="$("$proxyman_cli" help export-log 2>/dev/null || true)"
    if printf '%s\n' "$proxyman_export_help" | grep -q -- "--format"; then
      printf '%s\n' "PASS capability=proxyman_har_export"
    else
      printf '%s\n' "MISS capability=proxyman_har_export reason=installed_cli_too_old"
    fi
  else
    printf '%s\n' "MISS cli=proxyman"
  fi
  if [ -x "$proxyman_mcp" ]; then
    printf 'PASS mcp=proxyman transport=stdio path=%s\n' "$proxyman_mcp"
  else
    printf '%s\n' "MISS mcp=proxyman reason=embedded_server_absent"
  fi
else
  printf '%s\n' "MISS app=proxyman"
fi

print_command mitmdump
print_command mitmproxy
print_command mitmweb

charles_app="$(find_app "Charles")"
if [ -n "$charles_app" ]; then
  printf 'PASS app=charles version=%s path=%s\n' "$(app_version "$charles_app")" "$charles_app"
  if [ -x "${charles_app}/Contents/MacOS/Charles" ]; then
    printf 'PASS cli=charles path=%s\n' "${charles_app}/Contents/MacOS/Charles"
  fi
else
  printf '%s\n' "MISS app=charles"
fi

http_toolkit_app="$(find_app "HTTP Toolkit")"
if [ -n "$http_toolkit_app" ]; then
  printf 'PASS app=http_toolkit version=%s path=%s\n' "$(app_version "$http_toolkit_app")" "$http_toolkit_app"
else
  printf '%s\n' "MISS app=http_toolkit"
fi

fiddler_app="$(find_app "Fiddler Everywhere")"
if [ -n "$fiddler_app" ]; then
  printf 'PASS app=fiddler_everywhere version=%s path=%s\n' "$(app_version "$fiddler_app")" "$fiddler_app"
  printf '%s\n' "INFO mcp=fiddler_everywhere check=client_configuration_and_local_api_key_required"
else
  printf '%s\n' "MISS app=fiddler_everywhere"
fi

if command -v codex >/dev/null 2>&1; then
  mcp_names="$(codex mcp list 2>/dev/null || true)"
  if printf '%s\n' "$mcp_names" | grep -qi proxyman; then
    printf '%s\n' "PASS mcp_client=codex server=proxyman"
  else
    printf '%s\n' "MISS mcp_client=codex server=proxyman"
  fi
  if printf '%s\n' "$mcp_names" | grep -qi fiddler; then
    printf '%s\n' "PASS mcp_client=codex server=fiddler"
  else
    printf '%s\n' "MISS mcp_client=codex server=fiddler"
  fi
fi

if [ -n "$proxyman_app" ] && [ -x "${proxyman_app}/Contents/MacOS/mcp-server" ]; then
  printf '%s\n' "RECOMMEND interactive=proxyman_mcp"
elif command -v mitmdump >/dev/null 2>&1; then
  printf '%s\n' "RECOMMEND interactive=mitmproxy_cli"
elif [ -n "$proxyman_app" ] && [ -x "${proxyman_app}/Contents/MacOS/proxyman-cli" ]; then
  printf '%s\n' "RECOMMEND interactive=proxyman_gui_plus_cli"
elif [ -n "$fiddler_app" ]; then
  printf '%s\n' "RECOMMEND interactive=fiddler_mcp_after_configuration"
elif [ -n "$charles_app" ]; then
  printf '%s\n' "RECOMMEND interactive=charles"
elif [ -n "$http_toolkit_app" ]; then
  printf '%s\n' "RECOMMEND interactive=http_toolkit"
else
  printf '%s\n' "BLOCKED proxy_runtime=missing"
fi

if command -v mitmdump >/dev/null 2>&1; then
  printf '%s\n' "RECOMMEND headless=mitmdump"
else
  printf '%s\n' "BLOCKED headless_proxy_runtime=missing"
fi
