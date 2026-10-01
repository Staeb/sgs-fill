"""ขั้นตอนเป็น 3 แท็บแนวนอนเหนือสมุดตัวอย่าง · toast แจ้งผลการคัดลอก"""

import pytest

import build
from tests.conftest import needs_chrome
from tests.test_e2e import drive, paste_steps
from tests.test_book_ui import SHEET


@pytest.fixture(scope="module")
def built(tmp_path_factory):
    out = tmp_path_factory.mktemp("tabs") / "index.html"
    build.build(out)
    return out.read_text(encoding="utf-8")


@needs_chrome
def test_there_are_exactly_three_tabs_laid_out_in_one_row(built):
    out = drive(built, """
    var tabs = Array.prototype.slice.call(document.querySelectorAll('[role=tab]'));
    out.count = tabs.length;
    out.tops = tabs.map(function (t) { return Math.round(t.getBoundingClientRect().top); });
    out.lefts = tabs.map(function (t) { return Math.round(t.getBoundingClientRect().left); });
    out.panels = document.querySelectorAll('[role=tabpanel]').length;
    out.list = !!document.querySelector('[role=tablist]');
    """)
    assert out["count"] == 3 and out["panels"] == 3 and out["list"]
    # แท็บที่เลือกยกสูงกว่าเพื่อน 2-3px ตามดีไซน์สมุด — ยังต้องอยู่แถวเดียวกัน ไม่ใช่ซ้อนลงมาเป็นหลายบรรทัด
    assert max(out["tops"]) - min(out["tops"]) < 12, out["tops"]
    assert out["lefts"] == sorted(out["lefts"])


@needs_chrome
def test_only_the_selected_tabs_panel_is_visible_and_clicking_switches_it(built):
    out = drive(built, """
    var state = function () {
      return Array.prototype.map.call(document.querySelectorAll('[role=tab]'), function (t) {
        var p = document.getElementById(t.getAttribute('aria-controls'));
        return [t.getAttribute('aria-selected'), !p.hidden]; });
    };
    out.start = state();
    document.getElementById('tab2').click();
    out.after = state();
    """)
    assert out["start"] == [["true", True], ["false", False], ["false", False]]
    assert out["after"] == [["false", False], ["true", True], ["false", False]]


@needs_chrome
def test_arrow_keys_move_between_tabs(built):
    out = drive(built, """
    var t1 = document.getElementById('tab1');
    t1.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    out.afterRight = document.getElementById('tab2').getAttribute('aria-selected');
    document.getElementById('tab2').dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    out.afterEnd = document.getElementById('tab3').getAttribute('aria-selected');
    document.getElementById('tab3').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    out.wrapped = document.getElementById('tab1').getAttribute('aria-selected');
    """)
    assert (out["afterRight"], out["afterEnd"], out["wrapped"]) == ("true", "true", "true")


@needs_chrome
def test_the_tabs_run_in_the_order_data_then_page_then_mapping(built):
    out = drive(built, """
    out.titles = [1, 2, 3].map(function (n) { return document.querySelector('#tab' + n + ' .t').textContent.trim(); });
    out.start = [1, 2, 3].map(function (n) { return document.getElementById('tab' + n).getAttribute('aria-selected'); });
    out.p1HasInput = !!document.querySelector('#p1 #paste') && !!document.querySelector('#p1 #file');
    out.p2HasTargets = document.querySelectorAll('#p2 input[name=target]').length;
    out.p3HasMapping = !!document.querySelector('#p3 #codeCol');
    """)
    assert out["titles"] == ["ใส่ข้อมูล", "เลือกหน้า SGS", "จับคู่คอลัมน์"], out["titles"]
    assert out["start"] == ["true", "false", "false"], "เปิดมาต้องเริ่มที่แท็บใส่ข้อมูล"
    assert out["p1HasInput"] and out["p2HasTargets"] == 3 and out["p3HasMapping"]


@needs_chrome
def test_loading_data_lands_on_the_choose_page_tab(built):
    out = drive(built, paste_steps(SHEET) + """
    out.sel = [1, 2, 3].map(function (n) { return document.getElementById('tab' + n).getAttribute('aria-selected'); });
    out.done = [1, 2, 3].map(function (n) { return document.getElementById('tab' + n).classList.contains('done'); });
    out.sum1 = document.getElementById('sum1').textContent;
    out.sum2 = document.getElementById('sum2').textContent;
    """)
    assert out["sel"] == ["false", "true", "false"], out["sel"]
    assert out["done"][0] is True
    assert "4" in out["sum1"] and "คะแนน" in out["sum2"]


@needs_chrome
def test_choosing_a_page_moves_on_to_mapping_even_when_the_default_is_clicked_again(built):
    """คะแนนถูกเลือกไว้แล้วตั้งแต่แรก — ครูกดซ้ำที่ตัวเดิมก็ต้องไปต่อ ไม่ใช่เงียบ"""
    out = drive(built, paste_steps(SHEET) + """
    document.querySelector('input[name=target][value=score]').click(); await sleep(60);
    out.afterSame = document.getElementById('tab3').getAttribute('aria-selected');
    document.getElementById('tab2').click();
    document.querySelector('input[name=target][value=reading]').click(); await sleep(60);
    out.afterOther = document.getElementById('tab3').getAttribute('aria-selected');
    out.target = document.querySelector('input[name=target]:checked').value;
    """)
    assert out["afterSame"] == "true" and out["afterOther"] == "true" and out["target"] == "reading"


