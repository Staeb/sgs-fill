from tests.conftest import needs_chrome
from tests.fill_harness import CODES, failed, mock_sgs, run_on_mock, score_payload

MANY = [f"{10000 + i}" for i in range(24)]


# ── พฤติกรรมเดิมที่ต้องคงไว้ (สัญญาความปลอดภัย) ──

@needs_chrome
def test_strict_perfect_match_fills_by_code_even_when_the_page_order_differs():
    out = run_on_mock(mock_sgs.render(["10003", "10001", "10002"]), score_payload())
    assert out["result"]["canFill"] is True
    assert out["values"]["10001"][:2] == ["20", "15"]
    assert out["values"]["10003"][:2] == ["22", "17"]
    assert "อ่านกลับตรงทุกช่อง" in out["message"]


@needs_chrome
def test_strict_mode_blocks_on_a_missing_or_extra_code_and_fills_nothing():
    out = run_on_mock(mock_sgs.render(["10001", "10002"]), score_payload())
    assert out["result"]["canFill"] is False
    assert all(v[0] == "" for v in out["values"].values())
    out = run_on_mock(mock_sgs.render(CODES + ["10099"]), score_payload())
    assert out["result"]["canFill"] is False


@needs_chrome
def test_wrong_section_closed_page_and_wrong_max_still_block():
    assert run_on_mock(mock_sgs.render(CODES, section="2"), score_payload())["result"]["canFill"] is False
    assert run_on_mock(mock_sgs.render(CODES, open_phase="none"), score_payload())["result"]["canFill"] is False
    assert run_on_mock(mock_sgs.render(CODES, maxes={"S1": 30}), score_payload())["result"]["canFill"] is False


@needs_chrome
def test_rows_hidden_on_the_next_page_block_with_the_fix_in_plain_words():
    out = run_on_mock(mock_sgs.render(MANY, visible_rows=10), score_payload(MANY))
    assert out["result"]["canFill"] is False
    bad = [i for i in out["result"]["items"] if not i["ok"]]
    assert any("ยังแสดงไม่ครบ" in i["label"] for i in bad)
    assert any("จำนวนแถวต่อหน้า" in i["detail"] for i in bad)
    assert all(v[0] == "" for v in out["values"].values())


# ── พฤติกรรมใหม่ v2 ──

@needs_chrome
def test_lenient_mode_fills_the_codes_it_finds_and_reports_the_rest_as_warnings():
    """Review Focus 4: ไฟล์มีหลายห้อง — ไม่บล็อก แต่บอกจำนวนที่ไม่อยู่บน SGS"""
    payload = score_payload(CODES + ["20001", "20002"], strict=False)
    out = run_on_mock(mock_sgs.render(["10002", "10001", "10003", "10004"]), payload)
    assert out["result"]["canFill"] is True
    assert out["values"]["10001"][:2] == ["20", "15"]
    assert out["values"]["10004"][0] == "", "แถวบน SGS ที่ไม่มีข้อมูลต้องว่าง"
    labels = [i["label"] for i in out["result"]["items"] if not i["ok"]]
    assert any("ไม่อยู่บน SGS 2 คน" in x for x in labels)
    assert any("ไม่มีข้อมูล 1 คน" in x for x in labels)


@needs_chrome
def test_lenient_mode_still_blocks_when_no_code_matches():
    payload = score_payload(["20001", "20002"], strict=False)
    out = run_on_mock(mock_sgs.render(CODES), payload)
    assert out["result"]["canFill"] is False
    assert all(v[0] == "" for v in out["values"].values())


@needs_chrome
def test_subject_and_section_are_optional_but_the_teacher_is_warned():
    payload = score_payload(strict=False, subject="", section="")
    out = run_on_mock(mock_sgs.render(CODES), payload)
    assert out["result"]["canFill"] is True
    warned = [i for i in out["result"]["items"] if not i["ok"] and not i["blocking"]]
    assert any("ไม่ได้ระบุรหัสวิชา" in i["label"] for i in warned)
    assert any("ไม่ได้ระบุกลุ่ม" in i["label"] for i in warned)


@needs_chrome
def test_a_wrong_subject_still_blocks_when_one_is_given():
    out = run_on_mock(mock_sgs.render(CODES, subject="ค30205 คณิตศาสตร์ ม.6"),
                      score_payload(strict=False))
    assert out["result"]["canFill"] is False


@needs_chrome
def test_max_is_optional_and_the_page_max_is_used_to_block_bigger_values():
    fields = [{"id": "S1"}, {"id": "Midterm"}]
    ok = run_on_mock(mock_sgs.render(CODES), score_payload(fields=fields, strict=False))
    assert ok["result"]["canFill"] is True

    big = score_payload(fields=fields, strict=False)
    big["students"][0]["values"] = [26, 15]                       # SGS S1 เต็ม 25
    out = run_on_mock(mock_sgs.render(CODES), big)
    assert out["result"]["canFill"] is False
    assert any("เกินคะแนนเต็ม" in x for x in failed(out))
    assert all(v[0] == "" for v in out["values"].values())


