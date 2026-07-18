#!/bin/bash
# ============================================
# Plane Modules CRUD
# ============================================
# Endpoints:
#   List:      GET    /workspaces/{slug}/projects/{pid}/modules/
#   Create:    POST   /workspaces/{slug}/projects/{pid}/modules/
#   Get:       GET    /workspaces/{slug}/projects/{pid}/modules/{id}/
#   Update:    PATCH  /workspaces/{slug}/projects/{pid}/modules/{id}/
#   Delete:    DELETE /workspaces/{slug}/projects/{pid}/modules/{id}/
#   Archive:   POST   /workspaces/{slug}/projects/{pid}/modules/{id}/archive/
#   Unarchive: DELETE /workspaces/{slug}/projects/{pid}/modules/{id}/archive/
#   Add Work Items:    POST /workspaces/{slug}/projects/{pid}/modules/{id}/work-items/
#   List Work Items:   GET  /workspaces/{slug}/projects/{pid}/modules/{id}/work-items/
#   Remove Work Item:  DELETE /workspaces/{slug}/projects/{pid}/modules/{id}/work-items/{wi_id}/

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
# List Modules
# ============================================
list_modules() {
    local project_id
    project_id=$(get_project_id "$1") || return 1

    print_header "📦 Listing Modules"
    local slug
    slug=$(get_workspace_slug) || return 1

    local response
    response=$(api_get "/workspaces/${slug}/projects/${project_id}/modules/")
    exit_code=$?
    if [ $exit_code -eq 0 ]; then
        echo "$response" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    results = data if isinstance(data, list) else data.get('results', [])
    if not results:
        print('  No modules found.')
    for m in results:
        print(f\"  📦 {m.get('name', 'N/A')}\")
        print(f\"     ID: {m.get('id', 'N/A')}\")
        desc = (m.get('description_text') or m.get('description') or '')[:80]
        if desc:
            print(f\"     Description: {desc}\")
        print(f\"     Start: {m.get('start_date', 'N/A')}\")
        print(f\"     Target: {m.get('target_date', 'N/A')}\")
        print(f\"     Status: {m.get('status', 'N/A')}\")
        print()
except Exception as e:
    print(f'Error: {e}')
" 2>/dev/null
    fi
}

# ============================================
# Get Module Detail
# ============================================
get_module() {
    local module_id="$1"
    local project_id
    project_id=$(get_project_id "$2") || return 1

    require_args "get_module <module_id> [project_id]" "$module_id" || return 1

    print_header "📦 Module Detail"
    local slug
    slug=$(get_workspace_slug) || return 1

    local response
    response=$(api_get "/workspaces/${slug}/projects/${project_id}/modules/${module_id}/")
    exit_code=$?
    if [ $exit_code -eq 0 ]; then
        echo "$response" | pretty_json
    fi
}

# ============================================
# Create Module
# ============================================
create_module() {
    local project_id
    project_id=$(get_project_id "$1") || return 1
    local json_input="$2"

    if [ -f "$json_input" ]; then
        json_input=$(cat "$json_input")
    fi

    if [ -z "$json_input" ]; then
        print_error "No JSON data provided"
        echo -e "${YELLOW}Usage: create_module <project_id> <json_or_file>${NC}"
        echo ""
        echo -e "${CYAN}Example JSON:${NC}"
        cat << 'EOF'
{
    "name": "Authentication Module",
    "description": "Login, registration, and auth features",
    "start_date": "2024-01-15",
    "target_date": "2024-03-15",
    "status": "backlog"
}
EOF
        return 1
    fi

    print_header "➕ Creating Module"
    local slug
    slug=$(get_workspace_slug) || return 1

    local response
    response=$(api_post "/workspaces/${slug}/projects/${project_id}/modules/" "$json_input")
    exit_code=$?
    if [ $exit_code -eq 0 ]; then
        print_success "Module created!"
        echo "$response" | python3 -c "
import sys, json
try:
    m = json.load(sys.stdin)
    print(f\"  Name: {m.get('name', 'N/A')}\")
    print(f\"  ID: {m.get('id', 'N/A')}\")
except:
    print(sys.stdin.read())
" 2>/dev/null
    fi
}

# ============================================
# Update Module
# ============================================
update_module() {
    local module_id="$1"
    local project_id
    project_id=$(get_project_id "$2") || return 1
    local json_input="$3"

    require_args "update_module <module_id> <project_id> <json>" "$module_id" || return 1

    if [ -f "$json_input" ]; then
        json_input=$(cat "$json_input")
    fi

    print_header "✏️  Updating Module"
    local slug
    slug=$(get_workspace_slug) || return 1

    local response
    response=$(api_patch "/workspaces/${slug}/projects/${project_id}/modules/${module_id}/" "$json_input")
    exit_code=$?
    if [ $exit_code -eq 0 ]; then
        print_success "Module updated!"
    fi
}

# ============================================
# Delete Module
# ============================================
delete_module() {
    local module_id="$1"
    local project_id
    project_id=$(get_project_id "$2") || return 1

    require_args "delete_module <module_id> <project_id>" "$module_id" || return 1

    print_header "🗑️  Deleting Module"
    local slug
    slug=$(get_workspace_slug) || return 1

    echo -e "${YELLOW}⚠ Delete module: ${module_id}? (y/N):${NC} "
    read confirm
    [ "$confirm" = "y" ] || { print_warning "Cancelled"; return 0; }

    api_delete "/workspaces/${slug}/projects/${project_id}/modules/${module_id}/"
    [ $? -eq 0 ] && print_success "Module deleted!"
}

# ============================================
# Add Work Items to Module
# ============================================
add_module_work_items() {
    local module_id="$1"
    local project_id
    project_id=$(get_project_id "$2") || return 1
    local json_input="$3"

    require_args "add_module_work_items <module_id> <project_id> <json>" "$module_id" || return 1

    if [ -f "$json_input" ]; then
        json_input=$(cat "$json_input")
    fi

    print_header "📋 Adding Work Items to Module"
    local slug
    slug=$(get_workspace_slug) || return 1

    local response
    response=$(api_post "/workspaces/${slug}/projects/${project_id}/modules/${module_id}/work-items/" "$json_input")
    exit_code=$?
    if [ $exit_code -eq 0 ]; then
        print_success "Work items added to module!"
    fi
}

# ============================================
# List Module Work Items
# ============================================
list_module_work_items() {
    local module_id="$1"
    local project_id
    project_id=$(get_project_id "$2") || return 1

    require_args "list_module_work_items <module_id> [project_id]" "$module_id" || return 1

    print_header "📋 Module Work Items"
    local slug
    slug=$(get_workspace_slug) || return 1

    local response
    response=$(api_get "/workspaces/${slug}/projects/${project_id}/modules/${module_id}/work-items/")
    exit_code=$?
    if [ $exit_code -eq 0 ]; then
        echo "$response" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    results = data if isinstance(data, list) else data.get('results', [])
    if not results:
        print('  No work items in this module.')
    for item in results:
        seq_id = item.get('sequence_id', '?')
        print(f\"  #{seq_id} - {item.get('name', 'N/A')}\")
        print(f\"     ID: {item.get('id', 'N/A')}\")
        print()
except Exception as e:
    print(f'Error: {e}')
" 2>/dev/null
    fi
}

# ============================================
# Main CLI
# ============================================
case "${1:-}" in
    list|ls)
        list_modules "$2"
        ;;
    get|show)
        get_module "$2" "$3"
        ;;
    create|add|new)
        create_module "$2" "$3"
        ;;
    update|edit)
        update_module "$2" "$3" "$4"
        ;;
    delete|rm)
        delete_module "$2" "$3"
        ;;
    add-items)
        add_module_work_items "$2" "$3" "$4"
        ;;
    list-items)
        list_module_work_items "$2" "$3"
        ;;
    help|--help|-h|"")
        print_header "📦 Plane Modules CRUD"
        echo -e "${BOLD}Usage:${NC}"
        echo -e "  $0 list [project_id]                       # List modules"
        echo -e "  $0 get <module_id> [project_id]            # Get module detail"
        echo -e "  $0 create <project_id> <json>              # Create module"
        echo -e "  $0 update <module_id> <project_id> <json>  # Update module"
        echo -e "  $0 delete <module_id> <project_id>         # Delete module"
        echo -e "  $0 add-items <module_id> <project_id> <json>  # Add work items"
        echo -e "  $0 list-items <module_id> [project_id]     # List module work items"
        ;;
    *)
        echo -e "${RED}Unknown command: $1${NC}"
        echo "Run '$0 help' for usage"
        exit 1
        ;;
esac
