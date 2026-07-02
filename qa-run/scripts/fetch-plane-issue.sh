#!/usr/bin/env bash
# Fetch 1 ticket từ Plane API theo (project_id, sequence_id) hoặc theo URL đầy đủ.
# Tương đương $fetch-jira-requirements của codex-testing-kit, port sang Plane.
#
# Cách 1 — theo URL:
#   ./fetch-plane-issue.sh "https://projects.metasolutions.ai/mds-team/projects/9482533a-.../issues/39/"
#
# Cách 2 — theo (project_id, sequence_id):
#   ./fetch-plane-issue.sh 9482533a-c9ca-4be6-be3f-2c74b1b54137 39
#
# Output: JSON đầy đủ của issue (name, description_html, state, priority, assignees, comments).
#
# Env cần có (đặt trong .env của project đang test, hoặc ~/.claude/skills/qa-run/config.env):
#   PLANE_API_KEY=plane_pat_xxx
#   PLANE_BASE_URL=https://projects.metasolutions.ai/api/v1
#   PLANE_WORKSPACE=mds-team
#
# Tuỳ chọn:
#   FORMAT=text     # in description dạng text (mặc định: json)
#   ONLY=field      # chỉ in 1 field, vd ONLY=name, ONLY=description_text
#   WITH_COMMENTS=1 # kèm comments
#   SAVE_OUT=path   # ghi JSON ra file thay vì stdout

set -euo pipefail

# --- Load .env (thử project trước, fallback skill global) ---
if [ -f "./.env" ]; then
  set -a; source ./.env; set +a
elif [ -f "$HOME/.claude/skills/qa-run/config.env" ]; then
  set -a; source "$HOME/.claude/skills/qa-run/config.env"; set +a
fi

# --- Check required env ---
: "${PLANE_API_KEY:?❌ Thiếu PLANE_API_KEY. Set trong .env hoặc ~/.claude/skills/qa-run/config.env}"
: "${PLANE_BASE_URL:?❌ Thiếu PLANE_BASE_URL. VD: https://projects.metasolutions.ai/api/v1}"
: "${PLANE_WORKSPACE:?❌ Thiếu PLANE_WORKSPACE. VD: mds-team}"

# --- Parse args ---
parse_url() {
  # Trích project_id + sequence_id từ URL
  # VD: .../projects/9482533a-c9ca-4be6-be3f-2c74b1b54137/issues/39/
  local url="$1"
  local pid; pid=$(echo "$url" | grep -oE 'projects/[^/]+' | head -1 | sed 's|projects/||')
  local seq; seq=$(echo "$url" | grep -oE 'issues/[^/]+' | head -1 | sed 's|issues/||' | tr -d '/')
  if [ -z "$pid" ] || [ -z "$seq" ]; then
    echo "❌ Không parse được URL: $url" >&2
    echo "   Cần dạng: https://.../projects/<UUID>/issues/<SEQ>/" >&2
    return 1
  fi
  echo "$pid" "$seq"
}

if [ $# -eq 1 ]; then
  read -r PROJECT_ID SEQ_ID < <(parse_url "$1")
elif [ $# -eq 2 ]; then
  PROJECT_ID="$1"
  SEQ_ID="$2"
else
  echo "Usage:"
  echo "  $0 <project_id> <sequence_id>"
  echo "  $0 <full_plane_issue_url>"
  exit 1
fi

# --- Bước 1: tìm issue ID từ sequence_id ---
LIST_URL="${PLANE_BASE_URL}/workspaces/${PLANE_WORKSPACE}/projects/${PROJECT_ID}/work-items/?sequence_id=${SEQ_ID}"
ISSUE_ID=$(curl -s -H "X-API-Key: ${PLANE_API_KEY}" "${LIST_URL}" \
  | python3 -c "import sys, json
try:
    data = json.load(sys.stdin)
    results = data.get('results', [])
    if not results:
        print('NOT_FOUND', file=sys.stderr)
        sys.exit(1)
    print(results[0]['id'])
except Exception as e:
    print(f'PARSE_ERROR: {e}', file=sys.stderr)
    sys.exit(1)")

if [ "$ISSUE_ID" = "NOT_FOUND" ]; then
  echo "❌ Không tìm thấy issue #${SEQ_ID} trong project ${PROJECT_ID}" >&2
  exit 2
fi

# --- Bước 2: fetch full issue ---
DETAIL_URL="${PLANE_BASE_URL}/workspaces/${PLANE_WORKSPACE}/projects/${PROJECT_ID}/work-items/${ISSUE_ID}/?expand=state,assignees,labels"
JSON=$(curl -s -H "X-API-Key: ${PLANE_API_KEY}" "${DETAIL_URL}")

# --- Tuỳ chọn comments ---
if [ "${WITH_COMMENTS:-0}" = "1" ]; then
  COMMENTS=$(curl -s -H "X-API-Key: ${PLANE_API_KEY}" \
    "${PLANE_BASE_URL}/workspaces/${PLANE_WORKSPACE}/projects/${PROJECT_ID}/work-items/${ISSUE_ID}/comments/")
  JSON=$(echo "$JSON" | python3 -c "
import sys, json
d = json.load(sys.stdin)
try:
    cmts = json.loads('''$COMMENTS''').get('results', [])
    d['comments'] = cmts
except: pass
print(json.dumps(d, ensure_ascii=False))
")
fi

# --- Output theo format ---
case "${FORMAT:-json}" in
  text)
    echo "$JSON" | python3 -c "
import sys, json
d = json.load(sys.stdin)
state = d.get('state', {})
state_name = state.get('name') if isinstance(state, dict) else ''
print(f'#{d.get(\"sequence_id\")}  {d.get(\"name\")}')
print(f'State: {state_name}  Priority: {d.get(\"priority\")}')
print(f'Project: {d.get(\"project\")}  ID: {d.get(\"id\")}')
print(f'Created: {d.get(\"created_at\")}  Updated: {d.get(\"updated_at\")}')
print(f'Start: {d.get(\"start_date\")}  Target: {d.get(\"target_date\")}')
print('---')
# Convert HTML → text thô
import re
desc = d.get('description_html', '') or ''
desc = re.sub(r'<br\s*/?>', '\n', desc)
desc = re.sub(r'</p>', '\n\n', desc)
desc = re.sub(r'<[^>]+>', '', desc)
desc = re.sub(r'&nbsp;', ' ', desc)
desc = re.sub(r'&amp;', '&', desc)
desc = re.sub(r'&lt;', '<', desc)
desc = re.sub(r'&gt;', '>', desc)
print(desc.strip()[:3000])
if 'comments' in d and d['comments']:
    print('\\n--- COMMENTS ---')
    for c in d['comments']:
        by = c.get('actor_detail', {}).get('display_name', '?') if isinstance(c.get('actor_detail'), dict) else c.get('actor', '?')
        print(f'\\n[{by}] {c.get(\"created_at\", \"\")[:19]}')
        cdesc = c.get('comment_html', '') or c.get('comment_stripped', '') or ''
        cdesc = re.sub(r'<br\s*/?>', '\n', cdesc)
        cdesc = re.sub(r'</p>', '\n\n', cdesc)
        cdesc = re.sub(r'<[^>]+>', '', cdesc)
        print(cdesc.strip()[:500])
"
    ;;
  json)
    if [ -n "${SAVE_OUT:-}" ]; then
      echo "$JSON" > "$SAVE_OUT"
      echo "✓ Saved to $SAVE_OUT"
    else
      echo "$JSON" | python3 -m json.tool
    fi
    ;;
  *)
    echo "$JSON"
    ;;
esac
