"""วิธีใช้อยู่ในปุ่มมุมขวาบน กดแล้วเปิด dialog — ไม่กินที่หน้าหลักตลอดเวลา"""

import pytest

import build
from tests.conftest import needs_chrome
from tests.test_e2e import drive


@pytest.fixture(scope="module")
def built(tmp_path_factory):
    out = tmp_path_factory.mktemp("help") / "index.html"
    build.build(out)
    return out.read_text(encoding="utf-8")


@needs_chrome
def test_the_help_button_sits_in_the_header_and_the_dialog_starts_closed(built):
    out = drive(built, """
    var b = document.getElementById('helpBtn');
    out.inHeader = !!b && !!b.closest('header');
    out.label = b ? b.textContent.trim() : '';
    out.hasIcon = !!(b && b.querySelector('svg use'));
    out.open = document.getElementById('help').open;
    out.cardGone = !document.getElementById('howto');
    """)
    assert out["inHeader"] and "วิธีใช้" in out["label"] and out["hasIcon"]
    assert out["open"] is False
    assert out["cardGone"], "กรอบวิธีใช้เดิมต้องไม่อยู่บนหน้าหลักแล้ว"


@needs_chrome
def test_the_button_opens_the_dialog_with_the_steps_and_the_install_link(built):
    out = drive(built, """
    document.getElementById('helpBtn').click();
    out.open = document.getElementById('help').open;
    var d = document.getElementById('help');
    out.hasBookmarklet = !!d.querySelector('#bookmarklet');
    out.steps = d.querySelectorAll('ol.how > li').length;
    out.version = !!d.querySelector('#version');
    """)
    assert out["open"] is True
    assert out["hasBookmarklet"] and out["version"]
    assert out["steps"] == 5


@needs_chrome
def test_the_close_button_and_a_click_on_the_backdrop_close_it(built):
    out = drive(built, """
    var d = document.getElementById('help');
    d.showModal();
    document.getElementById('helpClose').click();
    out.afterClose = d.open;
    d.showModal();
    d.dispatchEvent(new MouseEvent('click', { bubbles: true }));   // คลิกที่ตัว dialog เอง = พื้นหลัง
    out.afterBackdrop = d.open;
    d.showModal();
    d.querySelector('.how').click();                                // คลิกในเนื้อหา ต้องไม่ปิด
    out.afterInside = d.open;
    """)
    assert out["afterClose"] is False
    assert out["afterBackdrop"] is False
    assert out["afterInside"] is True


@needs_chrome
def test_the_dialog_is_labelled_for_screen_readers_and_fits_a_narrow_screen(built):
    out = drive(built, """
    var d = document.getElementById('help');
    d.showModal();
    out.labelled = d.getAttribute('aria-labelledby');
    out.title = document.getElementById(out.labelled) ? document.getElementById(out.labelled).textContent : '';
    out.w = d.getBoundingClientRect().width; out.iw = window.innerWidth;
    out.sw = document.documentElement.scrollWidth;
    """)
    assert out["title"].strip() == "วิธีใช้"
    assert out["w"] <= out["iw"] and out["sw"] <= out["iw"], out


@needs_chrome
def test_the_report_button_has_a_short_label_and_explains_itself_on_hover(built):
    out = drive(built, """
    var b = document.getElementById('copyReport');
    out.label = b.textContent.trim(); out.title = b.getAttribute('title') || '';
    """)
    assert out["label"] == "คัดลอกรายงานปัญหา", out["label"]
    assert "ไม่มีข้อมูลนักเรียน" in out["title"], "คำอธิบายต้องย้ายมาอยู่ที่ tooltip ไม่ใช่หายไป"


@needs_chrome
def test_the_faq_explains_the_report_button_for_people_without_a_mouse(built):
    out = drive(built, "out.faq = document.querySelector('#help details').textContent;")
    assert "รายงานปัญหา" in out["faq"] and "ไม่มีรหัส" in out["faq"], "ต้องบอกว่ารายงานไม่มีรหัส/ชื่อ/คะแนนนักเรียน"
