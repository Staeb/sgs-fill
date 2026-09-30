import base64
import hashlib
import re
from urllib.parse import unquote

import pytest

import build
from tests.chrome import ROOT

FORBIDDEN = ("fetch(", "XMLHttpRequest", "sendBeacon", "WebSocket", "eval(", "new Function",
             "importScripts", "localStorage", "sessionStorage", "document.cookie", "innerHTML",
             "EventSource", ".src =", "navigator.serviceWorker")


@pytest.fixture(scope="module")
def built(tmp_path_factory):
    out = tmp_path_factory.mktemp("dist") / "index.html"
    build.build(out)
    return out.read_text(encoding="utf-8")


def inline_script(html: str) -> str:
    return re.search(r"<script>(.*?)</script>", html, re.S).group(1)


def test_csp_forbids_network_and_pins_the_inline_script_by_hash(built):
    csp = re.search(r'http-equiv="Content-Security-Policy" content="([^"]+)"', built).group(1)
    assert "default-src 'none'" in csp and "connect-src 'none'" in csp
    assert "form-action 'none'" in csp and "base-uri 'none'" in csp
    digest = base64.b64encode(hashlib.sha256(inline_script(built).encode("utf-8")).digest()).decode()
    assert f"script-src 'sha256-{digest}'" in csp


def test_page_and_scripts_never_reach_the_network_or_store_data(built):
    app_js = inline_script(built)
    fill_js = (ROOT / "fill" / "sgs_fill.js").read_text(encoding="utf-8")
    for token in FORBIDDEN:
        assert token not in app_js, f"app: {token}"
        assert token not in fill_js, f"fill: {token}"
    assert "//" not in fill_js
    assert not re.search(r'(src|href)="https?:', built), "ห้ามมีทรัพยากรภายนอก"
    assert "<link " not in built


def test_the_bookmarklet_is_the_fill_script_with_the_version_baked_in(built):
    href = re.search(r'id="bookmarklet"[^>]*href="(javascript:[^"]+)"', built).group(1)
    body = unquote(href[len("javascript:"):])
    version = (ROOT / "VERSION").read_text().strip()
    assert body == build.render_script(version)
    assert "__SCRIPT_VERSION__" not in body and f"'{version}'" in body
    assert f"v{version}" in built or version in built


def test_page_shows_the_credit_and_the_privacy_promise(built):
    assert "Develop by Kru staeb" in built
    assert "ไม่ออกจากเครื่อง" in built
    assert "ไม่ใช่เครื่องมือของ สพฐ." in built


def test_howto_mentions_setting_rows_per_page_before_starting(built):
    assert "จำนวนแถวต่อหน้า" in built
