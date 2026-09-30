"""รัน JavaScript ในหน้าเว็บด้วย Chrome headless แล้วอ่านผลกลับเป็น JSON

Chrome บน macOS ไม่จบเองหลัง --dump-dom จึงอ่าน stdout ทีละบรรทัดแล้วปิดเองเมื่อได้ผล
ผลส่งกลับผ่าน document.title รูป SGSFILL<urlencoded json> (ไม่มีอักขระที่ถูก escape ซ้ำ)
"""

from __future__ import annotations

import html as _html
import json
import re
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parent.parent
SRC_ORDER = ("text", "parse", "xlsx", "mapping", "validate", "payload", "pp5", "ui")

CHROME_CANDIDATES = (
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
)
FLAGS = (
    "--headless=new", "--disable-gpu", "--no-sandbox", "--no-first-run",
    "--no-default-browser-check", "--disable-extensions", "--disable-sync",
    "--disable-background-networking", "--disable-component-update",
    "--disable-client-side-phishing-detection", "--disable-domain-reliability",
    "--disable-breakpad", "--metrics-recording-only", "--hide-scrollbars",
    "--virtual-time-budget=8000",
)


def find_chrome() -> str:
    for c in CHROME_CANDIDATES:
        if Path(c).exists():
            return c
    for name in ("google-chrome", "chromium", "chrome"):
        p = shutil.which(name)
        if p:
            return p
    raise FileNotFoundError("ไม่พบ Chrome ในเครื่องนี้")


def read_sources(names) -> str:
    return "\n".join((ROOT / "src" / f"{n}.js").read_text(encoding="utf-8") for n in names)


def run_page(page_html: str, timeout: int = 60) -> Any:
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as td:
        page = Path(td) / "page.html"
        page.write_text(page_html, encoding="utf-8")
        proc = subprocess.Popen(
            [find_chrome(), *FLAGS, f"--user-data-dir={td}/profile", "--dump-dom", page.as_uri()],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True,
        )
        buffer, deadline = "", time.monotonic() + timeout
        try:
            while time.monotonic() < deadline:
                line = proc.stdout.readline() if proc.stdout else ""
                if not line and proc.poll() is not None:
                    break
                buffer += line
                if "SGSFILL" in buffer and "</title>" in buffer:
                    break
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                proc.kill()
    found = re.search(r"SGSFILL([^<]*)</title>", buffer)
    if not found:
        raise RuntimeError("Chrome ไม่คืนผล")
    out = json.loads(unquote(_html.unescape(found.group(1))))
    if not out["ok"]:
        raise RuntimeError(out["error"])
    return out["value"]


WRAP = """<!doctype html><meta charset="utf-8"><body>
<script>%(sources)s</script>
<script>
(async function () {
  var out;
  try {
    var value = await (async function () { %(body)s })();
    out = {ok: true, value: value === undefined ? null : value};
  } catch (e) {
    out = {ok: false, error: String((e && e.message) || e)};
  }
  document.title = 'SGSFILL' + encodeURIComponent(JSON.stringify(out));
})();
</script></body>"""


def run_js(body: str, modules: tuple[str, ...] = ("text",)) -> Any:
    return run_page(WRAP % {"sources": read_sources(modules), "body": body})
