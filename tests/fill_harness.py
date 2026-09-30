"""ยัด payload + สคริปต์กรอกลงหน้า SGS จำลอง แล้วอ่านผล (ย้ายมาจาก vichakarn tests/test_sgs.py)"""

from __future__ import annotations

import json
import sys

from tests.chrome import ROOT, run_page

sys.path.insert(0, str(ROOT / "mock-sgs"))
import mock_sgs                                                    # noqa: E402,F401

SCRIPT = ROOT / "fill" / "sgs_fill.js"

PROBE = """
<script>
(function () {
  var out = {result: window.__sgsResult ? {
    items: window.__sgsResult.items, canFill: window.__sgsResult.canFill,
    matched: window.__sgsResult.matched.length} : null};
  var go = document.getElementById('sgs-fill-go');
  if (go && %(click)s && !go.disabled) { go.click(); }
  var rows = document.querySelectorAll('#grid tr[data-row]');
  out.values = {};
  for (var i = 0; i < rows.length; i++) {
    var code = null;
    for (var c = 0; c < rows[i].cells.length; c++) {
      if (/^\\d{5}$/.test(rows[i].cells[c].innerText.trim())) { code = rows[i].cells[c].innerText.trim(); break; }
    }
    out.values[code] = ['S1','Midterm','S10','Final','TotalPercent','Q1','Q2','Q8','Q9','Q10',
                        'L1','L2','L3','L4','L5','LGrade'].map(function (f) {
      var el = rows[i].querySelector('input[id$="_' + f + '"]'); return el ? el.value : null; });
  }
  var r = document.getElementById('sgs-fill-result'); out.message = r ? r.textContent : null;
  out.rejected = window.__mockRejected || 0;
  document.title = 'SGSFILL' + encodeURIComponent(JSON.stringify({ok: true, value: out}));
})();
</script>
"""


def run_on_mock(page_html: str, payload, *, click: bool = True) -> dict:
    text = payload if isinstance(payload, str) else json.dumps(payload, ensure_ascii=False)
    inject = (
        "<script>window.__SGS_TEST_PAYLOAD__ = " + json.dumps(text) + ";</script>"
        "<script>" + SCRIPT.read_text(encoding="utf-8") + "</script>"
        + PROBE % {"click": "true" if click else "false"}
    )
    return run_page(page_html.replace("</body>", inject + "</body>"))


CODES = ["10001", "10002", "10003"]


def score_payload(codes=CODES, **over):
    p = {
        "v": 1, "kind": "score", "page_label": "บันทึกผลการเรียน", "subject": "ค21101",
        "section": "1", "room": "ม.1/1", "phase": "score", "phase_label": "คะแนน",
        "fields": [{"id": "S1", "max": 25}, {"id": "Midterm", "max": 20}],
        "students": [{"code": c, "values": [20 + i, 15 + i]} for i, c in enumerate(codes)],
        "skip": [], "incomplete": [], "blank": [], "strict": True,
    }
    p.update(over)
    return p


def failed(out) -> list[str]:
    return [i["label"] for i in out["result"]["items"] if not i["ok"] and i["label"]]
