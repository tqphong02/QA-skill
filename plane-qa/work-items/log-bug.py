#!/usr/bin/env python3
# ============================================================
# Plane — Log bug đúng format chuẩn (manual-friendly) + ảnh inline + assign
# ============================================================
# Tạo 1 hoặc nhiều bug theo format team: tiêu đề [Sprint][Module] + body có
# các mục in đậm (Dùng thiết bị / Precondition / Steps / Expected / Actual /
# Ghi chú kỹ thuật), assign cho reporter, **upload ảnh evidence lên Plane
# CDN rồi embed URL vào description** (mặc định) để xem inline không cần
# tải về. Có flag --attach để chỉ upload attachment (cũ).
#
# Dùng:
#   python3 work-items/log-bug.py bug.json              # upload + embed URL vào description (mặc định)
#   python3 work-items/log-bug.py bug.json --attach    # chỉ upload attachment, không embed
#   python3 work-items/log-bug.py bug.json --dry-run   # chỉ in payload, KHÔNG ghi
#
# Cấu trúc bug.json: xem ../bug-template.json
# ============================================================
import os, re, sys, json, uuid, urllib.request, urllib.error, urllib.parse

SKILL_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DEFAULTS = {
    "project_id": os.environ.get("PLANE_DEFAULT_PROJECT_ID", ""),
    "assignees": [],
}

def load_cfg():
    cfg = {
        "PLANE_BASE_URL": os.environ.get("PLANE_BASE_URL", "https://api.plane.so"),
        "PLANE_API_VERSION": os.environ.get("PLANE_API_VERSION", "v1"),
        "PLANE_WORKSPACE_SLUG": os.environ.get("PLANE_WORKSPACE_SLUG", ""),
        "PLANE_API_KEY": os.environ.get("PLANE_API_KEY", ""),
    }
    config_path = os.path.join(SKILL_DIR, "config.env")
    if not os.path.isfile(config_path):
        return cfg
    with open(config_path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            k = k.strip(); v = v.strip().strip('"')
            m = re.search(r":-(.*?)\}$", v)        # "${KEY:-default}"
            if m: v = m.group(1)
            cfg[k] = os.environ.get(k, v)
    return cfg

CFG = load_cfg()
BASE = f"{CFG['PLANE_BASE_URL']}/api/{CFG.get('PLANE_API_VERSION','v1')}"
SLUG = CFG["PLANE_WORKSPACE_SLUG"]
_KEY_SUFFIX = re.sub(r"[^A-Za-z0-9]+", "_", SLUG).strip("_").upper()
KEY  = os.environ.get(f"PLANE_API_KEY_{_KEY_SUFFIX}") if _KEY_SUFFIX else ""
KEY  = KEY or os.environ.get("PLANE_API_KEY") or CFG.get("PLANE_API_KEY", "")

def key_env_name(slug):
    suffix = re.sub(r"[^A-Za-z0-9]+", "_", slug).strip("_").upper()
    return f"PLANE_API_KEY_{suffix}"

def configure_from_url(url):
    """Select Plane base/workspace/key/project from a workspace or project URL."""
    global BASE, SLUG, KEY
    parsed = urllib.parse.urlparse(url)
    parts = [urllib.parse.unquote(part) for part in parsed.path.split("/") if part]
    if parsed.scheme not in ("http", "https") or not parsed.netloc or not parts:
        raise ValueError(f"Invalid Plane URL or missing workspace slug: {url}")
    CFG["PLANE_BASE_URL"] = f"{parsed.scheme}://{parsed.netloc}"
    CFG["PLANE_WORKSPACE_SLUG"] = parts[0]
    SLUG = parts[0]
    BASE = f"{CFG['PLANE_BASE_URL']}/api/{CFG.get('PLANE_API_VERSION','v1')}"
    KEY = os.environ.get(key_env_name(SLUG)) or os.environ.get("PLANE_API_KEY") or CFG.get("PLANE_API_KEY", "")
    if "projects" in parts:
        index = parts.index("projects")
        if index + 1 < len(parts):
            return parts[index + 1]
    return None

def api(method, path, body=None):
    if not KEY:
        raise RuntimeError("PLANE_API_KEY is not set. Run scripts/doctor.sh after exporting a new key.")
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method,
        headers={"X-API-Key": KEY, "Content-Type": "application/json", "Accept": "application/json"})
    with urllib.request.urlopen(req) as r:
        raw = r.read()
        return json.loads(raw) if raw else None

