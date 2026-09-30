var SF = SF || {};

(function () {
  SF.normalizeCode = function (raw, pad) {
    var s = SF.normalizeDigits(String(raw === undefined || raw === null ? '' : raw)).trim();
    if (/^\d+\.0+$/.test(s)) { s = s.replace(/\.0+$/, ''); }
    if (/^\d+$/.test(s) && pad > 0 && s.length < pad) {
      s = new Array(pad - s.length + 1).join('0') + s;
    }
    return s;
  };

  /* สถิติของคอลัมน์หนึ่ง ให้ครูเห็นว่าคอลัมน์ที่จับคู่ไว้หน้าตาเป็นอย่างไร (ตัวอย่างค่า ต่ำสุด–สูงสุด)
     กันกรณีจับคู่ผิดคอลัมน์ที่ยังผ่านการตรวจเพราะค่าไม่เกินคะแนนเต็ม */
  SF.columnStats = function (dataRows, col) {
    var nums = [];
    var sample = [];
    dataRows.forEach(function (row) {
      var cell = row[col];
      if (SF.isBlank(cell)) { return; }
      if (sample.length < 3) { sample.push(String(cell).trim()); }
      var n = SF.parseNumber(cell);
      if (n !== null) { nums.push(n); }
    });
    return {
      numbers: nums.length,
      min: nums.length ? Math.min.apply(null, nums) : null,
      max: nums.length ? Math.max.apply(null, nums) : null,
      sample: sample
    };
  };

  function uniq(list) { return list.filter(function (x, i) { return list.indexOf(x) === i; }); }

  SF.validate = function (dataRows, cfg) {
    var target = SF.TARGETS[cfg.targetKey];
    var result = {
      fieldIds: [], students: [], incomplete: [], errors: [], warnings: [],
      counts: { rows: dataRows.length, students: 0, incomplete: 0, ignored: 0 }
    };
    var fieldIds = target.fields
      .map(function (f) { return f.id; })
      .filter(function (id) { return cfg.fieldCols[id] !== undefined && cfg.fieldCols[id] >= 0; });
    result.fieldIds = fieldIds;
    if (cfg.codeCol === undefined || cfg.codeCol < 0) {
      result.errors.push({ type: 'CFG', message: 'ยังไม่ได้เลือกคอลัมน์รหัสนักเรียน' });
    }
    if (!fieldIds.length) {
      result.errors.push({ type: 'CFG', message: 'ยังไม่ได้เลือกคอลัมน์คะแนน/ค่าสำหรับช่อง SGS ใดเลย' });
    }
    if (result.errors.length) { return result; }

    var seen = {};
    var dupes = [];
    var over = [];
    var longDecimals = [];
    var noCode = 0;
    var subHeader = false;
    var badCode = 0;

    dataRows.forEach(function (row) {
      var raw = row[cfg.codeCol];
      var hasOther = fieldIds.some(function (id) { return !SF.isBlank(row[cfg.fieldCols[id]]); });
      if (SF.isBlank(raw)) {
        if (hasOther) {
          noCode++;
          if (fieldIds.some(function (id) {
            var c = row[cfg.fieldCols[id]];
            return !SF.isBlank(c) && SF.parseNumber(c) === null;
          })) { subHeader = true; }
        }
        result.counts.ignored++;
        return;
      }
      var code = SF.normalizeCode(raw, cfg.pad || 0);
      if (!/^\d+$/.test(code)) { badCode++; result.counts.ignored++; return; }
      if (seen[code]) { dupes.push(code); return; }
      seen[code] = true;

      var values = [];
      var problems = [];
      fieldIds.forEach(function (id) {
        var cell = row[cfg.fieldCols[id]];
        if (SF.isBlank(cell)) { problems.push(id + ': ช่องว่าง'); values.push(null); return; }
        var n = SF.parseNumber(cell);
        if (n === null) { problems.push(id + ': "' + String(cell).trim() + '" ไม่ใช่ตัวเลข'); values.push(null); return; }
        var limit = target.kind === 'matrix' ? target.limit : (cfg.maxByField || {})[id];
        if (n < 0 || (typeof limit === 'number' && n > limit)) { over.push(code); }
        if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) { longDecimals.push(code); }
        values.push(n);
      });
      if (problems.length) { result.incomplete.push({ code: code, problems: problems }); }
      else { result.students.push({ code: code, values: values }); }
    });

    if (noCode) { result.warnings.push('มี ' + noCode + ' แถวที่มีข้อมูลแต่ไม่มีรหัสนักเรียน (ข้ามแถวเหล่านี้)'); }
    if (subHeader) {
      result.warnings.push('มีแถวที่ไม่มีรหัสแต่มีข้อความในคอลัมน์คะแนน (เช่น "งาน1") — ถ้านี่คือหัวตารางชั้นที่สอง ' +
        'ให้เลือก "แถวหัวตาราง" เป็นแถวถัดไป มิฉะนั้นคอลัมน์ที่จับคู่อาจเป็นคะแนนย่อย ไม่ใช่คะแนนรวมของช่วง');
    }
    if (badCode) { result.warnings.push('มี ' + badCode + ' แถวที่รหัสไม่ใช่ตัวเลข (ข้ามแถวเหล่านี้)'); }
    if (dupes.length) {
      result.errors.push({ type: 'DUP', codes: uniq(dupes),
        message: 'รหัสซ้ำในไฟล์ ' + uniq(dupes).length + ' รหัส — แก้ไฟล์ให้แต่ละรหัสมีแถวเดียว' });
    }
    if (over.length) {
      result.errors.push({ type: 'RANGE', codes: uniq(over),
        message: 'มีค่าติดลบหรือเกินคะแนนเต็ม/ค่าสูงสุดที่ SGS รับ ' + uniq(over).length + ' คน' });
    }
    if (longDecimals.length) {
      result.errors.push({ type: 'DECIMALS', codes: uniq(longDecimals),
        message: 'มีค่าที่ทศนิยมเกิน 2 ตำแหน่ง ' + uniq(longDecimals).length +
          ' คน — Excel อาจแสดงปัดเศษไว้ แต่ค่าจริงยาวกว่านั้น ปัดเศษในไฟล์ก่อนแล้วนำเข้าใหม่' });
    }
    fieldIds.forEach(function (id) {
      var full = (cfg.maxByField || {})[id];
      if (typeof full !== 'number') { return; }
      var s = SF.columnStats(dataRows, cfg.fieldCols[id]);
      if (s.max !== null && s.max < full * 0.5) {
        result.warnings.push('ช่อง ' + id + ': ค่าสูงสุดในคอลัมน์คือ ' + s.max + ' แต่คะแนนเต็ม ' + full +
          ' — เลือกคอลัมน์ผิดหรือไม่?');
      }
    });
    result.counts.students = result.students.length;
    result.counts.incomplete = result.incomplete.length;
    if (!result.students.length && !result.errors.length) {
      result.errors.push({ type: 'EMPTY', message: 'ไม่มีนักเรียนที่ข้อมูลครบสักคน — ตรวจการจับคู่คอลัมน์' });
    }
    return result;
  };
})();
