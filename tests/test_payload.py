import itertools
import json

import pytest

from tests.chrome import run_js
from tests.conftest import needs_chrome

MODS = ("text", "mapping", "validate", "payload")


def make(target, rows, field_cols, meta=None, **cfg):
    conf = {"targetKey": target, "codeCol": 0, "fieldCols": field_cols, "pad": 5, "maxByField": {}}
    conf.update(cfg)
    m = {"version": "1.0.0"}
    m.update(meta or {})
    return run_js(
        "const r = SF.validate(%s, %s); return SF.buildPayload(%r, r, %s);" % (
            json.dumps(rows, ensure_ascii=False), json.dumps(conf), target, json.dumps(m)),
        modules=MODS)


@needs_chrome
def test_score_payload_has_codes_values_and_no_max_unless_given():
    p = make("score", [["7112", "18", "15"]], {"S1": 1, "Midterm": 2},
             {"subject": "ค21101", "section": "1", "strict": False})
    assert p["v"] == 1 and p["kind"] == "score" and p["phase"] == "score"
    assert p["fields"] == [{"id": "S1"}, {"id": "Midterm"}]
    assert p["students"] == [{"code": "07112", "values": [18, 15]}]
    assert p["subject"] == "ค21101" and p["section"] == "1" and p["strict"] is False
    assert p["producer"] == "sgs-fill" and p["script_version"] == "1.0.0"
    assert p["page_label"] == "บันทึกผลการเรียน"


@needs_chrome
def test_score_max_is_included_when_the_teacher_gave_it():
    p = make("score", [["07112", "18", "15"]], {"S1": 1, "Midterm": 2},
             {"maxByField": {"S1": 25, "Midterm": 20}}, maxByField={"S1": 25, "Midterm": 20})
    assert p["fields"] == [{"id": "S1", "max": 25}, {"id": "Midterm", "max": 20}]


@needs_chrome
def test_desirable_payload_lists_unmapped_fields_as_blank_and_carries_the_limit():
    p = make("desirable", [["07112"] + ["3"] * 8], {f"Q{i}": i for i in range(1, 9)})
    assert p["kind"] == "matrix" and p["limit"] == 3
    assert [f["id"] for f in p["fields"]] == [f"Q{i}" for i in range(1, 9)]
    assert p["blank"] == ["Q9", "Q10"]


@needs_chrome
def test_reading_fill45_appends_the_rounded_mean_twice_and_drops_mapped_l4_l5():
    rows = [["07112", "1", "2", "2", "9", "9"], ["07113", "2", "3", "3", "9", "9"]]
    p = make("reading", rows, {"L1": 1, "L2": 2, "L3": 3, "L4": 4, "L5": 5},
             {"presets": {"fill45": True}})
    assert [f["id"] for f in p["fields"]] == ["L1", "L2", "L3", "L4", "L5"]
    assert [s["values"] for s in p["students"]] == [[1, 2, 2, 2, 2], [2, 3, 3, 3, 3]]
    assert p["note"]["label"] and p["blank"] == []


@needs_chrome
def test_reading_fill45_needs_the_first_three_columns():
    with pytest.raises(RuntimeError, match="ครั้งที่ 1-3"):
        make("reading", [["07112", "1", "2"]], {"L1": 1, "L2": 2}, {"presets": {"fill45": True}})


@needs_chrome
def test_fill45_never_changes_the_rounded_result_for_every_possible_input():
    """พิสูจน์ครบ 27 ชุด: ค่าเฉลี่ยปัดของ 5 ช่องเท่ากับผลจาก 3 ช่องเสมอ"""
    combos = [list(c) for c in itertools.product((1, 2, 3), repeat=3)]
    out = run_js(
        "return %s.map(function (c) { var r = SF.roundHalfUp((c[0]+c[1]+c[2])/3);"
        " return SF.roundHalfUp((c[0]+c[1]+c[2]+r+r)/5) === r; });" % json.dumps(combos),
        modules=MODS)
    assert all(out) and len(out) == 27


@needs_chrome
def test_report_has_counts_and_versions_but_never_codes_or_scores():
    """ข้อกำหนด: รายงานปัญหาห้ามมีข้อมูลนักเรียน"""
    rows = [["07112", "18", "15"], ["07113", "ขส", "10"], ["07112", "1", "1"]]
    text = run_js(
        "const r = SF.validate(%s, {targetKey:'score', codeCol:0, fieldCols:{S1:1,Midterm:2}, pad:5, maxByField:{}});"
        "return SF.buildReport({version:'1.0.0', targetKey:'score', result:r, mode:'lenient', userAgent:'UA'});"
        % json.dumps(rows, ensure_ascii=False), modules=MODS)
    assert "1.0.0" in text and "score" in text and "DUP" in text
    for secret in ("07112", "07113", "ขส", "18", "15"):
        assert secret not in text.replace("1.0.0", "")