def resolve_state_id(pid, state_name):
    data = api("GET", f"/workspaces/{SLUG}/projects/{pid}/states/")
    states = data if isinstance(data, list) else data.get("results", [])
    wanted = state_name.strip().casefold()
    state = next((item for item in states
                  if str(item.get("name", "")).strip().casefold() == wanted), None)
    if not state:
        available = ", ".join(str(item.get("name", "")) for item in states)
        raise RuntimeError(f"State '{state_name}' not found. Available: {available}")
    return state["id"]

def esc(s):
    return (str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))

def as_list(value):
    if value is None:
        return []
    return value if isinstance(value, list) else [value]

EMOJI_RE = re.compile(
    "[\U0001F300-\U0001FAFF\U00002600-\U000027BF]",
    flags=re.UNICODE,
)

def validate_bug(b):
    """Return deterministic format errors before any Plane write."""
    errors = []
    required_scalars = ("sprint", "module", "symptom", "os", "browser",
                        "environment", "url", "test_account")
    required_lists = ("precondition", "steps", "expected", "actual", "evidence")
    for field in required_scalars:
        if not str(b.get(field, "")).strip():
            errors.append(f"missing required field: {field}")
    for field in required_lists:
        if not as_list(b.get(field)):
            errors.append(f"missing required list: {field}")

    title = title_of(b)
    if title and not re.match(r"^\[W\d{1,2}\]\[[^\]]+\]\s+\S", title):
        errors.append("title must match [W<week>][<Module>] <Vietnamese symptom>")
    if EMOJI_RE.search(title):
        errors.append("title contains emoji or decorative symbols")

    secret_fields = {"password", "mk", "api_key", "access_token", "refresh_token", "cookie"}
    for key, value in b.items():
        if key.lower() in secret_fields and value:
            errors.append(f"secret field is prohibited: {key}")
    return errors

def detect_mime(path):
    ext = os.path.splitext(path)[1].lower()
    return {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
            ".gif": "image/gif", ".webp": "image/webp"}.get(ext, "image/png")

def optimize_image(path):
    """Resize nếu >1600px + optimize PNG/JPEG để giảm size upload. Trả về (data, mime) hoặc (None, None) nếu lỗi."""
    try:
        from PIL import Image
        import io
        mime = detect_mime(path)
        with Image.open(path) as im:
            if im.width > 1600:
                ratio = 1600 / im.width
                im = im.resize((1600, int(im.height * ratio)), Image.LANCZOS)
            buf = io.BytesIO()
            save_kwargs = {"optimize": True}
            jpeg = ext_is_jpeg(path)
            if jpeg:
                save_kwargs["quality"] = 85
                if im.mode in ("RGBA", "P"):
                    im = im.convert("RGB")
            fmt = "JPEG" if jpeg else "PNG"
            im.save(buf, format=fmt, **save_kwargs)
            return buf.getvalue(), mime
    except Exception:
        with open(path, "rb") as f:
            return f.read(), detect_mime(path)

def ext_is_jpeg(path):
    return os.path.splitext(path)[1].lower() in (".jpg", ".jpeg")

def multipart(fields, filepath, data=None):
    boundary = "----plane" + uuid.uuid4().hex
    CRLF = b"\r\n"; buf = []
    for k, v in fields.items():
        buf += [b"--" + boundary.encode(),
                f'Content-Disposition: form-data; name="{k}"'.encode(), b"", str(v).encode()]
    payload = data if data is not None else open(filepath, "rb").read()
    buf += [b"--" + boundary.encode(),
            f'Content-Disposition: form-data; name="file"; filename="{os.path.basename(filepath)}"'.encode(),
            b"Content-Type: " + detect_mime(filepath).encode(), b"", payload]
    buf += [b"--" + boundary.encode() + b"--", b""]
    return CRLF.join(buf), "multipart/form-data; boundary=" + boundary

