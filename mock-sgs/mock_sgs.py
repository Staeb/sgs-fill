"""หน้า SGS จำลอง "บันทึกผลการเรียน" — ไว้ทดสอบสคริปต์กรอกโดยไม่แตะหน้าจริง

โครงเดียวกับหน้าจริงที่สำรวจไว้ (เฉพาะโครงสร้าง ไม่มีข้อมูลนักเรียน):
  - แถวละหนึ่ง <tr> เซลล์: ว่าง · ห้อง · เลขที่ · เลขประจำตัว · ชื่อ · S1 S2 S3 Midterm S10 S11 S12 Final
    · TotalPercent · Gr · ReGr · RepeatGr · Remark
  - ช่อง id = ctl00_PageContent_TblTranscriptsTableControlRepeater_ctl{NN}_{ช่อง}
  - onchange เรียก CheckValue(...) ที่คำนวณ % กับเกรด (ที่นี่จำลองเอง)
  - ช่องที่ยังไม่เปิดกรอกเป็น disabled

ใช้ด้วยมือ: python tools/mock_sgs/mock_sgs.py --out /tmp/mock.html --open pre
"""

from __future__ import annotations

import argparse
import html as _html
import sys
from pathlib import Path

FIELDS = ("S1", "S2", "S3", "Midterm", "S10", "S11", "S12", "Final")
DEFAULT_MAX = {"S1": 25, "S2": 0, "S3": 0, "Midterm": 20, "S10": 25, "S11": 0, "S12": 0, "Final": 30}
HEADER_LABEL = {"S1": "1", "S2": "2", "S3": "3", "Midterm": "กลางภาค",
                "S10": "10", "S11": "11", "S12": "12", "Final": "ปลายภาค"}
OPEN = {
    "pre": ("S1", "Midterm"),
    "post": ("S10", "Final"),
    "none": (),
    "all": FIELDS,
}
PREFIX = "ctl00_PageContent_TblTranscriptsTableControlRepeater_ctl"


def _wrap(input_html: str, base_id: str) -> str:
    """หน้าจริงห่อช่องกรอกไว้ในตารางย่อย: <table><tr><td>ช่อง</td><td>&nbsp;<span ตัวตรวจ></td></tr></table>
    closest('tr') ของช่องจึงได้แถวของตารางย่อย ไม่ใช่แถวของนักเรียน — เคยพลาดตรงนี้มาแล้ว"""
    return (
        f'<table cellpadding="0" cellspacing="0" border="0"><tbody><tr><td>{input_html}</td>'
        f'<td>&nbsp;<span id="{base_id}TextBoxMaxLengthValidator"></span></td></tr></tbody></table>'
    )


