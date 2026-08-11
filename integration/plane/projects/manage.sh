#!/bin/bash
# ============================================
# Plane Projects CRUD
# ============================================
# Endpoints:
#   List:     GET    /workspaces/{slug}/projects/
#   Create:   POST   /workspaces/{slug}/projects/
#   Get:      GET    /workspaces/{slug}/projects/{id}/
#   Update:   PATCH  /workspaces/{slug}/projects/{id}/
#   Delete:   DELETE /workspaces/{slug}/projects/{id}/
#   Archive:  POST   /workspaces/{slug}/projects/{id}/archive/
#   Unarchive: DELETE /workspaces/{slug}/projects/{id}/archive/

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../utils/common.sh"
source "$SCRIPT_DIR/../utils/paginate.sh"

# ============================================
# List Projects
# ============================================
list_projects() {
    print_header "📋 Listing Projects"
    local slug
    slug=$(get_workspace_slug) || return 1

    local response
    local exit_code
    response=$(api_get "/workspaces/${slug}/projects/")
    exit_code=$?
    if [ $exit_code -eq 0 ]; then
        echo "$response" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    results = data if isinstance(data, list) else data.get('results', data.get('projects', []))
    if not results:
        print('  No projects found.')
    for p in results:
        print(f\"  📁 {p.get('name', 'N/A')}\")
        print(f\"     ID: {p.get('id', 'N/A')}\")
        print(f\"     Identifier: {p.get('identifier', 'N/A')}\")
        print(f\"     Description: {(p.get('description_text') or p.get('description') or 'No description')[:80]}\")
        print(f\"     Members: {p.get('total_members', 0)} | Cycles: {p.get('total_cycles', 0)} | Modules: {p.get('total_modules', 0)}\")
        print(f\"     Network: {'Public' if p.get('network') == 2 else 'Secret'}\")
        print(f\"     Created: {p.get('created_at', 'N/A')[:10]}\")
        print()
except Exception as e:
    print(f'Error parsing response: {e}')
    print(sys.stdin.read())
" 2>/dev/null
    fi
}

# ============================================
# Get Project Detail
# ============================================
get_project() {
    local project_id="$1"
    require_args "get_project <project_id>" "$project_id" || return 1

    print_header "📁 Project Detail"
    local slug
    slug=$(get_workspace_slug) || return 1

    local response
    response=$(api_get "/workspaces/${slug}/projects/${project_id}/")
    if [ $? -eq 0 ]; then
        echo "$response" | python3 -c "
import sys, json
try:
    p = json.load(sys.stdin)
    print(f\"  Name: {p.get('name', 'N/A')}\")
    print(f\"  ID: {p.get('id', 'N/A')}\")
    print(f\"  Identifier: {p.get('identifier', 'N/A')}\")
    desc = p.get('description_text') or p.get('description') or 'No description'
    print(f\"  Description: {desc}\")
    print(f\"  Network: {'Public' if p.get('network') == 2 else 'Secret'}\")
    print(f\"  Members: {p.get('total_members', 0)}\")
    print(f\"  Cycles: {p.get('total_cycles', 0)}\")
    print(f\"  Modules: {p.get('total_modules', 0)}\")
    print(f\"  Cover Image: {p.get('cover_image', 'None')}\")
    print(f\"  Emoji: {p.get('emoji', 'None')}\")
    print(f\"  Module View: {p.get('module_view', False)}\")
    print(f\"  Cycle View: {p.get('cycle_view', False)}\")
    print(f\"  Page View: {p.get('page_view', False)}\")
    print(f\"  Inbox View: {p.get('inbox_view', False)}\")
    print(f\"  Archive In: {p.get('archive_in', 0)} months\")
    print(f\"  Close In: {p.get('close_in', 0)} months\")
    print(f\"  Created: {p.get('created_at', 'N/A')}\")
    print(f\"  Updated: {p.get('updated_at', 'N/A')}\")
    print(f\"  Created By: {p.get('created_by', 'N/A')}\")
    print(f\"  Project Lead: {p.get('project_lead', 'N/A')}\")
    print(f\"  Default Assignee: {p.get('default_assignee', 'N/A')}\")
except Exception as e:
    print(f'Error: {e}')
    print(sys.stdin.read())
" 2>/dev/null
    fi
}

# ============================================
# Create Project
# ============================================
create_project() {
    local json_input="$1"

    if [ -f "$json_input" ]; then
        json_input=$(cat "$json_input")
    fi

    if [ -z "$json_input" ]; then
        print_error "No JSON data provided"
        echo -e "${YELLOW}Usage: create_project <json_string_or_file>${NC}"
        echo -e "${YELLOW}Required fields: name, identifier${NC}"
        echo ""
        echo -e "${CYAN}Example JSON:${NC}"
        cat << 'EOF'
{
    "name": "My Project",
    "identifier": "MYPROJ",
    "description": "Project description",
    "network": 2,
    "cover_image": "",
    "emoji": "",
    "module_view": true,
    "cycle_view": true,
    "page_view": true,
    "inbox_view": false
}
EOF
        return 1
    fi

    print_header "➕ Creating Project"
    local slug
    slug=$(get_workspace_slug) || return 1

    local response
    response=$(api_post "/workspaces/${slug}/projects/" "$json_input")
    if [ $? -eq 0 ]; then
        print_success "Project created!"
        echo "$response" | python3 -c "
import sys, json
try:
    p = json.load(sys.stdin)
    print(f\"  Name: {p.get('name', 'N/A')}\")
    print(f\"  ID: {p.get('id', 'N/A')}\")
    print(f\"  Identifier: {p.get('identifier', 'N/A')}\")
except:
    print(sys.stdin.read())
" 2>/dev/null
    fi
}

# ============================================
# Update Project
# ============================================
update_project() {
    local project_id="$1"
    local json_input="$2"

    require_args "update_project <project_id> <json_string_or_file>" "$project_id" || return 1

    if [ -f "$json_input" ]; then
        json_input=$(cat "$json_input")
    fi

    if [ -z "$json_input" ]; then
        print_error "No JSON data provided"
        echo -e "${YELLOW}Usage: update_project <project_id> <json_string_or_file>${NC}"
        echo -e "${YELLOW}Updatable fields: name, description, network, cover_image, emoji, module_view, cycle_view, page_view, inbox_view, default_assignee, project_lead${NC}"
        return 1
    fi

    print_header "✏️  Updating Project"
    local slug
    slug=$(get_workspace_slug) || return 1

    local response
    response=$(api_patch "/workspaces/${slug}/projects/${project_id}/" "$json_input")
    if [ $? -eq 0 ]; then
        print_success "Project updated!"
        echo "$response" | python3 -c "
import sys, json
try:
    p = json.load(sys.stdin)
    print(f\"  Name: {p.get('name', 'N/A')}\")
    print(f\"  ID: {p.get('id', 'N/A')}\")
except:
    print(sys.stdin.read())
" 2>/dev/null
    fi
}

# ============================================
# Delete Project
# ============================================
delete_project() {
    local project_id="$1"
    require_args "delete_project <project_id>" "$project_id" || return 1

    print_header "🗑️  Deleting Project"
    local slug
    slug=$(get_workspace_slug) || return 1

    # Confirm
    echo -e "${YELLOW}⚠ This will permanently delete project: ${project_id}${NC}"
    read -p "Are you sure? (y/N): " confirm
    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        print_warning "Cancelled"
        return 0
    fi

    api_delete "/workspaces/${slug}/projects/${project_id}/"
}

# ============================================
# Archive Project
# ============================================
archive_project() {
    local project_id="$1"
    require_args "archive_project <project_id>" "$project_id" || return 1

    print_header "📦 Archiving Project"
    local slug
    slug=$(get_workspace_slug) || return 1

    api_post "/workspaces/${slug}/projects/${project_id}/archive/" "{}"
    if [ $? -eq 0 ]; then
        print_success "Project archived!"
    fi
}

# ============================================
# Unarchive Project
# ============================================
unarchive_project() {
    local project_id="$1"
    require_args "unarchive_project <project_id>" "$project_id" || return 1

    print_header "📤 Unarchiving Project"
    local slug
    slug=$(get_workspace_slug) || return 1

    api_delete "/workspaces/${slug}/projects/${project_id}/archive/"
    if [ $? -eq 0 ]; then
        print_success "Project unarchived!"
    fi
}

# ============================================
# Main CLI
# ============================================
case "${1:-}" in
    list|ls)
        list_projects
        ;;
    get|show)
        get_project "$2"
        ;;
    create|add|new)
        create_project "$2"
        ;;
    update|edit)
        update_project "$2" "$3"
        ;;
    delete|rm)
        delete_project "$2"
        ;;
    archive)
        archive_project "$2"
        ;;
    unarchive)
        unarchive_project "$2"
        ;;
    help|--help|-h|"")
        print_header "📁 Plane Projects CRUD"
        echo -e "${BOLD}Usage:${NC}"
        echo -e "  $0 list                           # List all projects"
        echo -e "  $0 get <project_id>               # Get project detail"
        echo -e "  $0 create <json_or_file>          # Create project"
        echo -e "  $0 update <id> <json_or_file>     # Update project"
        echo -e "  $0 delete <project_id>            # Delete project"
        echo -e "  $0 archive <project_id>           # Archive project"
        echo -e "  $0 unarchive <project_id>         # Unarchive project"
        echo ""
        echo -e "${BOLD}Examples:${NC}"
        echo -e "  $0 list"
        echo -e "  $0 get abc-123-def"
        echo -e "  $0 create '{\"name\":\"My Project\",\"identifier\":\"MYPROJ\"}'"
        echo -e "  $0 update abc-123-def '{\"description\":\"Updated desc\"}'"
        echo -e "  $0 delete abc-123-def"
        ;;
    *)
        echo -e "${RED}Unknown command: $1${NC}"
        echo "Run '$0 help' for usage"
        exit 1
        ;;
esac
