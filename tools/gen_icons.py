#!/usr/bin/env python3
"""สร้าง site/icons.svg (สไปรต์ไอคอน Lucide) จาก lucide-react ที่มีอยู่ในเครื่อง

ใช้ครั้งเดียวตอนเพิ่ม/เปลี่ยนไอคอน แล้ว commit ไฟล์ผลลัพธ์ — build.py แค่ฝังไฟล์นี้ลงหน้า
(ไม่ดึงจากอินเทอร์เน็ต เพราะ CSP ห้ามเชื่อมต่อออกนอกหน้า)

    python tools/gen_icons.py /path/to/node_modules/lucide-react
Lucide เป็นลิขสิทธิ์ ISC (https://lucide.dev/license) ต้องเก็บประกาศไว้ในสไปรต์
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ICONS = [
    "lock", "file-spreadsheet", "clipboard-copy", "clipboard-paste", "circle-check", "circle-x",
    "triangle-alert", "info", "bookmark", "book-open", "calculator", "award", "upload",
    "list-checks", "chevron-down", "arrow-right", "table-2", "flag", "wand-sparkles", "check", "circle-help", "x",
]
OUT = Path(__file__).resolve().parent.parent / "site" / "icons.svg"


def load(root: Path, name: str) -> list:
    src = (root / "dist" / "esm" / "icons" / f"{name}.js").read_text(encoding="utf-8")
    body = re.search(r"createLucideIcon\(\"[^\"]+\",\s*(\[.*\])\);", src, re.S).group(1)
    body = re.sub(r",\s*key:\s*\"[^\"]*\"", "", body)                 # ตัด key ของ React
    body = re.sub(r"(\{|,)\s*([A-Za-z][\w-]*):", r'\1 "\2":', body)   # คีย์ JS → JSON
    return json.loads(body)


def symbol(name: str, nodes: list) -> str:
    inner = ""
    for tag, attrs in nodes:
        inner += f"<{tag} " + " ".join(f'{k}="{v}"' for k, v in attrs.items()) + "/>"
    return f'<symbol id="i-{name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' \
           f'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">{inner}</symbol>'


def main(root: str) -> None:
    root_path = Path(root)
    version = json.loads((root_path / "package.json").read_text())["version"]
    symbols = "\n".join(symbol(n, load(root_path, n)) for n in ICONS)
    OUT.write_text(
        f"<!-- ไอคอน: Lucide (lucide-react {version}) ลิขสิทธิ์ ISC — https://lucide.dev/license -->\n"
        f'<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">\n{symbols}\n</svg>\n',
        encoding="utf-8",
    )
    print(f"เขียน {OUT} ({len(ICONS)} ไอคอน)")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
