import json

from tests.chrome import run_js
from tests.conftest import needs_chrome

TEXT = ("text",)
PARSE = ("text", "parse")


@needs_chrome
def test_numbers_thai_digits_decimal_comma_and_spaces():
    """Review Focus 2: อ่านได้ถูก และตีความไม่ได้ต้องเป็น null ไม่ใช่เดา"""
    out = run_js(
        "return ['๑๒','12,5',' 18 ','1,250','ขส','','-','3.5','-2','1e3'].map(SF.parseNumber);",
        modules=TEXT,
    )
    assert out == [12, 12.5, 18, None, None, None, None, 3.5, -2, None]


@needs_chrome
def test_blank_and_round_half_up():
    out = run_js("return [SF.isBlank(null), SF.isBlank('  '), SF.isBlank('0'), "
                 "SF.roundHalfUp(2.5), SF.roundHalfUp(1.49), SF.roundHalfUp(1.5)];", modules=TEXT)
    assert out == [True, True, False, 3, 1, 2]


def parse(text: str):
    return run_js("return SF.parseDelimited(%s);" % json.dumps(text), modules=PARSE)


@needs_chrome
def test_tsv_with_bom_crlf_and_trailing_blank_lines():
    """Review Focus 5"""
    rows = parse("﻿รหัส\tคะแนน\r\n07112\t18\r\n07113\t20\r\n\r\n")
    assert rows == [["รหัส", "คะแนน"], ["07112", "18"], ["07113", "20"]]


@needs_chrome
def test_quoted_cells_with_newline_tab_and_escaped_quote():
    rows = parse('a\t"x\ty\nz"\t"he said ""hi"""\n')
    assert rows == [["a", "x\ty\nz", 'he said "hi"']]


@needs_chrome
def test_csv_when_the_first_line_has_no_tab():
    assert parse("รหัส,ก่อนกลาง\n07112,18\n") == [["รหัส", "ก่อนกลาง"], ["07112", "18"]]


@needs_chrome
def test_empty_cells_are_kept_so_columns_stay_aligned():
    assert parse("a\t\tc\n\tb\t\n") == [["a", "", "c"], ["", "b", ""]]