def upload_image(pid, iid, filepath):
    """Upload ảnh lên Plane S3. Trả về asset_id (để build URL) hoặc None nếu lỗi."""
    data, mime = optimize_image(filepath)
    if data is None:
        return None
    init = api("POST", f"/workspaces/{SLUG}/projects/{pid}/issues/{iid}/issue-attachments/",
               {"name": os.path.basename(filepath), "size": len(data), "type": mime})
    ud, asset_id = init["upload_data"], init["asset_id"]
    body, ct = multipart(ud["fields"], filepath, data=data)
    req = urllib.request.Request(ud["url"], data=body, method="POST", headers={"Content-Type": ct})
    urllib.request.urlopen(req).read()
    api("PATCH", f"/workspaces/{SLUG}/projects/{pid}/issues/{iid}/issue-attachments/{asset_id}/",
        {"is_uploaded": True})
    return asset_id

def build_inline_img(asset_id, filename, fallback_asset_url=None):
    """Build <img> tag với URL từ asset_id. URL pattern từ Plane API:
    {BASE_URL}/api/assets/v2/workspaces/{slug}/projects/{pid}/issues/{iid}/attachments/{asset_id}/"""
    if not asset_id:
        return ""
    url = (fallback_asset_url or
           f"{CFG['PLANE_BASE_URL']}/api/assets/v2/workspaces/{SLUG}/projects/{CFG.get('default_pid','')}/attachments/{asset_id}/")
    return (f'<p><img src="{url}" alt="{esc(filename)}" '
            f'style="max-width:100%;height:auto;border:1px solid #ddd;border-radius:4px;" /></p>')

def build_desc(b, evidence_items=None):
    """Build the canonical Plane bug body in the required section order."""
    h = []
    def scalar(label, value, link=False):
        if not value:
            return
        safe = esc(value)
        if link:
            safe = f'<a href="{safe}" target="_blank" rel="noopener noreferrer">{safe}</a>'
        h.append(f"<p><strong>{label}:</strong> {safe}</p>")

    scalar("OS", b.get("os"))
    scalar("Browser", b.get("browser"))
    scalar("Environment", b.get("environment"))
    scalar("URL", b.get("url"), link=True)
    scalar("Test account", b.get("test_account"))
    scalar("Test data", b.get("test_data"))

    def block(label, items, tag="ul"):
        items = as_list(items)
        if not items:
            return
        h.append(f"<p><strong>{label}:</strong></p><{tag}>" +
                  "".join(f"<li>{esc(x)}</li>" for x in items) + f"</{tag}>")
    block("Precondition", b.get("precondition"))
    block("Steps", b.get("steps"), "ol")
    block("Expected", b.get("expected"))
    block("Actual", b.get("actual"))

    evidence_names = [x[0] for x in evidence_items] if evidence_items else as_list(b.get("evidence"))
    block("Evidence", evidence_names)

    tech = b.get("technical_note", b.get("tech"))
    if tech:
        scalar("Technical note", tech)
    if evidence_items:
        for filename, asset_id, asset_url in evidence_items:
            h.append(build_inline_img(asset_id, filename, asset_url))
    return "".join(h)

def title_of(b):
    if b.get("title"): return b["title"]
    sprint = b.get("sprint", "")
    mod = b.get("module", "")
    tag = "".join(f"[{x}]" for x in (sprint, mod) if x)
    return f"{tag} {b.get('symptom','')}".strip()

