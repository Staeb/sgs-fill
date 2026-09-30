import pytest

from tests.chrome import run_js
from tests.conftest import needs_chrome
from tests.pp5_fixture import build, to_b64

MODS = ("text", "xlsx", "mapping", "pp5")


def call(b64: str, expr: str):
    return run_js(
        "const u8 = Uint8Array.from(atob(%r), c => c.charCodeAt(0));"
        "const wb = await SF.readXlsx(u8.buffer); const info = SF.detectPp5(wb.sheets);"
        "return %s;" % (b64, expr), modules=MODS)


@needs_chrome
def test_a_pp5_workbook_is_recognised_with_subject_room_and_section():
    info = call(to_b64(build()), "info")
    assert info["subject"] == "ค21101" and info["room"] == "ม.1/1" and info["section"] == "1"
    assert info["sheets"]["pre"] >= 0 and info["sheets"]["post"] >= 0 and info["sheets"]["eval"] >= 0


@needs_chrome
def test_an_ordinary_workbook_is_not_a_pp5():
    import openpyxl
    wb = openpyxl.Workbook()
    wb.active.append(["รหัส", "คะแนน"])
    assert call(to_b64(wb), "info") is None


@needs_chrome
def test_score_extraction_finds_totals_by_header_text_and_the_full_marks():
    out = call(to_b64(build()), "SF.pp5Extract(info, wb.sheets, 'score')")
    assert out["ok"] is True
    assert out["table"][0][:2] == ["เลขประจำตัว", "ชื่อ - สกุล"]
    assert out["table"][0][2:] == ["ก่อนกลางภาค (S1)", "กลางภาค (Midterm)", "หลังกลางภาค (S10)", "ปลายภาค (Final)"]
    assert out["guess"] == {"codeCol": 0, "fieldCols": {"S1": 2, "Midterm": 3, "S10": 4, "Final": 5}}
    assert out["maxByField"] == {"S1": 25, "Midterm": 20, "S10": 25, "Final": 30}
    assert [row[0] for row in out["table"][1:]] == ["10001", "10002", "10003"]
    assert out["table"][1][2:] == ["18", "12", "21", "20"]
    assert out["table"][3][2:] == ["22", "14", "25", "22"]


@needs_chrome
def test_score_extraction_reports_which_pair_has_data():
    """ต้นเทอม ปลายภาคยังว่าง — UI ใช้ค่านี้เลือกช่วง ก่อน+กลาง เป็นค่าเริ่มต้น"""
    out = call(to_b64(build(with_final=False)), "SF.pp5Extract(info, wb.sheets, 'score')")
    assert out["hasData"] == {"S1": True, "Midterm": True, "S10": True, "Final": False}


@needs_chrome
def test_the_template_typo_in_the_post_midterm_header_is_tolerated():
    out = call(to_b64(build()), "SF.pp5Extract(info, wb.sheets, 'score')")
    assert out["guess"]["fieldCols"]["S10"] == 4          # "คะแนนหลังกลงภาค" (สะกดผิดในแม่แบบ)


@needs_chrome
def test_desirable_columns_come_from_the_full_marks_row_not_the_header_text():
    out = call(to_b64(build()), "SF.pp5Extract(info, wb.sheets, 'desirable')")
    assert out["ok"] is True
    assert list(out["guess"]["fieldCols"]) == [f"Q{i}" for i in range(1, 9)]
    assert out["table"][1][0] == "10001" and len(out["table"][0]) == 2 + 8
    assert out["table"][1][2:] == ["3", "2", "3", "2", "3", "2", "3", "2"]


@needs_chrome
def test_reading_columns_are_the_numbered_one_to_five():
    out = call(to_b64(build()), "SF.pp5Extract(info, wb.sheets, 'reading')")
    assert list(out["guess"]["fieldCols"]) == [f"L{i}" for i in range(1, 6)]
    assert out["table"][1][2:] == ["2", "2", "3", "", ""]
    assert out["hasData"]["L1"] is True and out["hasData"]["L4"] is False


@needs_chrome
def test_a_missing_sheet_gives_a_clear_message_instead_of_guessing():
    wb = build()
    del wb["คุณลักษณะ-การอ่าน"]
    out = call(to_b64(wb), "SF.pp5Extract(info, wb.sheets, 'desirable')")
    assert out["ok"] is False and "คุณลักษณะ" in out["message"]


@needs_chrome
def test_missing_basic_data_still_extracts_but_leaves_subject_blank():
    info = call(to_b64(build(with_basic=False)), "info")
    assert info["subject"] == "" and info["section"] == ""
    out = call(to_b64(build(with_basic=False)), "SF.pp5Extract(info, wb.sheets, 'score')")
    assert out["ok"] is True


@needs_chrome
def test_blank_template_rows_after_the_students_are_not_returned():
    out = call(to_b64(build()), "SF.pp5Extract(info, wb.sheets, 'score')")
    assert len(out["table"]) == 1 + 3