@needs_chrome
def test_script_source_carries_the_version_token_for_the_build_to_fill():
    from tests.fill_harness import SCRIPT
    assert "__SCRIPT_VERSION__" in SCRIPT.read_text(encoding="utf-8")
    out = run_on_mock(mock_sgs.render(CODES), score_payload())
    assert out["result"] is not None


@needs_chrome
def test_a_payload_that_needs_a_newer_script_is_refused_before_touching_the_page():
    out = run_on_mock(mock_sgs.render(CODES), score_payload(min_script_version="99.0.0"))
    assert out["result"] is None
    assert all(v[0] == "" for v in out["values"].values())


# ── หน้าแบบตารางช่อง ──

def matrix_payload(codes=CODES, **over):
    p = score_payload(codes, kind="matrix", page_label="บันทึก คุณลักษณะอันพึงประสงค์",
                      subject="ค20201", phase="desirable", phase_label="คุณลักษณะอันพึงประสงค์",
                      fields=[{"id": f"Q{i}"} for i in range(1, 9)], blank=["Q9", "Q10"], limit=3,
                      strict=False)
    p["students"] = [{"code": c, "values": [3, 3, 2, 2, 3, 1, 3, 3]} for c in codes]
    p.update(over)
    return p


@needs_chrome
def test_matrix_page_fills_q1_to_q8_and_leaves_q9_q10_empty():
    out = run_on_mock(mock_sgs.render_matrix(["10003", "10001", "10002"]), matrix_payload())
    assert out["result"]["canFill"] is True
    v = out["values"]["10001"]
    assert v[5] == "3" and v[6] == "3" and v[7] == "3"
    assert v[8] == "" and v[9] == ""


@needs_chrome
def test_matrix_page_limit_lower_than_ours_blocks():
    out = run_on_mock(mock_sgs.render_matrix(CODES, limit=2), matrix_payload())
    assert out["result"]["canFill"] is False


@needs_chrome
def test_reading_page_fills_five_fields_by_student_code_header():
    p = matrix_payload(phase="reading", phase_label="การอ่าน คิดวิเคราะห์ และเขียน",
                       page_label="บันทึก การอ่าน คิดวิเคราะห์ และเขียน", subject="ค20201",
                       fields=[{"id": f"L{i}"} for i in range(1, 6)], blank=[])
    p["students"] = [{"code": c, "values": [1, 2, 2, 2, 2]} for c in CODES]
    out = run_on_mock(mock_sgs.render_matrix(CODES, page="reading"), p)
    assert out["result"]["canFill"] is True
    assert out["values"]["10001"][10:15] == ["1", "2", "2", "2", "2"]
    assert out["values"]["10001"][15] == "", "ช่องผลการประเมินให้ SGS เติมเอง ห้ามแตะ"


# ── Final review, Important 1: มีช่องเดียวที่จับคู่ก็ต้องหาแถวนักเรียนเจอ ──

@needs_chrome
def test_a_payload_with_only_the_final_field_fills_by_code():
    p = score_payload(fields=[{"id": "Final"}], strict=False)
    p["students"] = [{"code": c, "values": [25 + i]} for i, c in enumerate(CODES)]
    out = run_on_mock(mock_sgs.render(["10003", "10001", "10002"], open_phase="post"), p)
    assert out["result"]["canFill"] is True, [i for i in out["result"]["items"] if not i["ok"]]
    assert out["values"]["10001"][3] == "25" and out["values"]["10003"][3] == "27"


@needs_chrome
def test_a_payload_with_only_s1_fills_by_code():
    p = score_payload(fields=[{"id": "S1"}], strict=False)
    p["students"] = [{"code": c, "values": [20 + i]} for i, c in enumerate(CODES)]
    out = run_on_mock(mock_sgs.render(CODES), p)
    assert out["result"]["canFill"] is True
    assert out["values"]["10002"][0] == "21"


@needs_chrome
def test_a_matrix_payload_with_only_q1_fills_by_code():
    p = matrix_payload(fields=[{"id": "Q1"}], blank=[f"Q{i}" for i in range(2, 11)])
    p["students"] = [{"code": c, "values": [2]} for c in CODES]
    out = run_on_mock(mock_sgs.render_matrix(CODES), p)
    assert out["result"]["canFill"] is True
    assert out["values"]["10001"][5] == "2" and out["values"]["10001"][6] == ""


# ── Final review, Important 5: ข้อความบนแผงต้องเป็นกลาง ไม่พาครูสาธารณะไป "vk web" ──

def test_failure_panel_wording_is_neutral_for_public_users():
    from tests.fill_harness import SCRIPT
    src = SCRIPT.read_text(encoding="utf-8")
    assert "vk web" not in src and "/sgs" not in src
