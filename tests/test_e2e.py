"""ครบวง: หน้าเว็บ (วาง/ไฟล์ → จับคู่ → payload) แล้วยัด payload ลงหน้า SGS จำลอง → กรอก → อ่านกลับ

หน้าเว็บรันภายใต้ CSP จริง: ใส่สคริปต์ขับเทสต์ โดยเพิ่มแฮชของมันเข้า CSP เท่านั้น
"""

import base64
import hashlib
import io
import json
import re

import openpyxl
import pytest

import build
from tests.chrome import run_page
from tests.conftest import needs_chrome
from tests.fill_harness import mock_sgs, run_on_mock


@pytest.fixture(scope="module")
def site(tmp_path_factory):
    out = tmp_path_factory.mktemp("site") / "index.html"
    build.build(out)
    return out.read_text(encoding="utf-8")


DRIVER_JS = """
(async function () {
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var out = {};
  try {
    %(steps)s
    await sleep(50);
    out.payload = SF.app.payloadText();
    out.report = document.getElementById('report').innerText;
    out.copyDisabled = document.getElementById('copy').disabled;
    out.ok = true;
  } catch (e) { out.ok = false; out.error = String(e && e.message || e); }
  document.title = 'SGSFILL' + encodeURIComponent(JSON.stringify({ok: true, value: out}));
})();
"""


def with_driver(site: str, steps: str) -> str:
    """ใส่สคริปต์ขับเทสต์ โดยเพิ่มแฮชของมันเข้า CSP เท่านั้น — ตัวหน้าเว็บยังรันภายใต้ CSP จริง
    (ถ้าแฮชของสคริปต์แอปผิด แอปจะไม่ทำงานและเทสต์ล้ม)"""
    js = DRIVER_JS % {"steps": steps}
    digest = base64.b64encode(hashlib.sha256(js.encode("utf-8")).digest()).decode()
    site = re.sub(r"script-src '(sha256-[^']+)'",
                  lambda m: f"script-src '{m.group(1)}' 'sha256-{digest}'", site, count=1)
    return site.replace("</body>", "<script>" + js + "</script></body>")


def drive(site: str, steps: str) -> dict:
    return run_page(with_driver(site, steps))


def paste_steps(text: str, target: str = "score", extra: str = "") -> str:
    return f"""
    if ({json.dumps(target)} !== 'score') {{
      var r = document.querySelector('input[name=target][value={target}]'); r.checked = true; r.dispatchEvent(new Event('change'));
    }}
    var ta = document.getElementById('paste'); ta.value = {json.dumps(text)}; ta.dispatchEvent(new Event('input'));
    await sleep(50);
    {extra}
    """


TSV = "เลขที่\tเลขประจำตัว\tชื่อ\tก่อนกลางภาค\tกลางภาค\n1\t10001\tสมมุติ\t20\t15\n2\t10002\tสมมุติ\t21\t16\n3\t10003\tสมมุติ\t22\t17\n"


@needs_chrome
def test_paste_then_copy_then_fill_the_mock_end_to_end(site):
    out = drive(site, paste_steps(TSV, extra="document.getElementById('subject').value='ค21101'; document.getElementById('subject').dispatchEvent(new Event('input')); document.getElementById('section').value='1'; document.getElementById('section').dispatchEvent(new Event('input'));"))
    assert out["ok"] and out["copyDisabled"] is False and "พร้อมคัดลอก 3 คน" in out["report"]
    payload = json.loads(out["payload"])
    assert payload["fields"] == [{"id": "S1"}, {"id": "Midterm"}] and payload["strict"] is False

    fill = run_on_mock(mock_sgs.render(["10003", "10001", "10002", "10004"]), out["payload"])
    assert fill["result"]["canFill"] is True
    assert fill["values"]["10001"][:2] == ["20", "15"] and fill["values"]["10004"][0] == ""
    assert "อ่านกลับตรงทุกช่อง" in fill["message"]


@needs_chrome
def test_an_xlsx_file_with_numeric_codes_is_padded_and_fills_the_mock(site):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["รหัส", "ก่อนกลาง", "กลาง"])
    for i in range(3):
        ws.append([1 + i, 20 + i, 15 + i])                 # รหัส 1,2,3 → ต้องเป็น 00001..00003
    buf = io.BytesIO()
    wb.save(buf)
    b64 = base64.b64encode(buf.getvalue()).decode()
    steps = f"""
    var bytes = Uint8Array.from(atob({json.dumps(b64)}), function (c) {{ return c.charCodeAt(0); }});
    var dt = new DataTransfer(); dt.items.add(new File([bytes], 'คะแนน.xlsx'));
    var f = document.getElementById('file'); f.files = dt.files; f.dispatchEvent(new Event('change'));
    await sleep(400);
    """
    out = drive(site, steps)
    payload = json.loads(out["payload"])
    assert [s["code"] for s in payload["students"]] == ["00001", "00002", "00003"]
    fill = run_on_mock(mock_sgs.render(["00001", "00002", "00003"]), out["payload"])
    assert fill["result"]["canFill"] is True and fill["values"]["00003"][:2] == ["22", "17"]


