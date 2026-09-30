# ช่วยกรอก SGS

เว็บหน้าเดียวให้ครูวาง/เลือกไฟล์ Excel จับคู่คอลัมน์ แล้วกรอกลงหน้า SGS ผ่านบุ๊กมาร์กเล็ต โดยจับคู่ด้วยรหัสนักเรียน
ข้อมูลไม่ออกจากเบราว์เซอร์ (ไม่มีเซิร์ฟเวอร์ CSP ห้ามเชื่อมต่อเครือข่าย)

## พัฒนา
    python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
    .venv/bin/pytest            # ต้องมี Chrome
    .venv/bin/python build.py   # → dist/index.html

## โครงสร้าง
- `src/` โมดูล JavaScript (อ่านตัวเลข, วางข้อความ, .xlsx, จับคู่, ตรวจ, payload, UI)
- `fill/sgs_fill.js` สคริปต์กรอก (แหล่งความจริง — vichakarn ใช้สำเนา)
- `mock-sgs/` หน้า SGS จำลอง (ทดสอบบนหน้าจริงไม่ได้)
- `site/` แม่แบบหน้าเว็บ · `build.py` รวมเป็นไฟล์เดียว

## ออกเวอร์ชันใหม่
แก้ `VERSION` → ทดสอบ → push เข้า `main` (GitHub Pages deploy เอง) → ถ้าสคริปต์กรอกเปลี่ยน
ให้บอกครูให้ลากบุ๊กมาร์กเล็ตใหม่ และรัน `tools/sync_sgs_fill.py` ใน vichakarn

ไม่ใช่เครื่องมือของ สพฐ./SGS · Develop by Kru staeb
