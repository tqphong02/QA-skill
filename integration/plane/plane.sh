#!/bin/bash
# ============================================
# Plane CLI - Project Management CRUD Tool
# ============================================
# Main entry point for all Plane operations
# Usage: ./plane.sh <resource> <action> [args...]

PLANE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$PLANE_ROOT/utils/common.sh"

# Make scripts executable
chmod +x "$PLANE_ROOT/projects/manage.sh" 2>/dev/null
chmod +x "$PLANE_ROOT/work-items/manage.sh" 2>/dev/null
chmod +x "$PLANE_ROOT/cycles/manage.sh" 2>/dev/null
chmod +x "$PLANE_ROOT/modules/manage.sh" 2>/dev/null
chmod +x "$PLANE_ROOT/comments/manage.sh" 2>/dev/null

RESOURCE="${1:-}"
ACTION="${2:-}"
shift 2 2>/dev/null

case "$RESOURCE" in
    doctor|auth)
        "$PLANE_ROOT/scripts/doctor.sh"
        ;;
    project|projects|p)
        "$PLANE_ROOT/projects/manage.sh" "$ACTION" "$@"
        ;;
    issue|issues|work-item|work-items|wi|i)
        "$PLANE_ROOT/work-items/manage.sh" "$ACTION" "$@"
        ;;
    cycle|cycles|c)
        "$PLANE_ROOT/cycles/manage.sh" "$ACTION" "$@"
        ;;
    module|modules|m)
        "$PLANE_ROOT/modules/manage.sh" "$ACTION" "$@"
        ;;
    comment|comments|cm)
        "$PLANE_ROOT/comments/manage.sh" "$ACTION" "$@"
        ;;
    help|--help|-h|"")
        print_header "🛩️  Plane CLI - Project Management CRUD"
        echo -e "${BOLD}Usage:${NC}"
        echo -e "  ./plane.sh <resource> <action> [args...]"
        echo ""
        echo -e "${BOLD}Resources:${NC}"
        echo -e "  ${CYAN}project${NC}   (p)    - Manage projects"
        echo -e "  ${CYAN}issue${NC}     (i)    - Manage work items / issues"
        echo -e "  ${CYAN}cycle${NC}     (c)    - Manage cycles (sprints)"
        echo -e "  ${CYAN}module${NC}    (m)    - Manage modules"
        echo -e "  ${CYAN}comment${NC}   (cm)   - Manage work item comments"
        echo -e "  ${CYAN}doctor${NC}          - Check Plane configuration and API authentication"
        echo ""
        echo -e "${BOLD}Common Actions:${NC}"
        echo -e "  list       - List all items"
        echo -e "  get <id>   - Get item detail"
        echo -e "  create     - Create new item (requires JSON data)"
        echo -e "  update     - Update item (requires JSON data)"
        echo -e "  delete     - Delete item"
        echo ""
        echo -e "${BOLD}Quick Examples:${NC}"
        echo -e "  ${GREEN}./plane.sh project list${NC}"
        echo -e "  ${GREEN}./plane.sh issue list <project_id>${NC}"
        echo -e "  ${GREEN}./plane.sh project create '{\"name\":\"My Project\",\"identifier\":\"MYPROJ\"}'${NC}"
        echo -e "  ${GREEN}./plane.sh issue create <project_id> '{\"name\":\"New task\"}'${NC}"
        echo -e "  ${GREEN}./plane.sh cycle list <project_id>${NC}"
        echo -e "  ${GREEN}./plane.sh module create <project_id> '{\"name\":\"Auth Module\"}'${NC}"
        echo -e "  ${GREEN}./plane.sh comment list <work_item_id> <project_id>${NC}"
        echo ""
        echo -e "${BOLD}Config:${NC}"
        echo -e "  Export credentials before starting Codex:"
        echo -e "    PLANE_API_KEY          - Personal API key (never store in this repo)"
        echo -e "  Non-secret defaults are read from ${YELLOW}$PLANE_ROOT/.env${NC} or config.env:"
        echo -e "    PLANE_WORKSPACE_SLUG   - Your workspace slug"
        echo -e "    PLANE_DEFAULT_PROJECT_ID - Default project ID (optional)"
        echo ""
        echo -e "${BOLD}Docs:${NC}"
        echo -e "  https://developers.plane.so/api-reference/introduction"
        ;;
    *)
        print_error "Unknown resource: $RESOURCE"
        echo "Run './plane.sh help' for usage"
        exit 1
        ;;
esac
