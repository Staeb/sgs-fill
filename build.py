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
SRC_ORDER = ("text", "parse", "xlsx", "mapping", "validate", "payload", "pp5", "ui")


def version() -> str:
    return (ROOT / "VERSION").read_text(encoding="utf-8").strip()


def strip_for_bookmarklet(source: str) -> str:
    """ตัดความเห็นบล็อกและช่องว่างหัวบรรทัดออก ให้ลิงก์บุ๊กมาร์กเล็ตสั้นลง

    ข้อความไทยในลิงก์กลายเป็น %XX ยาวเก้าตัวอักษรต่อหนึ่งตัว ลิงก์เต็มไฟล์จึงเฉียด 65,536 ที่เบราว์เซอร์
    บางตัวจำกัด ความเห็นทั้งหมดในสคริปต์เป็นแบบบล็อก และไม่มีสตริงหรือ regex ที่มี /* อยู่ข้างใน
    (เทสต์รันตัวที่ตัดแล้วบนหน้าจำลองยืนยันว่าทำงานเหมือนเดิม) ยังคงเก็บบรรทัดใหม่ไว้เพราะโค้ดพึ่ง ; ทุกที่
    """
    import re

    no_comments = re.sub(r"/\*.*?\*/", "", source, flags=re.S)
    lines = [ln.strip() for ln in no_comments.splitlines()]
    return "\n".join(ln for ln in lines if ln) + "\n"


def render_script(ver: str) -> str:
    raw = (ROOT / "fill" / "sgs_fill.js").read_text(encoding="utf-8").replace("__SCRIPT_VERSION__", ver)
    return strip_for_bookmarklet(raw)


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
        .replace("<!--__ICONS__-->", (ROOT / "site" / "icons.svg").read_text(encoding="utf-8"))
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
