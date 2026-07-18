#!/usr/bin/env python3
# ============================================================
# Plane — Inline image helper (ảnh hiện THẲNG trong comment/description, không bắt tải về)
# ============================================================
# Cơ chế: API key chỉ upload được qua `issue-attachments` (lấy asset_id), rồi nhúng
# node TipTap <image-component src=asset_id ...> mà editor instance dùng -> render inline.
# KHÔNG chèn icon/emoji vào nội dung. Dùng chung cho comment + log-bug.
#
# Dùng như module:
#   from utils.inline_image import Client
#   c = Client()                                  # đọc config.env
#   pid, iid = c.resolve("PROJ-1")               # hoặc truyền thẳng (pid, iid)
#   c.post_comment(pid, iid, "Nội dung text", ["evidence/a.png", "evidence/b.png"])
# ============================================================
import os, re, json, uuid, struct, urllib.request, urllib.parse

SKILL_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _load_cfg():
    cfg = {
        "PLANE_BASE_URL": os.environ.get("PLANE_BASE_URL", "https://api.plane.so"),
        "PLANE_API_VERSION": os.environ.get("PLANE_API_VERSION", "v1"),
        "PLANE_WORKSPACE_SLUG": os.environ.get("PLANE_WORKSPACE_SLUG", ""),
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
            m = re.search(r":-(.*?)\}$", v)          # "${KEY:-default}"
            if m:
                v = m.group(1)
            cfg[k] = os.environ.get(k, v)
    return cfg


def _esc(s):
    return (str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def _key_env_name(slug):
    suffix = re.sub(r"[^A-Za-z0-9]+", "_", slug).strip("_").upper()
    return f"PLANE_API_KEY_{suffix}"


def _select_key(cfg, slug):
    return os.environ.get(_key_env_name(slug)) or os.environ.get("PLANE_API_KEY") or cfg.get("PLANE_API_KEY", "")


def _img_size(path):
    """Trả (w, h). Hỗ trợ PNG + JPEG; fallback (600, 400)."""
    try:
        with open(path, "rb") as f:
            head = f.read(26)
        if head[:8] == b"\x89PNG\r\n\x1a\n":
            w, h = struct.unpack(">II", head[16:24])
            return w, h
        if head[:2] == b"\xff\xd8":                  # JPEG: quét SOF marker
            with open(path, "rb") as f:
                f.read(2)
                while True:
                    b = f.read(1)
                    while b and b != b"\xff":
                        b = f.read(1)
                    marker = f.read(1)
                    if not marker:
                        break
                    if marker[0] in (0xC0, 0xC1, 0xC2, 0xC3):
                        f.read(3)
                        h, w = struct.unpack(">HH", f.read(4))
                        return w, h
                    seg = f.read(2)
                    if len(seg) < 2:
                        break
                    f.read(struct.unpack(">H", seg)[0] - 2)
    except Exception:
        pass
    return 600, 400


class Client:
    def __init__(self, max_width=600, base_url=None, slug=None):
        cfg = _load_cfg()
        self.web_base = (base_url or cfg.get("PLANE_BASE_URL", "https://api.plane.so")).rstrip("/")
        self.base = f"{self.web_base}/api/{cfg.get('PLANE_API_VERSION', 'v1')}"
        self.slug = slug or cfg.get("PLANE_WORKSPACE_SLUG", "")
        if not self.slug:
            raise RuntimeError("Plane workspace is missing. Supply a Plane URL or set PLANE_WORKSPACE_SLUG.")
        self.key_env = _key_env_name(self.slug)
        self.key = _select_key(cfg, self.slug)
        if not self.key:
            raise RuntimeError(
                f"Plane API key is missing. Export {self.key_env} or PLANE_API_KEY; do not provide a password."
            )
        self.max_width = max_width

    @classmethod
    def from_url(cls, url, max_width=600):
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            raise ValueError(f"Plane URL không hợp lệ: {url}")
        parts = [urllib.parse.unquote(part) for part in parsed.path.split("/") if part]
        if not parts:
            raise ValueError(f"URL không có workspace slug: {url}")
        slug = parts[0]
        try:
            project_index = parts.index("projects")
            pid = parts[project_index + 1]
        except (ValueError, IndexError):
            pid = None
        iid = None
        for marker in ("issues", "work-items"):
            if marker in parts:
                index = parts.index(marker)
                if index + 1 < len(parts):
                    iid = parts[index + 1]
                    break
        client = cls(max_width=max_width, base_url=f"{parsed.scheme}://{parsed.netloc}", slug=slug)
        return client, pid, iid

    # ---- low level ----
    def api(self, method, path, body=None):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.base + path, data=data, method=method,
            headers={"X-API-Key": self.key, "Content-Type": "application/json", "Accept": "application/json"})
        with urllib.request.urlopen(req) as r:
            raw = r.read()
            return json.loads(raw) if raw else None

    def _get_all(self, path):
        out, url = [], self.base + path
        while url:
            req = urllib.request.Request(url, headers={"X-API-Key": self.key, "Accept": "application/json"})
            with urllib.request.urlopen(req) as r:
                d = json.loads(r.read())
            if isinstance(d, dict) and "results" in d:
                out += d["results"]
                nxt = d.get("next")
                url = nxt if (nxt and nxt.startswith("http")) else (self.base + nxt if nxt else None)
            elif isinstance(d, list):
                out += d; break
            else:
                break
        return out

    # ---- resolve "PROJ-1" -> (project_id, work_item_id) ----
    def resolve(self, ref):
        if "-" not in ref:
            raise ValueError(f"ref không hợp lệ: {ref} (cần dạng PROJ-1)")
        ident, seq = ref.rsplit("-", 1)
        seq = int(seq)
        proj = next((p for p in self._get_all(f"/workspaces/{self.slug}/projects/")
                     if (p.get("identifier") or "").upper() == ident.upper()), None)
        if not proj:
            raise ValueError(f"Không tìm thấy project có identifier '{ident}'")
        pid = proj["id"]
        item = next((it for it in self._get_all(f"/workspaces/{self.slug}/projects/{pid}/work-items/")
                     if it.get("sequence_id") == seq), None)
        if not item:
            raise ValueError(f"Không tìm thấy {ref} trong project {ident}")
        return pid, item["id"]

    def resolve_state(self, pid, state_name):
        states = self._get_all(f"/workspaces/{self.slug}/projects/{pid}/states/")
        wanted = state_name.strip().casefold()
        state = next((item for item in states
                      if str(item.get("name", "")).strip().casefold() == wanted), None)
        if not state:
            available = ", ".join(str(item.get("name", "")) for item in states)
            raise ValueError(f"Không tìm thấy state '{state_name}'. Available: {available}")
        return state["id"]

    def set_state(self, pid, iid, state_name):
        state_id = self.resolve_state(pid, state_name)
        return self.api("PATCH", f"/workspaces/{self.slug}/projects/{pid}/work-items/{iid}/",
                        {"state": state_id})

    # ---- upload 1 ảnh qua issue-attachments -> asset_id ----
    def upload_asset(self, pid, iid, filepath):
        name = os.path.basename(filepath)
        ext = name.rsplit(".", 1)[-1].lower()
        mime = "image/jpeg" if ext in ("jpg", "jpeg") else "image/png"
        init = self.api("POST", f"/workspaces/{self.slug}/projects/{pid}/issues/{iid}/issue-attachments/",
                        {"name": name, "size": os.path.getsize(filepath), "type": mime})
        ud, asset_id = init["upload_data"], init["asset_id"]
        boundary = "----plane" + uuid.uuid4().hex
        crlf = b"\r\n"; buf = []
        for k, v in ud["fields"].items():
            buf += [b"--" + boundary.encode(),
                    f'Content-Disposition: form-data; name="{k}"'.encode(), b"", str(v).encode()]
        with open(filepath, "rb") as f:
            content = f.read()
        buf += [b"--" + boundary.encode(),
                f'Content-Disposition: form-data; name="file"; filename="{name}"'.encode(),
                f"Content-Type: {mime}".encode(), b"", content]
        buf += [b"--" + boundary.encode() + b"--", b""]
        urllib.request.urlopen(urllib.request.Request(ud["url"], data=crlf.join(buf), method="POST",
            headers={"Content-Type": "multipart/form-data; boundary=" + boundary})).read()
        self.api("PATCH", f"/workspaces/{self.slug}/projects/{pid}/issues/{iid}/issue-attachments/{asset_id}/",
                 {"is_uploaded": True})
        return asset_id

    # ---- HTML node <image-component> đúng format instance (không icon) ----
    def image_node(self, asset_id, filepath):
        w, h = _img_size(filepath)
        cw = min(w, self.max_width)
        ch = round(cw * h / w) if w else 400
        ar = round(w / h, 6) if h else 1.5
        nid = str(uuid.uuid4())
        return (f'<image-component data-id="{nid}" src="{asset_id}" id="{nid}" '
                f'width="{cw}px" height="{ch}px" aspectratio="{ar}" alignment="left" '
                f'status="uploaded"></image-component>')

    def inline_html(self, pid, iid, files):
        """Upload mỗi ảnh -> trả chuỗi HTML các image-component (ghép liền)."""
        nodes = []
        for fp in files:
            if not os.path.exists(fp):
                continue
            nodes.append(self.image_node(self.upload_asset(pid, iid, fp), fp))
        return "".join(nodes)

    # ---- post comment text + ảnh inline (nội dung sạch, không emoji) ----
    def post_comment(self, pid, iid, text_or_html="", files=None, raw_html=False):
        files = files or []
        intro = text_or_html if raw_html else (f"<p>{_esc(text_or_html)}</p>" if text_or_html else "")
        html = intro + self.inline_html(pid, iid, files)
        if not html:
            raise ValueError("Không có nội dung lẫn ảnh để post")
        return self.api("POST", f"/workspaces/{self.slug}/projects/{pid}/work-items/{iid}/comments/",
                        {"comment_html": html})

    def update_comment(self, pid, iid, comment_id, html):
        """Sửa nội dung 1 comment (giữ ảnh inline cũ bằng cách nhúng lại node image-component)."""
        return self.api("PATCH", f"/workspaces/{self.slug}/projects/{pid}/work-items/{iid}/comments/{comment_id}/",
                        {"comment_html": html})

    def get_comment(self, pid, iid, comment_id):
        return self.api("GET", f"/workspaces/{self.slug}/projects/{pid}/work-items/{iid}/comments/{comment_id}/")

    def delete_comment(self, pid, iid, comment_id):
        return self.api("DELETE", f"/workspaces/{self.slug}/projects/{pid}/work-items/{iid}/comments/{comment_id}/")
