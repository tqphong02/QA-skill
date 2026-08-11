#!/bin/bash
# ============================================
# Plane Comments CRUD
# ============================================
# Endpoints:
#   List:    GET    /workspaces/{slug}/projects/{pid}/work-items/{wi_id}/comments/
#   Create:  POST   /workspaces/{slug}/projects/{pid}/work-items/{wi_id}/comments/
#   Get:     GET    /workspaces/{slug}/projects/{pid}/work-items/{wi_id}/comments/{id}/
#   Update:  PATCH  /workspaces/{slug}/projects/{pid}/work-items/{wi_id}/comments/{id}/
#   Delete:  DELETE /workspaces/{slug}/projects/{pid}/work-items/{wi_id}/comments/{id}/

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../utils/common.sh"

get_project_id() {
    local pid="${1:-$PLANE_DEFAULT_PROJECT_ID}"
    if [ -z "$pid" ]; then
        print_error "No project ID provided"
        return 1
    fi
    echo "$pid"
}

# ============================================
# List Comments
# ============================================
list_comments() {
    local work_item_id="$1"
    local project_id
    project_id=$(get_project_id "$2") || return 1

    require_args "list_comments <work_item_id> [project_id]" "$work_item_id" || return 1

    print_header "💬 Listing Comments"
    local slug
    slug=$(get_workspace_slug) || return 1

    local response
    response=$(api_get "/workspaces/${slug}/projects/${project_id}/work-items/${work_item_id}/comments/")
    exit_code=$?
    if [ $exit_code -eq 0 ]; then
        echo "$response" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    results = data if isinstance(data, list) else data.get('results', [])
    if not results:
        print('  No comments found.')
    for c in results:
        print(f\"  💬 Comment by: {c.get('actor_detail', {}).get('display_name', c.get('actor', 'N/A'))}\")
        print(f\"     ID: {c.get('id', 'N/A')}\")
        comment_text = c.get('comment_text', '') or ''
        if not comment_text:
            comment_text = (c.get('comment_html', '') or '')[:200]
        print(f\"     Text: {comment_text[:200]}\")
        print(f\"     Created: {c.get('created_at', 'N/A')[:16]}\")
        print()
except Exception as e:
    print(f'Error: {e}')
" 2>/dev/null
    fi
}

# ============================================
# Create Comment
# ============================================
create_comment() {
    local work_item_id="$1"
    local project_id
    project_id=$(get_project_id "$2") || return 1
    local json_input="$3"

    require_args "create_comment <work_item_id> <project_id> <json>" "$work_item_id" || return 1

    if [ -f "$json_input" ]; then
        json_input=$(cat "$json_input")
    fi

    if [ -z "$json_input" ]; then
        print_error "No JSON data provided"
        echo -e "${YELLOW}Usage: create_comment <work_item_id> <project_id> <json>${NC}"
        echo ""
        echo -e "${CYAN}Example:${NC}"
        echo '  {"comment_html": "<p>This is a comment</p>"}'
        return 1
    fi

    print_header "➕ Creating Comment"
    local slug
    slug=$(get_workspace_slug) || return 1

    local response
    response=$(api_post "/workspaces/${slug}/projects/${project_id}/work-items/${work_item_id}/comments/" "$json_input")
    exit_code=$?
    if [ $exit_code -eq 0 ]; then
        print_success "Comment created!"
    fi
}

# ============================================
# Update Comment
# ============================================
update_comment() {
    local comment_id="$1"
    local work_item_id="$2"
    local project_id
    project_id=$(get_project_id "$3") || return 1
    local json_input="$4"

    require_args "update_comment <comment_id> <work_item_id> <project_id> <json>" "$comment_id" "$work_item_id" || return 1

    if [ -f "$json_input" ]; then
        json_input=$(cat "$json_input")
    fi

    print_header "✏️  Updating Comment"
    local slug
    slug=$(get_workspace_slug) || return 1

    local response
    response=$(api_patch "/workspaces/${slug}/projects/${project_id}/work-items/${work_item_id}/comments/${comment_id}/" "$json_input")
    exit_code=$?
    if [ $exit_code -eq 0 ]; then
        print_success "Comment updated!"
    fi
}

# ============================================
# Delete Comment
# ============================================
delete_comment() {
    local comment_id="$1"
    local work_item_id="$2"
    local project_id
    project_id=$(get_project_id "$3") || return 1

    require_args "delete_comment <comment_id> <work_item_id> <project_id>" "$comment_id" "$work_item_id" || return 1

    print_header "🗑️  Deleting Comment"
    local slug
    slug=$(get_workspace_slug) || return 1

    api_delete "/workspaces/${slug}/projects/${project_id}/work-items/${work_item_id}/comments/${comment_id}/"
    [ $? -eq 0 ] && print_success "Comment deleted!"
}

# ============================================
# Main CLI
# ============================================
case "${1:-}" in
    list|ls)
        list_comments "$2" "$3"
        ;;
    create|add)
        create_comment "$2" "$3" "$4"
        ;;
    update|edit)
        update_comment "$2" "$3" "$4" "$5"
        ;;
    delete|rm)
        delete_comment "$2" "$3" "$4"
        ;;
    help|--help|-h|"")
        print_header "💬 Plane Comments CRUD"
        echo -e "${BOLD}Usage:${NC}"
        echo -e "  $0 list <work_item_id> [project_id]              # List comments"
        echo -e "  $0 create <work_item_id> <project_id> <json>     # Create comment"
        echo -e "  $0 update <comment_id> <work_item_id> <pid> <json> # Update comment"
        echo -e "  $0 delete <comment_id> <work_item_id> <project_id> # Delete comment"
        ;;
    *)
        echo -e "${RED}Unknown command: $1${NC}"
        echo "Run '$0 help' for usage"
        exit 1
        ;;
esac
