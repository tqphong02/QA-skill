#!/usr/bin/env python3
# ============================================================
# Plane — Post comment có ẢNH INLINE (xem thẳng, không bắt tải về). Không chèn icon/emoji.
# ============================================================
# Dùng:
#   # bằng ref tiện (tự resolve PROJ-1 -> project/work-item):
#   python3 comments/post-inline.py --ref PROJ-1 --text "Retest PASS" --img a.png --img b.png
#
#   # hoặc bằng id trực tiếp:
#   python3 comments/post-inline.py --wi <work_item_id> --project <project_id> \
#           --text "..." --img evidence/x.png
#
#   # chỉ ảnh, không text:    --img a.png
#   # dùng HTML thô cho text: --html "<p><strong>Kết quả</strong></p>"
#   # xoá 1 comment test:     --delete <comment_id> --ref PROJ-1
# ============================================================
import sys, os, re
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from utils.inline_image import Client


ICON_RE = re.compile(r"[\U0001F300-\U0001FAFF\u2600-\u27BF]")


def normalize_comment(value, raw_html=False):
    value = str(value).strip()
    if ICON_RE.search(value):
        raise ValueError("Nội dung comment không được chứa emoji hoặc icon")
    if raw_html:
        return re.sub(r"\.(\s*</(?:p|li|h[1-6])>)", r"\1", value, flags=re.IGNORECASE)
    return value.rstrip(".").rstrip()


def parse(argv):
    a = {"img": []}
    i = 0
    while i < len(argv):
        k = argv[i]
        if k == "--img":
            a["img"].append(argv[i + 1]); i += 2
        elif k in ("--ref", "--url", "--wi", "--project", "--text", "--html", "--delete"):
            a[k.lstrip("-")] = argv[i + 1]; i += 2
        else:
            print(f"Bỏ qua arg lạ: {k}"); i += 1
    return a


def main():
    a = parse(sys.argv[1:])
    if a.get("url"):
        c, pid, iid = Client.from_url(a["url"])
        if not pid or not iid:
            print("URL phải chứa project ID và issue/work-item ID"); sys.exit(1)
    else:
        c = Client()

    if a.get("url"):
        pass
    elif a.get("ref"):
        pid, iid = c.resolve(a["ref"])
    elif a.get("wi") and a.get("project"):
        pid, iid = a["project"], a["wi"]
    else:
        print("Cần --url <Plane ticket URL>, --ref PROJ-1, hoặc --wi <id> --project <id>"); sys.exit(1)

    if a.get("delete"):
        c.delete_comment(pid, iid, a["delete"])
        print(f"Đã xoá comment {a['delete']}"); return

    raw = "html" in a
    try:
        text = normalize_comment(a.get("html") or a.get("text", ""), raw_html=raw)
    except ValueError as exc:
        print(f"COMMENT FORMAT ERROR: {exc}"); sys.exit(1)
    imgs = [x for x in a["img"]]
    miss = [x for x in imgs if not os.path.exists(x)]
    if miss:
        print(f"THIẾU ảnh: {miss}"); sys.exit(1)

    res = c.post_comment(pid, iid, text, imgs, raw_html=raw)
    print(f"OK comment {res['id']} | {len(imgs)} ảnh inline | wi={iid}")


if __name__ == "__main__":
    main()
