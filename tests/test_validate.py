import json

from tests.chrome import run_js
from tests.conftest import needs_chrome

MODS = ("text", "mapping", "validate")


def validate(rows, **cfg):
    base = {"targetKey": "score", "codeCol": 0, "fieldCols": {"S1": 1, "Midterm": 2},
            "pad": 5, "maxByField": {"S1": 25, "Midterm": 20}}
    base.update(cfg)
    return run_js("return SF.validate(%s, %s);" % (
        json.dumps(rows, ensure_ascii=False), json.dumps(base)), modules=MODS)


@needs_chrome
def test_codes_lose_leading_zeros_in_excel_and_are_padded_back():
    """Review Focus 1"""
    r = validate([["7112", "18", "15"], ["๗๑๑๓", "19", "16"], ["07114.0", "20", "17"]])
    assert [s["code"] for s in r["students"]] == ["07112", "07113", "07114"]


@needs_chrome
def test_pad_zero_leaves_codes_alone():
    r = validate([["7112", "18", "15"]], pad=0)
    assert r["students"][0]["code"] == "7112"


@needs_chrome
def test_thai_digits_and_decimal_comma_in_scores():
    """Review Focus 2"""
    r = validate([["07113", "๑๘", "12,5"], ["07114", " 20 ", "1,250"]])
    assert r["students"][0]["values"] == [18, 12.5]
    assert r["incomplete"][0]["code"] == "07114"
    assert any("1,250" in p for p in r["incomplete"][0]["problems"])


@needs_chrome
def test_marker_text_is_never_zero_and_names_the_reason():
    """Review Focus 3"""
    r = validate([["07114", "ขส", "10"], ["07115", "18", ""], ["07116", "ร", "-"], ["07117", "18", "15"]])
    assert [s["code"] for s in r["students"]] == ["07117"]
    by = {i["code"]: i["problems"] for i in r["incomplete"]}
    assert any("ขส" in p for p in by["07114"])
    assert any("ว่าง" in p for p in by["07115"])
    assert len(by["07116"]) == 2
    assert r["errors"] == []


@needs_chrome
def test_value_over_the_max_is_a_blocking_range_error():
    r = validate([["07116", "30", "10"]])
    assert [e["type"] for e in r["errors"]] == ["RANGE"]
    assert r["errors"][0]["codes"] == ["07116"]


@needs_chrome
def test_negative_value_is_a_range_error():
    assert validate([["07116", "-1", "10"]])["errors"][0]["type"] == "RANGE"


@needs_chrome
def test_matrix_page_uses_the_limit_of_three():
    r = validate([["07112", "3", "4"]], targetKey="desirable",
                 fieldCols={"Q1": 1, "Q2": 2}, maxByField={})
    assert r["errors"][0]["type"] == "RANGE" and r["errors"][0]["codes"] == ["07112"]


@needs_chrome
def test_duplicate_codes_block_and_are_not_silently_resolved():
    """Review Focus 4"""
    r = validate([["07112", "18", "15"], ["07112", "10", "10"], ["07113", "19", "16"]])
    dup = [e for e in r["errors"] if e["type"] == "DUP"]
    assert dup and dup[0]["codes"] == ["07112"]


@needs_chrome
def test_blank_code_rows_are_ignored_and_counted():
    r = validate([["07112", "18", "15"], ["", "", ""], ["", "5", ""]])
    assert r["counts"]["students"] == 1
    assert r["counts"]["ignored"] == 2
    assert any("ไม่มีรหัส" in w for w in r["warnings"])


@needs_chrome
def test_non_numeric_code_rows_are_skipped_with_a_warning():
    r = validate([["เฉลี่ย", "18", "15"], ["07112", "18", "15"]])
    assert [s["code"] for s in r["students"]] == ["07112"]
    assert any("ไม่ใช่ตัวเลข" in w for w in r["warnings"])


@needs_chrome
def test_missing_configuration_is_reported_as_cfg_errors():
    assert validate([["1", "2"]], codeCol=-1)["errors"][0]["type"] == "CFG"
    assert validate([["1", "2"]], fieldCols={})["errors"][0]["type"] == "CFG"


@needs_chrome
def test_no_usable_student_is_an_empty_error():
    r = validate([["07112", "ขส", "ขส"]])
    assert [e["type"] for e in r["errors"]] == ["EMPTY"]


@needs_chrome
def test_field_ids_follow_the_target_order_not_the_column_order():
    r = validate([["07112", "15", "18"]], fieldCols={"Midterm": 1, "S1": 2}, maxByField={})
    assert r["fieldIds"] == ["S1", "Midterm"]
    assert r["students"][0]["values"] == [18, 15]
