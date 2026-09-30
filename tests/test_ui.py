"""หน้าตา: ไอคอน Lucide แทนอิโมจิ/สัญลักษณ์ตัวอักษร และตัวเลือกเป็น radio (เหลือ select เฉพาะเลือกคอลัมน์)"""

import json
import re

import openpyxl
import pytest

import build
from tests.conftest import needs_chrome
from tests.test_e2e import drive, paste_steps, TSV, with_driver, load_pp5_steps


@pytest.fixture(scope="module")
def built(tmp_path_factory):
    out = tmp_path_factory.mktemp("ui") / "index.html"
    build.build(out)
    return out.read_text(encoding="utf-8")


GLYPHS = re.compile("[\U0001F300-\U0001FAFF←-⇿⌀-⏿☀-➿⭐⭕]")


def test_the_page_has_no_emoji_arrows_or_status_glyphs(built):
    bad = sorted(set(GLYPHS.findall(built)))
    assert not bad, f"พบสัญลักษณ์ตัวอักษรที่ควรเป็นไอคอน: {bad}"


def test_every_icon_the_page_references_exists_in_the_sprite(built):
    used = set(re.findall(r"#(i-[a-z0-9-]+)", built))
    defined = set(re.findall(r'<symbol id="(i-[a-z0-9-]+)"', built))
    assert used and not (used - defined), used - defined


def test_the_lucide_licence_notice_travels_with_the_sprite(built):
    assert "Lucide" in built and "ISC" in built


@needs_chrome
def test_choices_are_radio_buttons_and_only_column_pickers_stay_dropdowns(built):
    out = drive(built, paste_steps(TSV) + """
    out.selects = Array.prototype.map.call(document.querySelectorAll('select'), function (s) { return s.id; });
    out.radios = {};
    ['target', 'phase', 'mode'].forEach(function (n) { out.radios[n] = document.getElementsByName(n).length; });
    """)
    assert all(i == "codeCol" or i.startswith("map_") for i in out["selects"]), out["selects"]
    assert out["radios"] == {"target": 3, "phase": 2, "mode": 2}


@needs_chrome
def test_each_target_card_shows_an_icon(built):
    out = drive(built, "out.cards = Array.prototype.map.call(document.querySelectorAll('label.choice'), function (l) { return !!l.querySelector('svg use'); });")
    assert out["cards"] and all(out["cards"])


@needs_chrome
def test_lenient_is_the_default_and_the_mode_radio_switches_to_strict(built):
    default = json.loads(drive(built, paste_steps(TSV))["payload"])
    assert default["strict"] is False
    steps = paste_steps(TSV, extra="var m = document.querySelector('input[name=mode][value=strict]'); m.checked = true; m.dispatchEvent(new Event('change')); await sleep(50);")
    assert json.loads(drive(built, steps)["payload"])["strict"] is True


@needs_chrome
def test_sheets_are_chosen_with_radio_buttons(built):
    from tests.pp5_fixture import to_b64
    wb = openpyxl.Workbook()
    wb.active.title = "ห้อง 1"
    wb.active.append(["รหัส", "ก่อนกลาง"])
    wb.active.append([10001, 20])
    wb.create_sheet("ห้อง 2").append(["รหัส", "ก่อนกลาง"])
    wb["ห้อง 2"].append([10002, 21])
    steps = load_pp5_steps(wb, extra="""
    out.hasRadios = document.querySelectorAll('#sheet input[type=radio]').length;
    var second = document.querySelectorAll('#sheet input[type=radio]')[1]; second.checked = true; second.dispatchEvent(new Event('change')); await sleep(60);
    """)
    out = drive(built, steps)
    assert out["hasRadios"] == 2
    assert [s["code"] for s in json.loads(out["payload"])["students"]] == ["10002"]