def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry   = "--dry-run" in sys.argv
    attach_only = "--attach" in sys.argv
    if not args:
        print("Dùng: python3 log-bug.py <bug.json> [--dry-run] [--attach]")
        print("  (mặc định: upload ảnh + embed URL inline trong description)")
        print("  --attach: chỉ upload file attachment (cũ, cần tải về xem)")
        sys.exit(1)
    spec = json.load(open(args[0]))
    url_pid = configure_from_url(spec["url"]) if spec.get("url") else None
    pid   = url_pid or spec.get("project_id", DEFAULTS["project_id"])
    if not pid:
        raise SystemExit("Plane project ID is missing. Supply url or project_id in the JSON input.")
    if not dry and not SLUG:
        raise SystemExit("Plane workspace is missing. Supply a Plane URL or PLANE_WORKSPACE_SLUG.")
    CFG['default_pid'] = pid  # dùng cho build URL
    assg  = spec.get("assignees", DEFAULTS["assignees"])
    state_name = "Todo"
    state = None if dry else resolve_state_id(pid, state_name)
    cycle = spec.get("cycle_id")
    evdir = spec.get("evidence_dir", "")
    bugs  = spec.get("bugs", [spec] if "title" in spec or "symptom" in spec else [])

    mode_str = "attach-only" if attach_only else "upload+embed"
    created = []
    invalid_count = 0
    for b in bugs:
        format_errors = validate_bug(b)
        if format_errors:
            invalid_count += 1
            print(f"[FORMAT ERROR] {title_of(b) or '<untitled>'}")
            for err in format_errors:
                print(f"  - {err}")
            if not dry:
                print("No Plane work item was created. Fix the JSON and rerun --dry-run first.")
            continue
        title = title_of(b)
        prio = b.get("priority", "medium")
        evs = [os.path.join(evdir, e) if evdir and not os.path.isabs(e) else e
               for e in b.get("evidence", [])]
        miss = [e for e in evs if not os.path.exists(e)]

        # Dry-run: chỉ in payload
        if dry:
            n_evidence = sum(1 for e in evs if os.path.exists(e))
            print(f"[DRY] {prio:6} | {title} | state={state_name}")
            print(f"      {n_evidence} ảnh (sẽ upload + embed) | mode={mode_str}"
                  + (f" | THIẾU: {miss}" if miss else ""))
            continue

        # Tạo issue trước (chưa có evidence)
        desc = build_desc(b)  # tạm thời không có evidence
        res = api("POST", f"/workspaces/{SLUG}/projects/{pid}/work-items/",
                  {"name": title, "priority": prio, "state": state,
                   "assignees": assg, "description_html": desc})
        iid, seq = res["id"], res["sequence_id"]

        # Upload từng ảnh evidence, build URL inline
        evidence_items = []
        if not attach_only:
            for e in evs:
                if not os.path.exists(e):
                    continue
                try:
                    asset_id = upload_image(pid, iid, e)
                    asset_url = f"{CFG['PLANE_BASE_URL']}/api/assets/v2/workspaces/{SLUG}/projects/{pid}/issues/{iid}/attachments/{asset_id}/"
                    evidence_items.append((os.path.basename(e), asset_id, asset_url))
                except Exception as ex:
                    print(f"  ⚠ upload fail {e}: {ex}")

        # Update description với evidence inline
        if evidence_items:
            desc_with_img = build_desc(b, evidence_items)
            api("PATCH", f"/workspaces/{SLUG}/projects/{pid}/issues/{iid}/",
                {"description_html": desc_with_img})

        if cycle:
            api("POST", f"/workspaces/{SLUG}/projects/{pid}/cycles/{cycle}/cycle-issues/", {"issues": [iid]})
        img_n = len(evidence_items) if not attach_only else 0
        img_label = "ảnh inline" if not attach_only else "no inline"
        created.append((seq, prio, img_n, len(miss), title))
        print(f"  #{seq} | {prio:6} | {img_label} {img_n}"
              + (f" (thiếu {len(miss)})" if miss else "")
              + f" | {title}")
        print(f"        link: {CFG['PLANE_BASE_URL']}/{SLUG}/projects/{pid}/issues/{iid}/")
    if created and cycle:
        print(f"  → đã thêm {len(created)} ticket vào cycle {cycle}")
    if invalid_count:
        sys.exit(2)

if __name__ == "__main__":
    main()
