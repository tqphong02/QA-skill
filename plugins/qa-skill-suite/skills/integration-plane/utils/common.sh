#!/bin/bash
# ============================================
# Plane API Common Utilities
# ============================================

# Resolve the integration-plane root directory from this file.
_resolve_skill_dir() {
    local self="${BASH_SOURCE[0]:-$0}"
    cd "$(dirname "$self")/.." 2>/dev/null && pwd
}
SKILL_DIR="$(_resolve_skill_dir)"

# Load only the Plane keys this skill supports. In particular, do not source
# arbitrary `.env` assignments because a user may keep an unsupported password
# variable there and the skill must never import it into the process
_load_plane_env() {
    local file="$1" line key value
    while IFS= read -r line || [ -n "$line" ]; do
        line="${line#${line%%[![:space:]]*}}"
        [ -z "$line" ] && continue
        case "$line" in \#*) continue ;; esac
        case "$line" in export\ *) line="${line#export }" ;; esac
        case "$line" in *=*) ;; *) continue ;; esac
        key="${line%%=*}"
        value="${line#*=}"
        case "$value" in
            \"*\") value="${value#\"}"; value="${value%\"}" ;;
            \'*\') value="${value#\'}"; value="${value%\'}" ;;
        esac
        case "$key" in
            PLANE_BASE_URL|PLANE_API_VERSION|PLANE_WORKSPACE_SLUG|PLANE_DEFAULT_PROJECT_ID|PLANE_EMAIL|PLANE_BROWSER_STATE_PATH|PLANE_BROWSER_PROFILE_DIR|PLANE_QA_RUN_ROOT|PLANE_LOCAL_CONFIG_DIR|PLANE_API_KEY|PLANE_API_KEY_*)
                export "$key=$value"
                ;;
        esac
    done < "$file"
}

if [ -f "$SKILL_DIR/config.env" ]; then
    _load_plane_env "$SKILL_DIR/config.env"
fi
if [ -f "$SKILL_DIR/.env" ]; then
    _load_plane_env "$SKILL_DIR/.env"
fi
if [ -n "${PLANE_LOCAL_CONFIG_DIR:-}" ] && [ -f "${PLANE_LOCAL_CONFIG_DIR}/.env" ]; then
    _load_plane_env "${PLANE_LOCAL_CONFIG_DIR}/.env"
fi
: "${PLANE_BASE_URL:=https://api.plane.so}"
: "${PLANE_API_VERSION:=v1}"
: "${PLANE_WORKSPACE_SLUG:=}"
: "${PLANE_DEFAULT_PROJECT_ID:=}"

key_suffix="$(printf '%s' "$PLANE_WORKSPACE_SLUG" | tr '[:lower:]' '[:upper:]' | tr -c 'A-Z0-9' '_' | sed 's/^_*//;s/_*$//')"
if [ -n "$key_suffix" ]; then
    key_var="PLANE_API_KEY_${key_suffix}"
    workspace_key="$(printenv "$key_var" 2>/dev/null || true)"
    PLANE_API_KEY="${workspace_key:-${PLANE_API_KEY:-}}"
fi

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# ============================================
# Core API Functions
# ============================================

# Base API URL
api_base() {
    echo "${PLANE_BASE_URL}/api/${PLANE_API_VERSION}"
}

# Make API request
# Usage: api_request <method> <endpoint> [body_json]
# On success: outputs JSON data to stdout, returns 0
# On error:   outputs error message to stderr, returns 1
api_request() {
    local method="$1"
    local endpoint="$2"
    local body="${3:-}"
    local url="$(api_base)${endpoint}"

    if [ -z "${PLANE_API_KEY:-}" ]; then
        echo -e "${RED}Plane API key is not set.${NC}" >&2
        echo "Export PLANE_API_KEY and restart Codex, then run: ./plane.sh doctor" >&2
        return 1
    fi

    local -a curl_args
    curl_args=(--silent --show-error --location --write-out $'\n%{http_code}'
        --request "$method"
        --header "X-API-Key: ${PLANE_API_KEY}"
        --header "Content-Type: application/json"
        --header "Accept: application/json"
        --connect-timeout 10 --max-time 60)
    if [ -n "$body" ]; then
        curl_args+=(--data "$body")
    fi
    curl_args+=("$url")

    local response
    response=$(curl "${curl_args[@]}" 2>&1)
    local curl_status=$?
    if [ "$curl_status" -ne 0 ]; then
        echo -e "${RED}Plane request failed before an HTTP response was received.${NC}" >&2
        echo "$response" >&2
        return 1
    fi
    local http_code
    http_code=$(echo "$response" | tail -1)
    local body_response
    body_response=$(echo "$response" | sed '$d')

    # Check HTTP status
    case "$http_code" in
        200|201|202)
            echo "$body_response"
            return 0
            ;;
        204)
            echo -e "${GREEN}✓ Success (204 No Content)${NC}" >&2
            return 0
            ;;
        400)
            echo -e "${RED}✗ Bad Request (400)${NC}" >&2
            echo "$body_response" | python3 -m json.tool 2>/dev/null >&2 || echo "$body_response" >&2
            return 1
            ;;
        401|403)
            echo -e "${RED}✗ Plane authentication/access failed (${http_code}).${NC}" >&2
            echo "The personal API key may be missing, expired, revoked, or unauthorized for this workspace." >&2
            echo "Rotate the token if needed, export PLANE_API_KEY, restart Codex, then run: ./plane.sh doctor" >&2
            echo "$body_response" | python3 -m json.tool 2>/dev/null >&2 || echo "$body_response" >&2
            return 1
            ;;
        404)
            echo -e "${RED}✗ Not Found (404)${NC}" >&2
            echo "$body_response" | python3 -m json.tool 2>/dev/null >&2 || echo "$body_response" >&2
            return 1
            ;;
        429)
            echo -e "${YELLOW}⚠ Rate Limited (429) - Too many requests${NC}" >&2
            return 1
            ;;
        500|502|503|504)
            echo -e "${RED}✗ Server Error (${http_code})${NC}" >&2
            echo "$body_response" >&2
            return 1
            ;;
        *)
            echo -e "${YELLOW}? Unexpected status: ${http_code}${NC}" >&2
            echo "$body_response" >&2
            return 1
            ;;
    esac
}

