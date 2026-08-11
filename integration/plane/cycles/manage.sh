#!/bin/bash
# ============================================
# Plane Cycles CRUD
# ============================================
# Endpoints:
#   List:      GET    /workspaces/{slug}/projects/{pid}/cycles/
#   Create:    POST   /workspaces/{slug}/projects/{pid}/cycles/
#   Get:       GET    /workspaces/{slug}/projects/{pid}/cycles/{id}/
#   Update:    PATCH  /workspaces/{slug}/projects/{pid}/cycles/{id}/
#   Delete:    DELETE /workspaces/{slug}/projects/{pid}/cycles/{id}/
#   Archive:   POST   /workspaces/{slug}/projects/{pid}/cycles/{id}/archive/
#   Unarchive: DELETE /workspaces/{slug}/projects/{pid}/cycles/{id}/archive/
#   Add Work Items:    POST /workspaces/{slug}/projects/{pid}/cycles/{id}/work-items/
#   List Work Items:   GET  /workspaces/{slug}/projects/{pid}/cycles/{id}/work-items/
#   Remove Work Item:  DELETE /workspaces/{slug}/projects/{pid}/cycles/{id}/work-items/{wi_id}/

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
# List Cycles
# ============================================
list_cycles() {
    local project_id
    project_id=$(get_project_id "$1") || return 1

    print_header "🔄 Listing Cycles"
    local slug
    slug=$(get_workspace_slug) || return 1

    local response
    response=$(api_get "/workspaces/${slug}/projects/${project_id}/cycles/")
    exit_code=$?
    if [ $exit_code -eq 0 ]; then
        echo "$response" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    results = data if isinstance(data, list) else data.get('results', [])
    if not results:
        print('  No cycles found.')
    for c in results:
        print(f\"  🔄 {c.get('name', 'N/A')}\")
        print(f\"     ID: {c.get('id', 'N/A')}\")
        print(f\"     Start: {c.get('start_date', 'N/A')}\")
        print(f\"     End: {c.get('end_date', 'N/A')}\")
        print(f\"     Created: {c.get('created_at', 'N/A')[:10]}\")
        print()
except Exception as e:
    print(f'Error: {e}')
" 2>/dev/null
    fi
}

# ============================================
# Get Cycle Detail
# ============================================
get_cycle() {
    local cycle_id="$1"
    local project_id
    project_id=$(get_project_id "$2") || return 1

    require_args "get_cycle <cycle_id> [project_id]" "$cycle_id" || return 1

    print_header "🔄 Cycle Detail"
    local slug
    slug=$(get_workspace_slug) || return 1

    local response
    response=$(api_get "/workspaces/${slug}/projects/${project_id}/cycles/${cycle_id}/")
    exit_code=$?
    if [ $exit_code -eq 0 ]; then
        echo "$response" | pretty_json
    fi
}

# ============================================
# Create Cycle
# ============================================
create_cycle() {
    local project_id
    project_id=$(get_project_id "$1") || return 1
    local json_input="$2"

    if [ -f "$json_input" ]; then
        json_input=$(cat "$json_input")
    fi

    if [ -z "$json_input" ]; then
        print_error "No JSON data provided"
        echo -e "${YELLOW}Usage: create_cycle <project_id> <json_or_file>${NC}"
        echo ""
        echo -e "${CYAN}Example JSON:${NC}"
        cat << 'EOF'
{
    "name": "Sprint 1",
    "description": "First sprint",
    "start_date": "2024-01-15",
    "end_date": "2024-01-29",
    "project_id": "uuid-of-project"
}
EOF
        return 1
    fi

    print_header "➕ Creating Cycle"
    local slug
    slug=$(get_workspace_slug) || return 1

    local response
    response=$(api_post "/workspaces/${slug}/projects/${project_id}/cycles/" "$json_input")
    exit_code=$?
    if [ $exit_code -eq 0 ]; then
        print_success "Cycle created!"
        echo "$response" | python3 -c "
import sys, json
try:
    c = json.load(sys.stdin)
    print(f\"  Name: {c.get('name', 'N/A')}\")
    print(f\"  ID: {c.get('id', 'N/A')}\")
except:
    print(sys.stdin.read())
" 2>/dev/null
    fi
}

# ============================================
# Update Cycle
# ============================================
update_cycle() {
    local cycle_id="$1"
    local project_id
    project_id=$(get_project_id "$2") || return 1
    local json_input="$3"

    require_args "update_cycle <cycle_id> <project_id> <json>" "$cycle_id" || return 1

    if [ -f "$json_input" ]; then
        json_input=$(cat "$json_input")
    fi

    print_header "✏️  Updating Cycle"
    local slug
    slug=$(get_workspace_slug) || return 1

    local response
    response=$(api_patch "/workspaces/${slug}/projects/${project_id}/cycles/${cycle_id}/" "$json_input")
    exit_code=$?
    if [ $exit_code -eq 0 ]; then
        print_success "Cycle updated!"
    fi
}

# ============================================
# Delete Cycle
# ============================================
delete_cycle() {
    local cycle_id="$1"
    local project_id
    project_id=$(get_project_id "$2") || return 1

    require_args "delete_cycle <cycle_id> <project_id>" "$cycle_id" || return 1

    print_header "🗑️  Deleting Cycle"
    local slug
    slug=$(get_workspace_slug) || return 1

    echo -e "${YELLOW}⚠ Delete cycle: ${cycle_id}? (y/N):${NC} "
    read confirm
    [ "$confirm" = "y" ] || { print_warning "Cancelled"; return 0; }

    api_delete "/workspaces/${slug}/projects/${project_id}/cycles/${cycle_id}/"
    [ $? -eq 0 ] && print_success "Cycle deleted!"
}

# ============================================
# Add Work Items to Cycle
# ============================================
add_cycle_work_items() {
    local cycle_id="$1"
    local project_id
    project_id=$(get_project_id "$2") || return 1
    local json_input="$3"

    require_args "add_cycle_work_items <cycle_id> <project_id> <json>" "$cycle_id" || return 1

    if [ -f "$json_input" ]; then
        json_input=$(cat "$json_input")
    fi

    print_header "📋 Adding Work Items to Cycle"
    local slug
    slug=$(get_workspace_slug) || return 1

    local response
    response=$(api_post "/workspaces/${slug}/projects/${project_id}/cycles/${cycle_id}/work-items/" "$json_input")
    exit_code=$?
    if [ $exit_code -eq 0 ]; then
        print_success "Work items added to cycle!"
    fi
}

# ============================================
# List Cycle Work Items
# ============================================
list_cycle_work_items() {
    local cycle_id="$1"
    local project_id
    project_id=$(get_project_id "$2") || return 1

    require_args "list_cycle_work_items <cycle_id> [project_id]" "$cycle_id" || return 1

    print_header "📋 Cycle Work Items"
    local slug
    slug=$(get_workspace_slug) || return 1

    local response
    response=$(api_get "/workspaces/${slug}/projects/${project_id}/cycles/${cycle_id}/work-items/")
    exit_code=$?
    if [ $exit_code -eq 0 ]; then
        echo "$response" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    results = data if isinstance(data, list) else data.get('results', [])
    if not results:
        print('  No work items in this cycle.')
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
        list_cycles "$2"
        ;;
    get|show)
        get_cycle "$2" "$3"
        ;;
    create|add|new)
        create_cycle "$2" "$3"
        ;;
    update|edit)
        update_cycle "$2" "$3" "$4"
        ;;
    delete|rm)
        delete_cycle "$2" "$3"
        ;;
    add-items)
        add_cycle_work_items "$2" "$3" "$4"
        ;;
    list-items)
        list_cycle_work_items "$2" "$3"
        ;;
    help|--help|-h|"")
        print_header "🔄 Plane Cycles CRUD"
        echo -e "${BOLD}Usage:${NC}"
        echo -e "  $0 list [project_id]                      # List cycles"
        echo -e "  $0 get <cycle_id> [project_id]            # Get cycle detail"
        echo -e "  $0 create <project_id> <json>             # Create cycle"
        echo -e "  $0 update <cycle_id> <project_id> <json>  # Update cycle"
        echo -e "  $0 delete <cycle_id> <project_id>         # Delete cycle"
        echo -e "  $0 add-items <cycle_id> <project_id> <json>  # Add work items"
        echo -e "  $0 list-items <cycle_id> [project_id]     # List cycle work items"
        ;;
    *)
        echo -e "${RED}Unknown command: $1${NC}"
        echo "Run '$0 help' for usage"
        exit 1
        ;;
esac