def render(
    codes: list[str],
    *,
    subject: str = "ค21101 คณิตศาสตร์ 1 ม.1",
    section: str = "1",
    open_phase: str = "pre",
    maxes: dict[str, int] | None = None,
    percent_offset: float = 0.0,
    visible_rows: int | None = None,
) -> str:
    """codes = รหัสนักเรียนตามลำดับแถวบนหน้า (ชื่อใช้ตัวแทนเสมอ)

    visible_rows: SGS จริงแสดง 10 แถวเป็นค่าเริ่มต้น — ใส่ตัวเลขเพื่อซ่อนแถวที่เหลือไว้หน้าถัดไป
    (ปุ่ม NextPage จะกดได้ เหมือนของจริง)"""
    mx = {**DEFAULT_MAX, **(maxes or {})}
    has_more = visible_rows is not None and visible_rows < len(codes)
    if visible_rows is not None:
        codes = codes[:visible_rows]
    enabled = OPEN[open_phase]

    head = "".join(
        f"<th>{HEADER_LABEL[f]} {mx[f]}</th>" for f in FIELDS
    )
    rows = []
    for n, code in enumerate(codes):
        cells = [
            "<td></td>",
            "<td>1</td>",
            f"<td>{n + 1}</td>",
            f"<td>{_html.escape(code)}</td>",
            "<td>นักเรียนสมมุติ</td>",
        ]
        for f in FIELDS:
            dis = "" if f in enabled else ' disabled="disabled"'
            # ช่องเต็ม 0 ในหน้าจริงไม่มี CheckValue ที่อ่านค่าเต็มได้ครบ — คงพฤติกรรมนั้นไว้
            handler = (
                f"CheckValue(document.getElementById('{PREFIX}{n:02d}_{f}'),'{f}','{mx[f]}','1',"
                f"'{PREFIX}{n:02d}_TotalPercent','{PREFIX}{n:02d}_Gr');return false;"
            )
            cells.append(
                f'<td>{_wrap(f'<input name="ctl00$PageContent$Repeater$ctl{n:02d}${f}" type="text" maxlength="20" size="2" id="{PREFIX}{n:02d}_{f}"{dis} onchange="{handler}" value="">', f"{PREFIX}{n:02d}_{f}")}</td>'
            )
        for extra in ("TotalPercent", "Gr", "ReGr", "RepeatGr", "Remark"):
            cells.append(
                f'<td><input name="x${extra}" type="text" id="{PREFIX}{n:02d}_{extra}" '
                'disabled="disabled" value=""></td>'
            )
        rows.append("<tr data-row>" + "".join(cells) + "</tr>")

    return f"""<!DOCTYPE html>
<html lang="th"><head><meta charset="utf-8"><title>SGS จำลอง</title></head>
<body>
<form>
<table><tr><td>
  <select name="ctl00$PageContent$ClassSubjectIDFilter"><option selected>{_html.escape(subject)}</option><option>ค99999 วิชาอื่น ม.1</option></select>
  <select name="ctl00$PageContent$ClassSectionNoFilter"><option selected>{_html.escape(section)}</option><option>9</option></select>
</td></tr></table>
<input type="image" name="ctl00$PageContent$Pagination$_NextPage" id="ctl00_PageContent_Pagination__NextPage"{' ' if has_more else ' disabled="disabled"'}>
<table id="grid">
<tr><th></th><th>ห้อง</th><th>เลขที่</th><th>เลขประจำตัว</th><th>ชื่อ-นามสกุล</th>{head}<th>%</th><th>ปกติ</th><th>แก้ตัว</th><th>เรียนซ้ำ</th><th>Remark</th></tr>
{"".join(rows)}
</table>
</form>
<script>
/* จำลอง CheckValue ของหน้าจริง: ตรวจเกินเต็ม แล้วคำนวณ % รวมจากทุกช่องที่กรอก */
var PERCENT_OFFSET = {percent_offset};
function CheckValue(el, field, max, key, pctId, grId) {{
  var v = parseFloat(el.value);
  if (el.value !== '' && (isNaN(v) || v < 0 || v > parseFloat(max))) {{ window.__mockRejected = (window.__mockRejected || 0) + 1; el.value = ''; }}
  var row = el.closest('tr[data-row]'), sum = 0, total = 0;
  {list(FIELDS)!r}.forEach(function (f) {{
    var i = row.querySelector('input[id$="_' + f + '"]');
    var m = {mx!r}[f];
    total += m;
    var x = parseFloat(i.value);
    if (!isNaN(x)) sum += x;
  }});
  var pct = (sum / total) * 100 + PERCENT_OFFSET;
  document.getElementById(pctId).value = pct.toFixed(2);
  document.getElementById(grId).value = pct >= 50 ? 'ผ่าน' : 'ไม่ผ่าน';
}}
</script>
</body></html>
"""


# ── หน้าแบบตารางช่อง (คุณลักษณะ Q1–Q10 · การอ่านคิดฯ L1–L5) ──
# โครงตามหน้าจริงที่สำรวจ: วิชา · กลุ่ม · ห้อง · เลขที่ · เลขประจำตัว/รหัสนักเรียน · ชื่อ · ช่องกรอก · รวม · ผลการประเมิน · หมายเหตุ
# CheckValue รับ element เดียว ปฏิเสธตัวเลขเกินค่าสูงสุด (จริง = 3) แล้วล้างช่อง — ที่นี่นับไว้ใน __mockRejected
MATRIX_PAGES = {
    "desirable": {"prefix": "TblTranscriptsQTableControlRepeater", "fields": [f"Q{i}" for i in range(1, 11)],
                  "code_header": "เลขประจำตัว", "mark": "QualityMark", "grade": "QGrade", "grade_editable": False,
                  "subject": "ค20201 คณิตศาสตร์เพิ่มเติม 1 ม.1"},
    "reading": {"prefix": "TblTranscriptsLTableControlRepeater", "fields": [f"L{i}" for i in range(1, 6)],
                "code_header": "รหัสนักเรียน", "mark": "LiteratureMark", "grade": "LGrade", "grade_editable": True,
                "subject": "ค20201 คณิตศาสตร์เพิ่มเติม 1, ชั้น ม.1"},
}