@needs_chrome
def test_reading_page_with_fill45_matches_what_sgs_needs(site):
    text = "รหัส\tครั้งที่ 1\tครั้งที่ 2\tครั้งที่ 3\n10001\t1\t2\t2\n10002\t2\t3\t3\n10003\t3\t3\t3\n"
    out = drive(site, paste_steps(text, "reading"))
    payload = json.loads(out["payload"])
    assert [s["values"] for s in payload["students"]] == [[1, 2, 2, 2, 2], [2, 3, 3, 3, 3], [3, 3, 3, 3, 3]]
    fill = run_on_mock(mock_sgs.render_matrix(["10001", "10002", "10003"], page="reading"), out["payload"])
    assert fill["result"]["canFill"] is True
    assert fill["values"]["10002"][10:15] == ["2", "3", "3", "3", "3"]


@needs_chrome
def test_reading_junk_in_columns_4_and_5_is_ignored_when_fill45_is_on(site):
    text = "รหัส\tครั้งที่ 1\tครั้งที่ 2\tครั้งที่ 3\tครั้งที่ 4\tครั้งที่ 5\n10001\t1\t2\t2\t-\t\n"
    out = drive(site, paste_steps(text, "reading"))
    assert out["copyDisabled"] is False
    assert json.loads(out["payload"])["students"] == [{"code": "10001", "values": [1, 2, 2, 2, 2]}]


@needs_chrome
def test_desirable_page_leaves_unmapped_questions_blank(site):
    head = "รหัส\t" + "\t".join(f"ข้อ {i}" for i in range(1, 9)) + "\n"
    text = head + "10001\t" + "\t".join(["3"] * 8) + "\n"
    out = drive(site, paste_steps(text, "desirable"))
    payload = json.loads(out["payload"])
    assert payload["blank"] == ["Q9", "Q10"]
    fill = run_on_mock(mock_sgs.render_matrix(["10001"]), out["payload"])
    assert fill["result"]["canFill"] is True
    assert fill["values"]["10001"][8] == "" and fill["values"]["10001"][9] == ""


@needs_chrome
def test_the_copy_button_stays_disabled_while_there_are_blocking_errors(site):
    text = "รหัส\tก่อนกลาง\n10001\t30\n"                       # 30 เกินคะแนนเต็ม 25 ที่ครูกรอก
    out = drive(site, paste_steps(text, extra="var m=document.getElementById('max_S1'); m.value='25'; m.dispatchEvent(new Event('input'));"))
    assert out["copyDisabled"] is True and out["payload"] == ""
    assert "เกินคะแนนเต็ม" in out["report"]


@needs_chrome
def test_no_data_yet_gives_a_friendly_report_and_disabled_copy(site):
    out = drive(site, "")
    assert out["copyDisabled"] is True and "ยังไม่มีข้อมูล" in out["report"]


@needs_chrome
def test_two_row_header_can_be_chosen_by_the_teacher(site):
    """Review Focus 5: หัวตารางสองชั้น — ครูเลือกแถวหัวตารางที่ 2"""
    text = "ผลการเรียน\t\t\nรหัส\tก่อนกลาง\tกลาง\n10001\t20\t15\n"
    out = drive(site, paste_steps(text, extra="var h=document.getElementById('headerRow'); h.value='2'; h.dispatchEvent(new Event('input')); await sleep(50);"))
    assert json.loads(out["payload"])["students"] == [{"code": "10001", "values": [20, 15]}]


@needs_chrome
def test_the_problem_report_button_works_without_error(site):
    steps = paste_steps(TSV) + """
    var written = null;
    Object.defineProperty(navigator, 'clipboard', {value: {writeText: async function (t) { written = t; }}, configurable: true});
    document.getElementById('copyReport').click(); await sleep(50);
    out.written = written;
    """
    out = drive(site, steps)
    assert out["ok"]


@needs_chrome
def test_page_never_scrolls_sideways_even_with_a_wide_preview_table(site):
    """จอแคบ: ตารางตัวอย่างที่ห้ามตัดบรรทัดต้องเลื่อนในกล่องของมันเอง ไม่ดันทั้งหน้า"""
    wide = "รหัส\t" + "\t".join(f"คอลัมน์ยาว ๆ หมายเลข {i}" for i in range(30)) + "\n10001\t" + "\t".join(["1"] * 30) + "\n"
    steps = paste_steps(wide) + """
    out.iw = window.innerWidth; out.sw = document.documentElement.scrollWidth;
    """
    out = drive(site, steps)
    assert out["ok"] and out["sw"] <= out["iw"], (out["sw"], out["iw"])


# ── Final review, Important 2: ครูเห็นหน้าตาของคอลัมน์ที่จับคู่ และถูกเตือนเรื่องหัวตารางสองชั้น ──

@needs_chrome
def test_each_mapped_column_shows_a_sample_and_range_next_to_its_dropdown(site):
    steps = paste_steps(TSV) + "out.stats = document.getElementById('stats_S1').textContent;"
    out = drive(site, steps)
    assert "20" in out["stats"] and "22" in out["stats"] and "–" in out["stats"], out["stats"]


@needs_chrome
def test_merged_header_over_sub_scores_warns_before_the_teacher_copies(site):
    text = "รหัส\tก่อนกลางภาค\t\t\n\tงาน1\tงาน2\tรวม\n07112\t10\t12\t22\n"
    out = drive(site, paste_steps(text))
    assert "หัวตารางชั้นที่สอง" in out["report"], out["report"]
