#!/bin/bash
# ============================================
# Plane Work Items (Issues) CRUD
# ============================================
# Endpoints:
#   List:      GET    /workspaces/{slug}/projects/{pid}/work-items/
#   Create:    POST   /workspaces/{slug}/projects/{pid}/work-items/
#   Get:       GET    /workspaces/{slug}/projects/{pid}/work-items/{id}/
#   Update:    PATCH  /workspaces/{slug}/projects/{pid}/work-items/{id}/
#   Delete:    DELETE /workspaces/{slug}/projects/{pid}/work-items/{id}/
#   Search:    GET    /workspaces/{slug}/projects/{pid}/work-items/search/

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../utils/common.sh"
source "$SCRIPT_DIR/../utils/paginate.sh"

# Get project ID from arg or config
get_project_id() {
    local pid="${1:-$PLANE_DEFAULT_PROJECT_ID}"
    if [ -z "$pid" ]; then
        print_error "No project ID provided. Set PLANE_DEFAULT_PROJECT_ID in config.env or pass as argument"
        return 1
    fi
    echo "$pid"
}

# ============================================
# List Work Items
# ============================================
list_work_items() {
    local project_id
    project_id=$(get_project_id "$1") || return 1

    print_header "📋 Listing Work Items"
    local slug
    slug=$(get_workspace_slug) || return 1

    local response
    response=$(api_get "/workspaces/${slug}/projects/${project_id}/work-items/")
    exit_code=$?
    if [ $exit_code -eq 0 ]; then
        echo "$response" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    results = data if isinstance(data, list) else data.get('results', [])
    if not results:
        print('  No work items found.')
    for item in results:
        seq_id = item.get('sequence_id', '?')
        name = item.get('name', 'N/A')
        state = item.get('state_detail', item.get('state', ''))
        if isinstance(state, dict):
            state = state.get('name', '')
        priority_map = {'none': '○', 'low': '↓', 'medium': '→', 'high': '↑', 'urgent': '⚡'}
        priority = priority_map.get(str(item.get('priority', 'none')).lower(), '○')
        assignees = item.get('assignee_details', item.get('assignees', []))
        if isinstance(assignees, list):
            assignees = ', '.join([a.get('display_name', a) if isinstance(a, dict) else str(a) for a in (assignees or [])])
        labels = item.get('labels_detail', item.get('labels', []))
        if isinstance(labels, list):
            label_names = [l.get('name', l) if isinstance(l, dict) else str(l) for l in (labels or [])]
            labels = ', '.join(label_names)
        print(f\"  {priority} #{seq_id} - {name}\")
        print(f\"     ID: {item.get('id', 'N/A')}\")
        print(f\"     State: {state}\")
        if labels:
            print(f\"     Labels: {labels}\")
        if assignees:
            print(f\"     Assignees: {assignees}\")
        print(f\"     Created: {item.get('created_at', 'N/A')[:10]}\")
        print()
except Exception as e:
    print(f'Error parsing: {e}')
    print(sys.stdin.read())
" 2>/dev/null
    fi
}

# ============================================
# Get Work Item Detail
# ============================================
get_work_item() {
    local work_item_id="$1"
    local project_id
    project_id=$(get_project_id "$2") || return 1

    require_args "get_work_item <work_item_id> [project_id]" "$work_item_id" || return 1

    print_header "🎫 Work Item Detail"
    local slug
    slug=$(get_workspace_slug) || return 1

    local response
    response=$(api_get "/workspaces/${slug}/projects/${project_id}/work-items/${work_item_id}/?expand=state,assignees,labels")
    exit_code=$?
    if [ $exit_code -eq 0 ]; then
        echo "$response" | python3 -c "
import sys, json
try:
    item = json.load(sys.stdin)
    seq_id = item.get('sequence_id', '?')
    print(f\"  #{seq_id} - {item.get('name', 'N/A')}\")
    print(f\"  ID: {item.get('id', 'N/A')}\")
    state = item.get('state_detail', item.get('state', 'N/A'))
    if isinstance(state, dict):
        state = state.get('name', 'N/A')
    print(f\"  State: {state}\")
    print(f\"  Priority: {item.get('priority', 'none')}\")
    desc = item.get('description_text') or item.get('description') or 'No description'
    print(f\"  Description: {desc[:200]}\")
    assignees = item.get('assignee_details', item.get('assignees', []))
    if isinstance(assignees, list):
        names = [a.get('display_name', a) if isinstance(a, dict) else str(a) for a in (assignees or [])]
        print(f\"  Assignees: {', '.join(names) or 'Unassigned'}\")
    labels = item.get('labels_detail', item.get('labels', []))
    if isinstance(labels, list):
        names = [l.get('name', l) if isinstance(l, dict) else str(l) for l in (labels or [])]
        print(f\"  Labels: {', '.join(names) or 'None'}\")
    print(f\"  Start Date: {item.get('start_date', 'N/A')}\")
    print(f\"  Target Date: {item.get('target_date', 'N/A')}\")
    print(f\"  Parent: {item.get('parent', 'None')}\")
    print(f\"  Created: {item.get('created_at', 'N/A')}\")
    print(f\"  Updated: {item.get('updated_at', 'N/A')}\")
    print(f\"  Created By: {item.get('created_by', 'N/A')}\")
except Exception as e:
    print(f'Error: {e}')
    print(sys.stdin.read())
" 2>/dev/null
    fi
}

# ============================================
# Create Work Item
# ============================================
create_work_item() {
    local project_id
    project_id=$(get_project_id "$1") || return 1
    local json_input="$2"

    if [ -f "$json_input" ]; then
        json_input=$(cat "$json_input")
    fi

    if [ -z "$json_input" ]; then
        print_error "No JSON data provided"
        echo -e "${YELLOW}Usage: create_work_item <project_id> <json_string_or_file>${NC}"
        echo -e "${YELLOW}Required fields: name${NC}"
        echo ""
        echo -e "${CYAN}Example JSON:${NC}"
        cat << 'EOF'
{
    "name": "Implement feature X",
    "description_html": "<p>Description of the work item</p>",
    "priority": "high",
    "state": "uuid-of-state",
    "assignees": ["uuid-of-user"],
    "labels": ["uuid-of-label"],
    "start_date": "2024-01-15",
    "target_date": "2024-02-15",
    "parent": "uuid-of-parent-issue"
}
EOF
        return 1
    fi

    print_header "➕ Creating Work Item"
    local slug
    slug=$(get_workspace_slug) || return 1

    local response
    response=$(api_post "/workspaces/${slug}/projects/${project_id}/work-items/" "$json_input")
    exit_code=$?
    if [ $exit_code -eq 0 ]; then
        print_success "Work item created!"
        echo "$response" | python3 -c "
import sys, json
try:
    item = json.load(sys.stdin)
    print(f\"  #{item.get('sequence_id', '?')} - {item.get('name', 'N/A')}\")
    print(f\"  ID: {item.get('id', 'N/A')}\")
except:
    print(sys.stdin.read())
" 2>/dev/null
    fi
}

# ============================================
# Update Work Item
# ============================================
update_work_item() {
    local work_item_id="$1"
    local project_id
    project_id=$(get_project_id "$2") || return 1
    local json_input="$3"

    require_args "update_work_item <work_item_id> <project_id> <json>" "$work_item_id" || return 1

    if [ -f "$json_input" ]; then
        json_input=$(cat "$json_input")
    fi

    if [ -z "$json_input" ]; then
        print_error "No JSON data provided"
        echo -e "${YELLOW}Usage: update_work_item <work_item_id> <project_id> <json_string_or_file>${NC}"
        return 1
    fi

    print_header "✏️  Updating Work Item"
    local slug
    slug=$(get_workspace_slug) || return 1

    local response
    response=$(api_patch "/workspaces/${slug}/projects/${project_id}/work-items/${work_item_id}/" "$json_input")
    exit_code=$?
    if [ $exit_code -eq 0 ]; then
        print_success "Work item updated!"
        echo "$response" | python3 -c "
import sys, json
try:
    item = json.load(sys.stdin)
    print(f\"  #{item.get('sequence_id', '?')} - {item.get('name', 'N/A')}\")
except:
    print(sys.stdin.read())
" 2>/dev/null
    fi
}

# ============================================
# Delete Work Item
# ============================================
delete_work_item() {
    local work_item_id="$1"
    local project_id
    project_id=$(get_project_id "$2") || return 1

    require_args "delete_work_item <work_item_id> <project_id>" "$work_item_id" || return 1

    print_header "🗑️  Deleting Work Item"
    local slug
    slug=$(get_workspace_slug) || return 1

    echo -e "${YELLOW}⚠ This will permanently delete work item: ${work_item_id}${NC}"
    read -p "Are you sure? (y/N): " confirm
    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        print_warning "Cancelled"
        return 0
    fi

    api_delete "/workspaces/${slug}/projects/${project_id}/work-items/${work_item_id}/"
    if [ $? -eq 0 ]; then
        print_success "Work item deleted!"
    fi
}

# ============================================
# Search Work Items
# ============================================
search_work_items() {
    local query="$1"
    local project_id
    project_id=$(get_project_id "$2") || return 1

    require_args "search_work_items <query> [project_id]" "$query" || return 1

    print_header "🔍 Searching Work Items: '$query'"
    local slug
    slug=$(get_workspace_slug) || return 1

    local response
    response=$(api_get "/workspaces/${slug}/projects/${project_id}/work-items/search/?search=${query}")
    exit_code=$?
    if [ $exit_code -eq 0 ]; then
        echo "$response" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    results = data if isinstance(data, list) else data.get('results', [])
    if not results:
        print('  No results found.')
    for item in results:
        seq_id = item.get('sequence_id', '?')
        print(f\"  #{seq_id} - {item.get('name', 'N/A')}\")
        print(f\"     ID: {item.get('id', 'N/A')}\")
        state = item.get('state_detail', item.get('state', ''))
        if isinstance(state, dict):
            state = state.get('name', '')
        print(f\"     State: {state}\")
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
        list_work_items "$2"
        ;;
    get|show)
        get_work_item "$2" "$3"
        ;;
    create|add|new)
        create_work_item "$2" "$3"
        ;;
    update|edit)
        update_work_item "$2" "$3" "$4"
        ;;
    delete|rm)
        delete_work_item "$2" "$3"
        ;;
    search|find)
        search_work_items "$2" "$3"
        ;;
    help|--help|-h|"")
        print_header "🎫 Plane Work Items CRUD"
        echo -e "${BOLD}Usage:${NC}"
        echo -e "  $0 list [project_id]                        # List work items"
        echo -e "  $0 get <item_id> [project_id]               # Get work item detail"
        echo -e "  $0 create <project_id> <json_or_file>       # Create work item"
        echo -e "  $0 update <item_id> <project_id> <json>     # Update work item"
        echo -e "  $0 delete <item_id> <project_id>            # Delete work item"
        echo -e "  $0 search <query> [project_id]              # Search work items"
        echo ""
        echo -e "${BOLD}Priority values:${NC} none, low, medium, high, urgent"
        ;;
    *)
        echo -e "${RED}Unknown command: $1${NC}"
        echo "Run '$0 help' for usage"
        exit 1
        ;;
esac