def render_matrix(
    codes: list[str],
    *,
    page: str = "desirable",
    subject: str | None = None,
    section: str = "1",
    enabled: bool = True,
    limit: int = 3,
    visible_rows: int | None = None,
) -> str:
    has_more = visible_rows is not None and visible_rows < len(codes)
    if visible_rows is not None:
        codes = codes[:visible_rows]
    spec = MATRIX_PAGES[page]
    subject = subject or spec["subject"]
    fields = spec["fields"]
    pre = f"ctl00_PageContent_{spec['prefix']}_ctl"
    head = "".join(f"<th>{i}</th>" for i in range(1, len(fields) + 1))
    rows = []
    for n, code in enumerate(codes):
        cells = [
            "<td></td>", "<td></td>", "<td>ค20201 คณิตศาสตร์เพิ่มเติม 1</td>", "<td>1</td>", "<td>1</td>",
            f"<td>{n + 1}</td>", f"<td>{_html.escape(code)}</td>", "<td>นักเรียนสมมุติ</td>",
        ]
        dis = "" if enabled else ' disabled="disabled"'
        for f in fields:
            inp = (
                f'<input name="ctl00$PageContent$Repeater$ctl{n:02d}${f}" type="text" maxlength="7" '
                f'size="1" id="{pre}{n:02d}_{f}"{dis} '
                f"onchange=\"CheckValue(document.getElementById('{pre}{n:02d}_{f}'));return false;\" value=\"\">"
            )
            cells.append(f"<td>{_wrap(inp, f'{pre}{n:02d}_{f}')}</td>")
        cells.append(f'<td><input type="text" id="{pre}{n:02d}_{spec["mark"]}" disabled="disabled" value=""></td>')
        gdis = "" if spec["grade_editable"] else ' disabled="disabled"'
        cells.append(f'<td><input type="text" maxlength="1" id="{pre}{n:02d}_{spec["grade"]}"{gdis} value=""></td>')
        cells.append(f'<td><input type="text" id="{pre}{n:02d}_Remark" value=""></td>')
        rows.append("<tr data-row>" + "".join(cells) + "</tr>")

    return f"""<!DOCTYPE html>
<html lang="th"><head><meta charset="utf-8"><title>SGS จำลอง</title></head>
<body><form>
<table><tr><td>
  <select name="ctl00$PageContent$ClassSubjectIDFilter"><option selected>{_html.escape(subject)}</option></select>
  <select name="ctl00$PageContent$ClassSectionNoFilter"><option selected>{_html.escape(section)}</option></select>
</td></tr></table>
<input type="image" name="ctl00$PageContent$Pagination$_NextPage" id="ctl00_PageContent_Pagination__NextPage"{' ' if has_more else ' disabled="disabled"'}>
<table id="grid">
<tr><th></th><th></th><th>วิชา</th><th>กลุ่ม</th><th>ห้อง</th><th>เลขที่</th><th>{spec["code_header"]}</th><th>ชื่อ นามสกุล</th>{head}<th>รวม</th><th>ผลการประเมิน</th><th>หมายเหตุ</th></tr>
{"".join(rows)}
</table></form>
<script>
function CheckValue(cid) {{
  var cval = cid.value
  var n = cid.name.indexOf("Remark");
  if ((parseFloat(cval) > {limit} || isNaN(cval)) && (n == -1)) {{
    window.__mockRejected = (window.__mockRejected || 0) + 1;
    document.getElementById(cid.id).value = "";
  }}
}}
</script>
</body></html>
"""


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--open", default="pre", choices=list(OPEN))
    ap.add_argument("--codes", default="10001,10002,10003")
    a = ap.parse_args()
    Path(a.out).write_text(render(a.codes.split(","), open_phase=a.open), encoding="utf-8")
    print(a.out, file=sys.stderr)
