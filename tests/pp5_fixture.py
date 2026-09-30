"""ไฟล์ ปพ.5 จำลอง — โครงเหมือนแม่แบบจริงของโรงเรียน (สำรวจจากไฟล์จริง เฉพาะโครงสร้าง) แต่ข้อมูลสมมุติทั้งหมด

ลักษณะที่ต้องเลียนให้ตรง: หัวตารางอยู่แถว 2 (ไม่ใช่แถว 1) · แถว 5 คือ "คะแนนเต็ม" · นักเรียนเริ่มแถว 7 ·
รหัสเก็บเป็นตัวเลข · ป้ายกำกับ Basic-Data อยู่คอลัมน์ B ค่าอยู่คอลัมน์ C · หัวสะกดผิดตามของจริง ("หลังกลงภาค")
"""

from __future__ import annotations

import base64
import io

import openpyxl

CODES = [10001, 10002, 10003]


def _people(ws, values_of):
    for i, code in enumerate(CODES):
        r = 7 + i
        ws.cell(r, 2, i + 1)
        ws.cell(r, 3, code)                                   # ตัวเลข ไม่ใช่ข้อความ
        ws.cell(r, 4, f"เด็กชายสมมุติ {i + 1}")
        for col, v in values_of(i).items():
            ws.cell(r, col, v)


def build(*, with_final: bool = True, with_basic: bool = True, name_variants: bool = False):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Basic-Data-คำชีแจง"
    if with_basic:
        ws["B4"], ws["C4"] = "ภาคเรียนที่", 1
        ws["B10"], ws["C10"] = "ชั้น", "มัธยมศึกษาปีที่ 1/1"
        ws["B11"], ws["C11"] = "รายวิขา", "คณิตศาสตร์ 1"
        ws["B12"], ws["C12"] = "รหัสวิชา", "ค21101"

    pre = wb.create_sheet("ก่อนกลางภาค-กลางภาค")
    pre["D1"], pre["T1"] = "คะแนนก่อนสอบกลางภาค", "คะแนนกลางภาค"
    for col, text in {2: "เลขที่", 3: "เลขประจำตัว", 4: "ชื่อ  สกุล", 8: "ค1.1  ม.1/2",
                      9: "ค1.1  ม.1/1", 18: "รวม", 20: "ค1.1  ม.1/2", 24: "รวมคะแนน"}.items():
        pre.cell(2, col, text)
    for col, v in {7: "คะแนนเต็ม", 8: 10, 9: 15, 18: 25, 20: 20, 24: 20}.items():
        pre.cell(5, col, v)
    _people(pre, lambda i: {8: 8 + i, 9: 10 + i, 18: 18 + 2 * i, 20: 12 + i, 24: 12 + i})

    post = wb.create_sheet("หลังกลางภาค-ปลายภาค")
    post["D1"], post["T1"] = "คะแนนหลังกลางภาค", "คะแนนปลายภาค"
    for col, text in {2: "เลขที่", 3: "เลขประจำตัว", 4: "ชื่อ  สกุล", 8: "ค2.2  ม.1/1",
                      9: "ค2.2  ม.1/2", 18: "คะแนนหลังกลงภาค", 20: "รวมระหว่างภาค",
                      21: "คะแนนปลายภาค", 22: "คะแนนรวม", 23: "ระดับผลการเรียน"}.items():
        post.cell(2, col, text)
    for col, v in {7: "คะแนน", 8: 15, 9: 10, 18: 25, 20: 70, 21: 30, 22: 100}.items():
        post.cell(5, col, v)
    _people(post, lambda i: {8: 12 + i, 9: 9 + i, 18: 21 + 2 * i, 20: 60 + i,
                             **({21: 20 + i, 22: 80 + i} if with_final else {})})

    ev = wb.create_sheet("คุณลักษณะ-การอ่าน")
    for col, text in {2: "เลขที่", 3: "เลขประจำตัว", 4: "ชื่อ  สกุล", 7: "ตัวชี้วัด", 24: "ผลการประเมิน",
                      33: "ผลรวม", 34: "ผลการประเมิน"}.items():
        ev.cell(2, col, text)
    for k in range(5):
        ev.cell(2, 28 + k, k + 1)                              # AB..AF = ครั้งที่ 1..5
    item_cols = [8, 10, 12, 14, 16, 18, 20, 22]                # H J L N P R T V (เซลล์ merge เป็นคู่)
    ev.cell(5, 7, "คะแนน")
    for c in item_cols:
        ev.cell(2, c, f"หัวข้อ {c}")
        ev.cell(5, c, 3)
    _people(ev, lambda i: {**{c: 3 - ((i + j) % 2) for j, c in enumerate(item_cols)},
                           24: 3, 28: 2, 29: 2, 30: 3, 33: 2.3333333333333335, 34: 2})
    wb.create_sheet("ปกหลัง")
    return wb


def to_b64(wb) -> str:
    buf = io.BytesIO()
    wb.save(buf)
    return base64.b64encode(buf.getvalue()).decode()
