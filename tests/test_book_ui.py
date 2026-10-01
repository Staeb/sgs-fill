"""หน้าตา "สมุดตรวจคะแนน": ตารางตัวอย่างบอกว่าจะกรอกอะไรลงช่องไหน · ตราประทับ · แถบท้ายจอ · ขั้นตอนที่หดได้"""

import pytest

import build
from tests.conftest import needs_chrome
from tests.test_e2e import drive, paste_steps


@pytest.fixture(scope="module")
def built(tmp_path_factory):
    out = tmp_path_factory.mktemp("book") / "index.html"
    build.build(out)
    return out.read_text(encoding="utf-8")


# คนที่ 1 ปกติ · คนที่ 2 ขส (เครื่องหมาย) · คนที่ 3 ว่าง · คนที่ 4 เกินคะแนนเต็ม 25
SHEET = ("เลขประจำตัว\tชื่อ\tก่อนกลางภาค\tกลางภาค\n"
         "10001\tสมมุติ\t20\t15\n"
         "10002\tสมมุติ\tขส\t16\n"
         "10003\tสมมุติ\t\t17\n"
         "10004\tสมมุติ\t30\t18\n")
SET_MAX = ("var m = document.getElementById('max_S1'); m.value = '25'; m.dispatchEvent(new Event('input')); "
           "await sleep(60);")


@needs_chrome
def test_each_column_header_says_where_that_column_will_be_filled(built):
    out = drive(built, paste_steps(SHEET) + """
    out.chips = Array.prototype.map.call(document.querySelectorAll('#preview thead th'), function (th) {
      var m = th.querySelector('.map'); return m ? m.textContent : ''; });
    """)
    chips = " | ".join(out["chips"])
    assert "รหัสนักเรียน" in chips, chips
    assert "S1" in chips and "Midterm" in chips, chips
    assert "ไม่ใช้" in chips, "คอลัมน์ที่ไม่ได้จับคู่ต้องบอกว่าไม่ใช้ ไม่ใช่ปล่อยให้เดา"


@needs_chrome
def test_cells_show_their_state_blank_marker_and_out_of_range(built):
    out = drive(built, paste_steps(SHEET, extra=SET_MAX) + """
    var count = function (c) { return document.querySelectorAll('#preview td.' + c).length; };
    out.counts = { blank: count('blank'), marker: count('marker'), bad: count('bad') };
    out.badText = (document.querySelector('#preview td.bad') || {}).textContent || '';
    """)
    assert out["counts"] == {"blank": 1, "marker": 1, "bad": 1}, out["counts"]
    assert "เกิน" in out["badText"] and "25" in out["badText"], out["badText"]


@needs_chrome
def test_a_blank_or_marker_cell_never_turns_into_zero_on_screen(built):
    out = drive(built, paste_steps(SHEET, extra=SET_MAX) + """
    out.marker = (document.querySelector('#preview td.marker') || {}).textContent;
    out.blank = (document.querySelector('#preview td.blank') || {}).textContent;
    """)
    assert out["marker"].strip() == "ขส"
    assert out["blank"].strip() != "0"


@needs_chrome
def test_the_stamp_counts_ready_students_out_of_all(built):
    out = drive(built, paste_steps(SHEET) + "out.stamp = document.getElementById('stamp').textContent;")
    assert "พร้อมกรอก" in out["stamp"] and "จาก 4 คน" in out["stamp"], out["stamp"]


@needs_chrome
def test_the_dock_keeps_the_numbers_and_the_copy_buttons_in_reach(built):
    out = drive(built, paste_steps(SHEET, extra=SET_MAX) + """
    var d = document.getElementById('dock');
    out.pos = getComputedStyle(d).position;
    out.hasCopy = !!d.querySelector('#copy') && !!d.querySelector('#copyReport');
    out.bad = document.getElementById('cntBad').textContent;
    out.warn = document.getElementById('cntWarn').textContent;
    """)
    assert out["pos"] == "fixed" and out["hasCopy"]
    assert "1" in out["bad"], out["bad"]       # คนที่ 4 เกินคะแนนเต็ม
    assert "ผิด" in out["bad"] and "ว่าง" in out["warn"]


@needs_chrome
def test_the_page_still_never_scrolls_sideways_with_the_new_layout(built):
    out = drive(built, paste_steps(SHEET) + "out.iw = window.innerWidth; out.sw = document.documentElement.scrollWidth;")
    assert out["sw"] <= out["iw"], (out["sw"], out["iw"])
