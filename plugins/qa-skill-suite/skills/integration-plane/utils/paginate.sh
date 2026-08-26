#!/bin/bash
# ============================================
# Plane API Pagination Helper
# ============================================

# Fetch all pages from a paginated endpoint
# Usage: fetch_all_pages <endpoint> [per_page]
# Returns: concatenated JSON array of all results
fetch_all_pages() {
    local endpoint="$1"
    local per_page="${2:-100}"
    local all_results="[]"
    local cursor=""
    local has_more=true
    local page=0

    while [ "$has_more" = true ]; do
        local query=""
        if [ -n "$cursor" ]; then
            query="?per_page=${per_page}&cursor=${cursor}"
        else
            query="?per_page=${per_page}"
        fi

        local response
        response=$(api_get "${endpoint}${query}")

        if [ $? -ne 0 ]; then
            echo "$response"
            return 1
        fi

        # Extract results
        local results
        results=$(echo "$response" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(json.dumps(data.get('results', [])))
except:
    print('[]')
" 2>/dev/null)

        # Merge results
        all_results=$(echo "$all_results" "$results" | python3 -c "
import sys, json
try:
    arr1 = json.loads(sys.stdin.readline())
    arr2 = json.loads(sys.stdin.readline())
    print(json.dumps(arr1 + arr2))
except:
    print(sys.stdin.read())
" 2>/dev/null)

        # Check for next page
        local next_page
        next_page=$(echo "$response" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(str(data.get('next_page_results', False)).lower())
except:
    print('false')
" 2>/dev/null)

        if [ "$next_page" = "true" ]; then
            cursor=$(echo "$response" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('next_cursor', ''))
except:
    print('')
" 2>/dev/null)
            page=$((page + 1))
            print_info "Fetched page $((page + 1))..."
        else
            has_more=false
        fi
    done

    echo "$all_results"
}

# Fetch a single page
# Usage: fetch_page <endpoint> [page_size] [cursor]
fetch_page() {
    local endpoint="$1"
    local per_page="${2:-20}"
    local cursor="$3"

    local query="?per_page=${per_page}"
    if [ -n "$cursor" ]; then
        query+="&cursor=${cursor}"
    fi

    api_get "${endpoint}${query}"
}
