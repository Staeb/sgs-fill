"""รวมโปรเจกต์เป็น dist/index.html ไฟล์เดียว

- src/*.js ต่อกันเป็นสคริปต์ inline เดียว (ลำดับตาม SRC_ORDER)
- สคริปต์กรอก (fill/sgs_fill.js) ฝังลงลิงก์บุ๊กมาร์กเล็ตทั้งก้อน — ไม่โหลดจากเว็บตอนกด
- CSP ผูกแฮชของสคริปต์ inline ห้ามเชื่อมต่อเครือข่ายทุกชนิด
"""

from __future__ import annotations

import base64
import hashlib
import html
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent
SRC_ORDER = ("text", "parse", "xlsx", "mapping", "validate", "payload", "ui")


def version() -> str:
    return (ROOT / "VERSION").read_text(encoding="utf-8").strip()


def render_script(ver: str) -> str:
    return (ROOT / "fill" / "sgs_fill.js").read_text(encoding="utf-8").replace("__SCRIPT_VERSION__", ver)


def bookmarklet_href(script: str) -> str:
    return "javascript:" + quote(script, safe="")


def app_js() -> str:
    return "\n".join((ROOT / "src" / f"{n}.js").read_text(encoding="utf-8") for n in SRC_ORDER)


def build(out: Path | None = None) -> Path:
    ver = version()
    js = app_js().replace("__VERSION__", ver)
    digest = base64.b64encode(hashlib.sha256(js.encode("utf-8")).digest()).decode()
    csp = (
        "default-src 'none'; "
        f"script-src 'sha256-{digest}'; "
        "style-src 'unsafe-inline'; connect-src 'none'; form-action 'none'; base-uri 'none'"
    )
    page = (ROOT / "site" / "index.template.html").read_text(encoding="utf-8")
    css = (ROOT / "site" / "app.css").read_text(encoding="utf-8")
    page = (
        page.replace("__CSP__", html.escape(csp, quote=False))
        .replace("/*__CSS__*/", css)
        .replace("__BOOKMARKLET__", bookmarklet_href(render_script(ver)))
        .replace("__VERSION__", ver)
        .replace("/*__JS__*/", js)
    )
    target = out or ROOT / "dist" / "index.html"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(page, encoding="utf-8")
    return target


if __name__ == "__main__":
    print(build())
