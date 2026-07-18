#!/bin/bash
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -f "$ROOT/config.env" ]; then
    # shellcheck source=../config.env
    source "$ROOT/config.env"
fi
: "${PLANE_BASE_URL:=https://api.plane.so}"
: "${PLANE_API_VERSION:=v1}"

target_url=""
if [ "${1:-}" = "--url" ]; then
    target_url="${2:-}"
    if [ -z "$target_url" ]; then
        echo "Usage: doctor.sh [--url <Plane workspace or ticket URL>]"
        exit 2
    fi
    parsed="$(python3 -c 'import sys, urllib.parse
u=urllib.parse.urlparse(sys.argv[1])
parts=[urllib.parse.unquote(x) for x in u.path.split("/") if x]
if u.scheme not in ("http","https") or not u.netloc or not parts:
    raise SystemExit(2)
print(f"{u.scheme}://{u.netloc}|{parts[0]}")' "$target_url")" || {
        echo "PLANE URL FAIL: URL is invalid or has no workspace slug."
        exit 2
    }
    PLANE_BASE_URL="${parsed%%|*}"
    PLANE_WORKSPACE_SLUG="${parsed#*|}"
fi

if [ -z "${PLANE_WORKSPACE_SLUG:-}" ]; then
    echo "PLANE CONFIG FAIL: PLANE_WORKSPACE_SLUG is not set."
    exit 2
fi

key_suffix="$(printf '%s' "$PLANE_WORKSPACE_SLUG" | tr '[:lower:]' '[:upper:]' | tr -c 'A-Z0-9' '_' | sed 's/^_*//;s/_*$//')"
key_var="PLANE_API_KEY_${key_suffix}"
workspace_key="$(printenv "$key_var" 2>/dev/null || true)"
selected_key="${workspace_key:-${PLANE_API_KEY:-}}"

if [ -z "$selected_key" ]; then
    echo "PLANE AUTH FAIL: neither ${key_var} nor PLANE_API_KEY is set."
    echo "Create or rotate a Plane Personal Access Token, export one of those variables, then restart Codex."
    echo "Do not provide a Plane account password."
    exit 2
fi

url="${PLANE_BASE_URL%/}/api/${PLANE_API_VERSION}/workspaces/${PLANE_WORKSPACE_SLUG}/projects/"
tmp_body="$(mktemp)"
trap 'rm -f "$tmp_body"' EXIT

status="$(curl --silent --show-error --location --output "$tmp_body" --write-out '%{http_code}' \
    --connect-timeout 10 --max-time 30 \
    -H "X-API-Key: ${selected_key}" \
    -H 'Accept: application/json' \
    "$url")" || {
    echo "PLANE CONNECTIVITY FAIL: could not reach ${PLANE_BASE_URL}."
    exit 3
}

case "$status" in
    200)
        selected_name="PLANE_API_KEY"
        if [ -n "$workspace_key" ]; then selected_name="$key_var"; fi
        echo "PLANE AUTH OK: workspace=${PLANE_WORKSPACE_SLUG}, base=${PLANE_BASE_URL}, key_source=${selected_name}."
        ;;
    401)
        echo "PLANE AUTH FAIL (401): the API key is invalid, expired, or revoked."
        echo "Rotate the Personal Access Token, export PLANE_API_KEY, and restart Codex."
        exit 4
        ;;
    403)
        echo "PLANE ACCESS FAIL (403): the key lacks access to workspace ${PLANE_WORKSPACE_SLUG}."
        exit 4
        ;;
    *)
        echo "PLANE CHECK FAIL: HTTP ${status} from ${PLANE_BASE_URL}."
        exit 5
        ;;
esac
