import json

from tests.chrome import run_js
from tests.conftest import needs_chrome

MODS = ("text", "mapping")


def guess(header, target):
    return run_js("return SF.guessColumns(%s, %r);" % (json.dumps(header, ensure_ascii=False), target),
                  modules=MODS)


@needs_chrome
def test_score_headers_are_matched_and_before_midterm_is_not_confused_with_midterm():
    g = guess(["เลขที่", "เลขประจำตัว", "ชื่อ", "คะแนนก่อนกลางภาค", "สอบกลางภาค",
               "คะแนนหลังกลางภาค", "สอบปลายภาค"], "score")
    assert g == {"codeCol": 1, "fieldCols": {"S1": 3, "Midterm": 4, "S10": 5, "Final": 6}}


@needs_chrome
def test_english_headers_and_case():
    g = guess(["Student ID", "S1", "Midterm", "S10", "FINAL"], "score")
    assert g == {"codeCol": 0, "fieldCols": {"S1": 1, "Midterm": 2, "S10": 3, "Final": 4}}


@needs_chrome
def test_desirable_numbered_columns():
    g = guess(["รหัสนักเรียน", "ข้อ 1", "ข้อ 2", "๓", "Q4", "10"], "desirable")
    assert g["codeCol"] == 0
    assert g["fieldCols"] == {"Q1": 1, "Q2": 2, "Q3": 3, "Q4": 4, "Q10": 5}


@needs_chrome
def test_reading_numbered_columns_and_out_of_range_numbers_are_ignored():
    g = guess(["รหัส", "ครั้งที่ 1", "ครั้งที่ 2", "ครั้งที่ 3", "ครั้งที่ 9"], "reading")
    assert g["fieldCols"] == {"L1": 1, "L2": 2, "L3": 3}


@needs_chrome
def test_nothing_recognised_gives_minus_one_and_empty_map():
    assert guess(["ก", "ข"], "score") == {"codeCol": -1, "fieldCols": {}}


@needs_chrome
def test_targets_describe_the_three_sgs_pages():
    t = run_js("return SF.TARGETS;", modules=MODS)
    assert [f["id"] for f in t["score"]["fields"]] == ["S1", "Midterm", "S10", "Final"]
    assert len(t["desirable"]["fields"]) == 10 and t["desirable"]["limit"] == 3
    assert len(t["reading"]["fields"]) == 5 and t["reading"]["kind"] == "matrix"
    assert t["score"]["page_label"] == "บันทึกผลการเรียน"