# GET request
api_get() {
    api_request "GET" "$1"
}

# POST request
api_post() {
    api_request "POST" "$1" "$2"
}

# PATCH request
api_patch() {
    api_request "PATCH" "$1" "$2"
}

# DELETE request
api_delete() {
    api_request "DELETE" "$1"
}

# Safe GET: capture response + preserve exit code
# Usage: api_get_safe <endpoint> response_var
# Sets response_var and returns api_get exit code
api_get_safe() {
    local endpoint="$1"
    local var_name="$2"
    eval "$var_name=\$(api_get \"$endpoint\")"
    return $?
}

# Safe POST
api_post_safe() {
    local endpoint="$1"
    local body="$2"
    local var_name="$3"
    eval "$var_name=\$(api_post \"$endpoint\" \"$body\")"
    return $?
}

# Safe PATCH
api_patch_safe() {
    local endpoint="$1"
    local body="$2"
    local var_name="$3"
    eval "$var_name=\$(api_patch \"$endpoint\" \"$body\")"
    return $?
}

# DELETE request
api_delete() {
    api_request "DELETE" "$1"
}

# ============================================
# Helper Functions
# ============================================

# Pretty print JSON
pretty_json() {
    python3 -m json.tool 2>/dev/null || cat
}

# Extract workspace slug from config or prompt
get_workspace_slug() {
    if [ -z "$PLANE_WORKSPACE_SLUG" ]; then
        echo -e "${RED}Error: PLANE_WORKSPACE_SLUG not set in config.env${NC}" >&2
        echo -e "${YELLOW}Set it with: export PLANE_WORKSPACE_SLUG=your-workspace-slug${NC}" >&2
        echo -e "${YELLOW}Or edit: skills/plane/config.env${NC}" >&2
        return 1
    fi
    echo "$PLANE_WORKSPACE_SLUG"
}

# Check required args
require_args() {
    local desc="$1"
    shift
    for arg in "$@"; do
        if [ -z "$arg" ]; then
            echo -e "${RED}Error: Missing required argument${NC}" >&2
            echo -e "${YELLOW}Usage: $desc${NC}" >&2
            return 1
        fi
    done
    return 0
}

# Build query params string
# Usage: build_query "key1=val1" "key2=val2"
build_query() {
    local params=""
    for p in "$@"; do
        if [ -n "$params" ]; then
            params+="&"
        fi
        params+="$p"
    done
    if [ -n "$params" ]; then
        echo "?${params}"
    fi
}

# Print header
print_header() {
    echo -e "\n${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${CYAN}  $1${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

# Print success
print_success() {
    echo -e "${GREEN}✓ $1${NC}" >&2
}

# Print error
print_error() {
    echo -e "${RED}✗ $1${NC}" >&2
}

# Print info
print_info() {
    echo -e "${CYAN}ℹ $1${NC}" >&2
}

# Print warning
print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Display help for CRUD operations
print_crud_help() {
    local name="$1"
    local script="$2"
    echo -e "${BOLD}Usage:${NC}"
    echo -e "  ${CYAN}$script list${NC}                    # List all $name"
    echo -e "  ${CYAN}$script get <id>${NC}               # Get $name by ID"
    echo -e "  ${CYAN}$script create <json_file>${NC}     # Create $name from JSON"
    echo -e "  ${CYAN}$script create-inline <json>${NC}   # Create $name from inline JSON"
    echo -e "  ${CYAN}$script update <id> <json_file>${NC} # Update $name"
    echo -e "  ${CYAN}$script delete <id>${NC}            # Delete $name"
    echo ""
    echo -e "${BOLD}Examples:${NC}"
    echo -e "  $script list"
    echo -e "  $script get abc-123-def"
    echo -e "  $script create data.json"
    echo -e "  $script create-inline '{\"name\": \"My $name\"}'"
    echo -e "  $script delete abc-123-def"
}