@needs_chrome
def test_choosing_a_page_before_any_data_does_not_jump_ahead(built):
    out = drive(built, """
    document.getElementById('tab2').click();
    document.querySelector('input[name=target][value=desirable]').click(); await sleep(50);
    out.tab2 = document.getElementById('tab2').getAttribute('aria-selected');
    """)
    assert out["tab2"] == "true", "ยังไม่มีข้อมูล ไม่ควรพาไปจับคู่คอลัมน์ที่ยังไม่มีอะไรให้จับ"


@needs_chrome
def test_the_preview_book_sits_below_the_tab_panel(built):
    out = drive(built, paste_steps(SHEET) + """
    var panel = document.querySelector('[role=tabpanel]:not([hidden])').getBoundingClientRect();
    var book = document.querySelector('.book').getBoundingClientRect();
    out.panelBottom = panel.bottom; out.bookTop = book.top;
    out.sameWidth = Math.abs(panel.width - book.width) < 4;
    """)
    assert out["bookTop"] >= out["panelBottom"] - 1, out
    assert out["sameWidth"], "แท็บกับสมุดควรกว้างเท่ากัน อยู่คอลัมน์เดียวกัน"


@needs_chrome
def test_a_successful_copy_shows_a_toast_at_the_bottom(built):
    out = drive(built, paste_steps(SHEET) + """
    navigator.clipboard.writeText = function () { return Promise.resolve(); };
    document.getElementById('copy').click(); await sleep(80);
    var t = document.getElementById('toast');
    out.hidden = t.hidden; out.text = t.textContent; out.role = t.getAttribute('role');
    var r = t.getBoundingClientRect(); out.nearBottom = r.bottom > window.innerHeight * 0.6;
    out.kind = t.className;
    """)
    assert out["hidden"] is False and out["role"] == "status"
    assert "คัดลอกแล้ว" in out["text"] and "2" in out["text"], out["text"]   # พร้อมกรอก 2 คน
    assert out["nearBottom"] and "ok" in out["kind"]


@needs_chrome
def test_a_failed_copy_says_so_in_the_toast_instead_of_claiming_success(built):
    out = drive(built, paste_steps(SHEET) + """
    navigator.clipboard.writeText = function () { return Promise.reject(new Error('denied')); };
    document.getElementById('copy').click(); await sleep(80);
    var t = document.getElementById('toast');
    out.text = t.textContent; out.kind = t.className; out.manual = !document.getElementById('manualBox').hidden;
    """)
    assert "ไม่ได้" in out["text"] and "คัดลอกแล้ว" not in out["text"], out["text"]
    assert "warn" in out["kind"] and out["manual"] is True


@needs_chrome
def test_the_report_copy_button_also_toasts_and_the_toast_goes_away_by_itself(built):
    out = drive(built, paste_steps(SHEET) + """
    navigator.clipboard.writeText = function () { return Promise.resolve(); };
    document.getElementById('copyReport').click(); await sleep(80);
    var t = document.getElementById('toast');
    out.shown = !t.hidden; out.text = t.textContent;
    await sleep(4200);
    out.later = t.hidden;
    """)
    assert out["shown"] and "รายงาน" in out["text"], out["text"]
    assert out["later"] is True


@needs_chrome
def test_the_dock_still_holds_both_copy_buttons(built):
    out = drive(built, "var d = document.getElementById('dock'); out.has = !!d.querySelector('#copy') && !!d.querySelector('#copyReport');")
    assert out["has"]


# ── ไฟล์ ปพ.5: การสลับหน้า/ช่วงต้องไม่ดึงแท็บกลับไปแท็บเดิม ──

def _sel():
    return "[1, 2, 3].map(function (n) { return document.getElementById('tab' + n).getAttribute('aria-selected'); })"


@needs_chrome
def test_a_pp5_file_lands_on_choose_page_and_choosing_one_goes_to_mapping(built):
    from tests.pp5_fixture import build as fx
    from tests.test_e2e import load_pp5_steps
    out = drive(built, load_pp5_steps(fx(), extra=f"""
    out.afterLoad = {_sel()};
    document.querySelector('input[name=target][value=desirable]').click(); await sleep(150);
    out.afterChoose = {_sel()};
    """))
    assert out["afterLoad"] == ["false", "true", "false"], out["afterLoad"]
    assert out["afterChoose"] == ["false", "false", "true"], "เลือกหน้าแล้วต้องอยู่ที่แท็บจับคู่ ไม่ใช่เด้งกลับ"


@needs_chrome
def test_changing_the_phase_inside_mapping_keeps_the_teacher_on_that_tab(built):
    from tests.pp5_fixture import build as fx
    from tests.test_e2e import load_pp5_steps
    out = drive(built, load_pp5_steps(fx(), extra=f"""
    document.getElementById('tab3').click();
    var ph = document.querySelector('input[name=phase][value=pre]'); ph.checked = true; ph.dispatchEvent(new Event('change')); await sleep(150);
    out.after = {_sel()};
    """))
    assert out["after"] == ["false", "false", "true"], out["after"]
